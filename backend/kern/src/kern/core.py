#!/usr/bin/env python3
"""
stdlib-only logging library.

Key capabilities:
- Strict JSON logs (ISO-8601 with ms + TZ), safe value truncation, structured exception stacks.
- Context propagation via contextvars + context manager (trace/span/correlation).
- Idempotent init + atomic handler swaps; no private logging internals touched.
- Non-blocking queue with explicit shedding (drop-oldest/drop-newest) and accurate atomic depth.
- Robust streaming over TCP/TLS with injectable framing:
    * v1: magic/version/len/crc32(payload optional) + payload
    * len: legacy 4-byte length prefix
  Supports protocol preference list (fallback negotiation).
- TLS controls: enable, enforce, configurable minimum version; enforce=true fails fast only for TLS setup.
  Runtime send/connect errors always degrade with exponential backoff (configurable).
- Hot-reload root AND per-logger levels from K8s file and JSON control-plane; watcher error noise uses backoff.
- Clear configuration validation; consistent LOG_* env naming (with deprecation notices).
- Introspection API: health snapshot (emitted/dropped/queue depth/backoff/last errors), streaming health flags.
"""

from __future__ import annotations

import contextlib
import contextvars
import json
import logging
import logging.handlers as lh
import os
from queue import Queue
import queue
import random
import socket
import ssl
import struct
import sys
import threading
import time
import traceback
import zlib
from dataclasses import dataclass, fields, replace
from datetime import datetime, timezone
from typing import Dict, Iterable, Optional, Tuple, List, DefaultDict
from zoneinfo import ZoneInfo
from collections import deque

try:
    import orjson as _orjson
except Exception:
    _orjson = None


__all__ = [
    "LoggingSettings",
    "init_logging",
    "init_simple_logging",
    "flush_and_drain",
    "shutdown_logging",
    "set_log_level",
    "set_trace_context",
    "clear_trace_context",
    "trace_context",
    "get_log_stats",
    "is_streaming_enabled",
    "is_streaming_healthy",
    "FastEventLogger",
]

# --------------------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------------------
APP_NAME = os.getenv("APP_NAME", "kern")
HOSTNAME = socket.gethostname()
ADP_LOG_SCHEMA_VERSION = "1.0.0"
LOG_LINE_SEPARATOR = "_ls_"
LOG_LEVEL_FILENAME = "LOG_LEVEL"

MINIMAL_PAYLOAD_BASE = {
    "version": ADP_LOG_SCHEMA_VERSION, "severity": "ERROR", "service_id": APP_NAME, "message": "formatter serialization error"
}

# Streaming protocols
PROTO_LEN = "len"  # 4-byte length prefix
PROTO_V1 = "v1"    # 'JL'(2B)+version(1B)+len(4B)+crc32(4B)+payload

# Tunables / magic numbers (documented)
SENDER_TIMEOUT_SEC = 0.2         # Max wait for first record in sender loop
BATCH_SIZE_LIMIT = 32            # Max records batched per network write
FLUSH_POLL_INTERVAL_SEC = 0.05   # Sleep between flush checks
RECONCILE_INTERVAL_SEC = 0.5     # Queue depth reconcile period

# Singleton locks (thread-safe lazy init)
_MANAGER_LOCK = threading.Lock()
_STATS_LOCK = threading.Lock()

# Security limits
MAX_STATIC_EXTRAS_BYTES = 64 * 1024  # 64 KiB cap for env-provided JSON extras

# --------------------------------------------------------------------------------------
# Context
# --------------------------------------------------------------------------------------

_LOGGER = logging.getLogger(APP_NAME)

_TRACE_ID: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("trace_id", default=None)
_SPAN_ID: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("span_id", default=None)
_CORR_ID: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("correlation_id", default=None)

# --------------------------------------------------------------------------------------
# Utilities
# --------------------------------------------------------------------------------------

def _coerce_bool(s: Optional[str], default: bool) -> bool:
    if s is None:
        return default
    t = s.strip().lower()
    if t in {"1", "true", "t", "yes", "y", "on"}:
        return True
    if t in {"0", "false", "f", "no", "n", "off"}:
        return False
    return default

def _coerce_int(s: Optional[str], default: int) -> int:
    if s is None:
        return default
    try:
        return int(s.strip())
    except (ValueError, TypeError):
        return default

def _coerce_float(s: Optional[str], default: float) -> float:
    if s is None:
        return default
    try:
        return float(s.strip())
    except (ValueError, TypeError):
        return default

def _coerce_level(value: Optional[str | int], default: int) -> int:
    if isinstance(value, int):
        return value
    if not value:
        return default
    name = str(value).strip().upper()
    mapping = getattr(logging, "getLevelNamesMapping", lambda: {})()
    if mapping:
        return int(mapping.get(name, default))
    const = getattr(logging, name, None)
    if isinstance(const, int):
        return const
    # logging.getLevelName returns "Level N" for unknown; only accept ints
    lvl = logging.getLevelName(name)
    if isinstance(lvl, int): return lvl
    _log_throttled(logging.WARNING, "invalid_level", "[logging] Invalid log level '%s'; using default %s", name, logging.getLevelName(default))
    return default


def _tls_version_from_str(s: str, default: "ssl.TLSVersion") -> "ssl.TLSVersion":
    t = (s or "").strip().upper().replace("TLSV", "").replace("TLS_", "").replace("TLS", "")
    norm = t.replace("_", ".")
    mapping = {
        "1": getattr(ssl.TLSVersion, "TLSv1", default),
        "1.0": getattr(ssl.TLSVersion, "TLSv1", default),
        "1.1": getattr(ssl.TLSVersion, "TLSv1_1", default),
        "1.2": getattr(ssl.TLSVersion, "TLSv1_2", default),
        "1.3": getattr(ssl.TLSVersion, "TLSv1_3", default),
    }
    return mapping.get(norm, default)

def _env_first(keys: Iterable[str]) -> Optional[str]:
    for k in keys:
        v = os.getenv(k)
        if v is not None:
            if k in {"LOG_TRANSFORMER_SERVICE_HOST", "LOG_TRANSFORMER_SERVICE_PORT_JSON"}:
                _log_throttled(logging.WARNING, "deprecated_env", "deprecated env var used: %s", k)
            return v
    return None

# --------------------------------------------------------------------------------------
# Throttle
# --------------------------------------------------------------------------------------

class _Throttle:
    def __init__(self):
        self._last: Dict[str, float] = {}
        self._lock = threading.Lock()
    def allow(self, key: str, every_sec: float) -> bool:
        now = time.time()
        with self._lock:
            prev = self._last.get(key, 0.0)
            if now - prev >= every_sec:
                self._last[key] = now
                return True
            return False

_THROTTLE_INSTANCE: Optional[_Throttle] = None
def _throttle() -> _Throttle:
    global _THROTTLE_INSTANCE
    if _THROTTLE_INSTANCE is None:
        _THROTTLE_INSTANCE = _Throttle()
    return _THROTTLE_INSTANCE

def _log_throttled(level: int, key: str, msg: str, *args) -> None:
    if _throttle().allow(key, every_sec=60.0):
        _LOGGER.log(level, msg, *args)

# --------------------------------------------------------------------------------------
# Introspection / atomic counters
# --------------------------------------------------------------------------------------

class _AtomicInt:
    def __init__(self, initial: int = 0):
        self._n = int(initial)
        self._lock = threading.Lock()
    def inc(self, k: int = 1) -> int:
        with self._lock:
            self._n += k
            return self._n
    def dec(self, k: int = 1) -> int:
        with self._lock:
            self._n -= k
            if self._n < 0:
                self._n = 0
            return self._n
    def get(self) -> int:
        with self._lock:
            return self._n
    def set(self, v: int) -> None:
        with self._lock:
            self._n = max(0, int(v))


class _Stats:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._emitted = 0
        self._dropped = 0
        self._dropped_by_level: DefaultDict[int, int] = DefaultDict(int)
        self._ingest_max = 0
        self._ingest_cur = _AtomicInt(0)
        self._net_cur = _AtomicInt(0)
        self._stream_failures = 0
        self._last_stream_error: Optional[str] = None
        self._backoff_seconds = 0.0
        self._last_stream_ok_at: Optional[float] = None
        self._watcher_heartbeat_at: Optional[float] = None

    def inc_dropped_by_level(self, levelno: int, n: int = 1) -> None:
        with self._lock:
            self._dropped += n
            self._dropped_by_level[levelno] += n

    def inc_emitted(self, n: int = 1) -> None:
        with self._lock:
            self._emitted += n

    def inc_dropped(self, n: int = 1) -> None:
        with self._lock:
            self._dropped += n

    # ---- ingest depth (QueueHandler -> QueueListener) ----
    def ingest_inc(self) -> None:
        cur = self._ingest_cur.inc(1)
        with self._lock:
            if cur > self._ingest_max:
                self._ingest_max = cur

    def ingest_dec(self) -> None:
        self._ingest_cur.dec(1)

    def set_ingest_depth(self, value: int) -> None:
        self._ingest_cur.set(value)
        with self._lock:
            self._ingest_max = max(self._ingest_max, self._ingest_cur.get())

    def net_inc(self) -> None:
        self._net_cur.inc(1)

    def net_dec(self) -> None:
        self._net_cur.dec(1)

    def set_net_depth(self, value: int) -> None:
        self._net_cur.set(value)

    def inc_stream_fail(self, msg: str) -> None:
        with self._lock:
            self._stream_failures += 1
            self._last_stream_error = msg

    def set_backoff(self, seconds: float) -> None:
        with self._lock:
            self._backoff_seconds = max(0.0, float(seconds))

    def mark_stream_ok(self) -> None:
        with self._lock:
            self._last_stream_ok_at = time.time()
            self._last_stream_error = None
            self._backoff_seconds = 0.0

    def mark_watcher_heartbeat(self) -> None:
        with self._lock:
            self._watcher_heartbeat_at = time.time()

    def inc_missing_severity(self) -> None:
        with self._lock:
            self._missing_severity = getattr(self, "_missing_severity", 0) + 1

    def snapshot(self) -> Dict[str, object]:
        with self._lock:
            return {
                "emitted_lines": self._emitted,
                "dropped_lines": self._dropped,
                "dropped_by_severity": dict(self._dropped_by_level),
                "queue_ingest_max_depth": self._ingest_max,
                "queue_ingest_cur_depth": self._ingest_cur.get(),
                "queue_net_cur_depth": self._net_cur.get(),
                "queue_cur_depth_total": self._ingest_cur.get() + self._net_cur.get(),
                "stream_connect_failures": self._stream_failures,
                "last_stream_error": self._last_stream_error,
                "current_backoff_seconds": self._backoff_seconds,
                "last_stream_ok_at": self._last_stream_ok_at,
                "watcher_heartbeat_at": self._watcher_heartbeat_at,
                "missing_severity_events": getattr(self, "_missing_severity", 0),
            }

_STATS_INSTANCE: Optional[_Stats] = None
def _stats() -> _Stats:
    global _STATS_INSTANCE
    # Thread-safe singleton init
    if _STATS_INSTANCE is None:
        with _STATS_LOCK:
            if _STATS_INSTANCE is None:
                _STATS_INSTANCE = _Stats()
    return _STATS_INSTANCE

def get_log_stats() -> Dict[str, object]:
    return _stats().snapshot()

def is_streaming_enabled() -> bool:
    mgr = _manager()
    return bool(mgr and mgr.settings and mgr.settings.log_stream)

def is_streaming_healthy() -> bool:
    snap = get_log_stats()
    return (snap["last_stream_error"] is None) or (snap["current_backoff_seconds"] == 0.0)

# --------------------------------------------------------------------------------------
# Backoff
# --------------------------------------------------------------------------------------

class _Backoff:
    def __init__(self, base: float, factor: float, jitter: float, max_delay: float):
        self._base = max(0.0, base)
        self._factor = max(1.0, factor)
        self._jitter = max(0.0, jitter)
        self._max = max(0.0, max_delay)
        self._delay = 0.0
        self._lock = threading.Lock()

    def on_success(self) -> None:
        with self._lock:
            self._delay = 0.0

    def on_error(self) -> float:
        with self._lock:
            self._delay = self._base if self._delay == 0.0 else min(self._delay * self._factor, self._max)
            if self._jitter > 0:
                delta = self._delay * self._jitter
                self._delay = max(0.0, self._delay + random.uniform(-delta, delta))
            return self._delay

    def current(self) -> float:
        with self._lock:
            return self._delay

# --------------------------------------------------------------------------------------
# Settings (grouped/nested) & validation
# --------------------------------------------------------------------------------------

@dataclass(frozen=True)
class BackoffSettings:
    """Exponential backoff parameters."""
    base: float = 0.5
    factor: float = 2.0
    jitter: float = 0.2
    max_delay: float = 30.0

    def validate(self, name: str) -> None:
        if self.base < 0.1:
            raise ValueError(f"{name}.base must be >= 0.1")
        if self.factor < 1.5:
            raise ValueError(f"{name}.factor must be >= 1.5")
        if not (0.0 <= self.jitter < 1.0):
            raise ValueError(f"{name}.jitter must be in [0.0,1.0)")
        if self.max_delay < self.base:
            raise ValueError(f"{name}.max_delay must be >= base")

@dataclass(frozen=True)
class TLSSettings:
    """TLS configuration for streaming."""
    enabled: bool = False
    enforce: bool = False
    min_version: str = "1.2"
    cert_file: str = "/run/secrets/lt-client-cert/clicert.pem"
    key_file: str = "/run/secrets/lt-client-cert/cliprivkey.pem"
    ca_file: str = "/run/secrets/lt-root-ca-cert/cacertbundle.pem"

@dataclass(frozen=True)
class WatcherSettings:
    """Hot-reload watcher for log levels."""
    enabled: bool = True
    refresh_time: int = 5
    k8s_path: str = "/etc/config"
    control_file: str = "/etc/logcontrol.json"
    backoff: BackoffSettings = BackoffSettings(base=2.0, factor=2.0, jitter=0.2, max_delay=120.0)

@dataclass(frozen=True)
class LoggingSettings:
    # Grouped settings
    watcher: WatcherSettings = WatcherSettings()
    tls: TLSSettings = TLSSettings()
    stream_backoff: BackoffSettings = BackoffSettings()

    # Observability
    stats_report_interval_sec: int = 0  # 0=disabled; >0 emits periodic snapshots
    shutdown_timeout_sec: float = 10.0  # max wait to drain before stopping listener

    # Identity
    container_name: str = "sovereign-individual"

    # Output selection
    log_stdout: bool = True
    log_stderr: bool = False
    log_stream: bool = False

    # Base level
    log_level: int = logging.INFO

    # Network / protocol
    log_stream_host: str = "log-transformer"
    log_stream_tcp_port: int = 5025
    log_stream_tls_port: int = 5024
    log_stream_protocols: str = "v1,len"  # preference order, comma-separated
    protocol_crc32: bool = True           # enable CRC32 for v1 (disable to reduce CPU)
    connect_timeout_sec: float = 5.0

    # Queue
    max_queue_size: int = 5000
    drop_oldest_on_full: bool = True  # True=drop oldest, False=drop newest

    # Time / formatting
    tz_name: str = os.getenv("TZ", "UTC")
    use_time_ns: bool = True
    max_extra_value_chars: int = 2048
    max_stack_chars: int = 16384

    # Extra fields env var (renamed for clarity)
    static_fields_json_env_var: str = "LOG_EXTRA_FIELDS"

    # Structured extras behavior
    preserve_structured_extras: bool = False

    log_file: Optional[str] = None
    log_rotate_max_bytes: int = 10 * 1024 * 1024  # 10MB
    log_rotate_backup_count: int = 5

    # --- perf & behavior toggles ---
    fast_time: bool = True
    use_orjson_if_available: bool = True
    dynamic_batching: bool = True
    eager_connect: bool = True
    pre_error_buffer_size: int = 64
    pre_error_buffer_level: int = logging.DEBUG

    @staticmethod
    def from_env() -> "LoggingSettings":
        base = LoggingSettings()

        # ---- Top-level helpers
        def pick(envs, coerce, default):
            raw = _env_first(envs)
            return coerce(raw, default) if raw is not None else default

        # ---- Watcher (with backoff)
        w_backoff = BackoffSettings(
            base=pick(["LOG_WATCHER_BACKOFF_BASE"], _coerce_float, base.watcher.backoff.base),
            factor=pick(["LOG_WATCHER_BACKOFF_FACTOR"], _coerce_float, base.watcher.backoff.factor),
            jitter=pick(["LOG_WATCHER_BACKOFF_JITTER"], _coerce_float, base.watcher.backoff.jitter),
            max_delay=pick(["LOG_WATCHER_BACKOFF_MAX"], _coerce_float, base.watcher.backoff.max_delay),
        )
        watcher = WatcherSettings(
            enabled=pick(["WATCH_LOG_CONF"], _coerce_bool, base.watcher.enabled),
            refresh_time=pick(["LOG_REFRESH_TIME"], _coerce_int, base.watcher.refresh_time),
            k8s_path=pick(["LOG_CONF_K8S_PATH"], lambda s, d: s or d, base.watcher.k8s_path),
            control_file=pick(["LOG_CONTROL"], lambda s, d: s or d, base.watcher.control_file),
            backoff=w_backoff,
        )

        # ---- TLS
        tls = TLSSettings(
            enabled=pick(["LOG_STREAM_TLS_ENABLED", "TLS_ENABLED", "DATA_NAME_SERVICE_PF_TLS"], _coerce_bool, base.tls.enabled),
            enforce=pick(["LOG_STREAM_ENFORCE_TLS", "ENFORCE_TLS"], _coerce_bool, base.tls.enforce),
            min_version=pick(["LOG_STREAM_TLS_MIN_VERSION", "TLS_MIN_VERSION"], lambda s, d: s or d, base.tls.min_version),
            cert_file=pick(["LOG_STREAM_CERT_FILE", "CERT_FILE"], lambda s, d: s or d, base.tls.cert_file),
            key_file=pick(["LOG_STREAM_KEY_FILE", "KEY_FILE"], lambda s, d: s or d, base.tls.key_file),
            ca_file=pick(["LOG_STREAM_CA_FILE", "CA_FILE"], lambda s, d: s or d, base.tls.ca_file),
        )

        # ---- Stream backoff
        s_backoff = BackoffSettings(
            base=pick(["LOG_BACKOFF_BASE"], _coerce_float, base.stream_backoff.base),
            factor=pick(["LOG_BACKOFF_FACTOR"], _coerce_float, base.stream_backoff.factor),
            jitter=pick(["LOG_BACKOFF_JITTER"], _coerce_float, base.stream_backoff.jitter),
            max_delay=pick(["LOG_BACKOFF_MAX_DELAY"], _coerce_float, base.stream_backoff.max_delay),
        )

        # ---- Top-level simple fields
        o: Dict[str, object] = {}
        o["watcher"] = watcher
        o["tls"] = tls
        o["stream_backoff"] = s_backoff

        mapping = {
            # identity
            "container_name": (["CONTAINER_NAME"], lambda s, d: s or d, base.container_name),

            # output
            "log_stdout": (["LOG_STDOUT"], _coerce_bool, base.log_stdout),
            "log_stderr": (["LOG_STDERR"], _coerce_bool, base.log_stderr),
            "log_stream": (["LOG_STREAM"], _coerce_bool, base.log_stream),

            # level
            "log_level": (["LOG_LEVEL"], _coerce_level, base.log_level),

            # network/protocol
            "log_stream_host": (["LOG_STREAM_HOST", "LOG_TRANSFORMER_HOST", "LOG_TRANSFORMER_SERVICE_HOST"], lambda s, d: s or d, base.log_stream_host),
            "log_stream_tcp_port": (["LOG_STREAM_TCP_PORT", "LOG_TRANSFORMER_SERVICE_PORT_JSON"], _coerce_int, base.log_stream_tcp_port),
            "log_stream_tls_port": (["LOG_STREAM_TLS_PORT", "LOG_TRANSFORMER_HOST_TLS_PORT"], _coerce_int, base.log_stream_tls_port),
            "log_stream_protocols": (["LOG_STREAM_PROTOCOLS"], lambda s, d: s or d, base.log_stream_protocols),
            "protocol_crc32": (["LOG_STREAM_PROTOCOL_CRC32"], _coerce_bool, base.protocol_crc32),
            "connect_timeout_sec": (["LOG_STREAM_CONNECT_TIMEOUT_SEC"], _coerce_float, base.connect_timeout_sec),

            # queue
            "max_queue_size": (["LOG_STREAM_MAX_QUEUE_SIZE", "MAX_QUEUE_SIZE"], _coerce_int, base.max_queue_size),
            "drop_oldest_on_full": (["LOG_STREAM_DROP_OLDEST", "DROP_OLDEST_ON_FULL"], _coerce_bool, base.drop_oldest_on_full),

            # time/format
            "tz_name": (["TZ"], lambda s, d: s or d, base.tz_name),
            "use_time_ns": (["LOG_USE_TIME_NS"], _coerce_bool, base.use_time_ns),
            "max_extra_value_chars": (["LOG_MAX_EXTRA_VALUE_CHARS"], _coerce_int, base.max_extra_value_chars),
            "max_stack_chars": (["LOG_MAX_STACK_CHARS"], _coerce_int, base.max_stack_chars),

            # env var name that contains static JSON extras (back-compat with old naming)
            "static_fields_json_env_var": (["LOG_EXTRA_FIELDS_ENV"], lambda s, d: s or d, base.static_fields_json_env_var),

            # periodic stats reporter
            "stats_report_interval_sec": (["LOG_STATS_REPORT_INTERVAL_SEC"], _coerce_int, base.stats_report_interval_sec),
            # structured extras flag
            "preserve_structured_extras": (["LOG_PRESERVE_STRUCTURED_EXTRAS"], _coerce_bool, base.preserve_structured_extras),
            # rotation
            "log_file": (["LOG_FILE"], lambda s, d: s or None, base.log_file),
            "log_rotate_max_bytes": (["LOG_ROTATE_MAX_BYTES"], _coerce_int, base.log_rotate_max_bytes),
            "log_rotate_backup_count": (["LOG_ROTATE_BACKUP_COUNT"], _coerce_int, base.log_rotate_backup_count),

            # perf toggles
            "fast_time": (["LOG_FAST_TIME"], _coerce_bool, base.fast_time),
            "use_orjson_if_available": (["LOG_USE_ORJSON"], _coerce_bool, base.use_orjson_if_available),
            "dynamic_batching": (["LOG_DYNAMIC_BATCHING"], _coerce_bool, base.dynamic_batching),
            "eager_connect": (["LOG_EAGER_CONNECT"], _coerce_bool, base.eager_connect),
            "pre_error_buffer_size": (["LOG_PRE_ERROR_BUFFER_SIZE"], _coerce_int, base.pre_error_buffer_size),
            "pre_error_buffer_level": (["LOG_PRE_ERROR_BUFFER_LEVEL"], _coerce_level, base.pre_error_buffer_level),
        }

        for key, (envs, coerce, default) in mapping.items():
            try:
                o[key] = pick(envs, coerce, default)
            except (ValueError, TypeError) as e:
                _log_throttled(logging.WARNING, f"env_parse_error_{envs[0]}",
                               "Invalid value for %s=%s (error=%s); using default",
                               envs[0], os.getenv(envs[0]), e)
                o[key] = default

        valid = {f.name for f in fields(LoggingSettings)}
        clean = {k: v for k, v in o.items() if k in valid}
        settings = replace(base, **clean)
        settings._validate()
        return settings

    def _validate(self) -> None:
        errors = []
        if self.watcher.refresh_time < 1:
            errors.append("watcher.refresh_time must be >= 1")
        if self.max_queue_size < 1:
            errors.append("max_queue_size must be >= 1")
        if self.connect_timeout_sec <= 0 and self.log_stream:
            errors.append("connect_timeout_sec must be > 0 when log_stream is enabled")
        protos = [p.strip().lower() for p in self.log_stream_protocols.split(",") if p.strip()]
        if not protos or any(p not in {PROTO_V1, PROTO_LEN} for p in protos):
            errors.append("log_stream_protocols must be comma-separated subset of {'v1','len'}")
        # TLS validation:
        # - If TLS enabled AND enforce=True, require files to exist (fail fast).
        # - If TLS enabled AND enforce=False, allow TCP fallback only if LOG_ALLOW_INSECURE=true.
        insecure_ok = _coerce_bool(os.getenv("LOG_ALLOW_INSECURE"), False)
        if self.tls.enabled and self.tls.enforce:
            for path, label in ((self.tls.cert_file, "cert_file"),
                                (self.tls.key_file, "key_file"),
                                (self.tls.ca_file, "ca_file")):
                if not path or not os.path.isfile(path):
                    errors.append(f"TLS enabled but {label} missing or not a file: {path!r}")
        elif self.tls.enabled and not self.tls.enforce:
            missing: list[tuple[str, str]] = []
            for path, label in ((self.tls.cert_file, "cert_file"),
                                (self.tls.key_file, "key_file"),
                                (self.tls.ca_file, "ca_file")):
                if not path or not os.path.isfile(path):
                    missing.append((label, path))
            if missing:
                if insecure_ok:
                    for label, path in missing:
                        _log_throttled(
                            logging.WARNING,
                            f"tls_file_missing_{label}",
                            "TLS %s not found (%r); degrading to TCP at runtime (LOG_ALLOW_INSECURE=true)",
                            label, path
                        )
                else:
                    errors.append(
                        "TLS is enabled but certificate files are missing. "
                        "Either provide valid cert/key/CA files or set LOG_STREAM_ENFORCE_TLS=true. "
                        "To *explicitly* allow insecure TCP fallback, set LOG_ALLOW_INSECURE=true."
                    )

        if self.max_extra_value_chars < 256 or self.max_stack_chars < 1024:
            errors.append("max_extra_value_chars >=256 and max_stack_chars >=1024 required")
        # Validate nested backoffs
        try:
            self.watcher.backoff.validate("watcher.backoff")
            self.stream_backoff.validate("stream_backoff")
        except ValueError as e:
            errors.append(str(e))
        if self.shutdown_timeout_sec <= 0:
            errors.append("shutdown_timeout_sec must be > 0")
        if errors:
            raise ValueError("Invalid LoggingSettings: " + "; ".join(errors))
        if self.pre_error_buffer_size < 0:
            raise ValueError("pre_error_buffer_size must be >= 0")

# --------------------------------------------------------------------------------------
# Context utilities
# --------------------------------------------------------------------------------------
class _TsCache:
    """Fast ISO-8601 yyyy-mm-ddThh:mm:ss.mmm±hh:mm with per-second caching."""
    __slots__ = ("_tz","_sec","_prefix","_suffix")
    def __init__(self, tz: ZoneInfo):
        self._tz = tz
        self._sec = -1
        self._prefix = "1970-01-01T00:00:00."
        self._suffix = "+00:00"
    def fmt_ns(self, ns: int) -> str:
        sec = ns // 1_000_000_000
        if sec != self._sec:
            dt = datetime.fromtimestamp(sec, tz=timezone.utc).astimezone(self._tz)
            self._prefix = dt.strftime("%Y-%m-%dT%H:%M:%S.")
            off = dt.strftime("%z")
            self._suffix = f"{off[:3]}:{off[3:]}" if off and len(off) == 5 else "+00:00"
            self._sec = sec
        ms = (ns // 1_000_000) % 1000
        return f"{self._prefix}{ms:03d}{self._suffix}"

def set_trace_context(*, trace_id: Optional[str] = None, span_id: Optional[str] = None, correlation_id: Optional[str] = None) -> None:
    if trace_id is not None: _TRACE_ID.set(str(trace_id))
    if span_id is not None: _SPAN_ID.set(str(span_id))
    if correlation_id is not None: _CORR_ID.set(str(correlation_id))

def clear_trace_context() -> None:
    _TRACE_ID.set(None); _SPAN_ID.set(None); _CORR_ID.set(None)

@contextlib.contextmanager
def trace_context(*, trace_id: Optional[str] = None, span_id: Optional[str] = None, correlation_id: Optional[str] = None):
    tok_t = _TRACE_ID.set(trace_id if trace_id is not None else _TRACE_ID.get())
    tok_s = _SPAN_ID.set(span_id if span_id is not None else _SPAN_ID.get())
    tok_c = _CORR_ID.set(correlation_id if correlation_id is not None else _CORR_ID.get())
    try:
        yield
    finally:
        _TRACE_ID.reset(tok_t)
        _SPAN_ID.reset(tok_s)
        _CORR_ID.reset(tok_c)

# --------------------------------------------------------------------------------------
# Filters & Formatter
# --------------------------------------------------------------------------------------

class _ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = _TRACE_ID.get()
        record.span_id = _SPAN_ID.get()
        record.correlation_id = _CORR_ID.get()
        return True


class _JSONFormatter(logging.Formatter):
    def __init__(self, settings: LoggingSettings, sanitize_newlines: bool, extra_static: Optional[Dict[str, object]]):
        super().__init__()
        self._settings = settings
        self._warned_structured_extras = False
        try:
            self._tz = ZoneInfo(settings.tz_name)
        except Exception:
            _log_throttled(logging.WARNING, "tz_invalid", "invalid TZ '%s'; falling back to UTC", settings.tz_name)
            self._tz = ZoneInfo("UTC")
        self._sanitize = sanitize_newlines
        self._extra_static = dict(extra_static or {})
        self._ts_cache = _TsCache(self._tz) if settings.fast_time else None
        self._reserved = set(vars(logging.LogRecord("", 0, "", 0, "", (), None, None)).keys())
        self._minimal_payload = dict(MINIMAL_PAYLOAD_BASE)

        self._static_head = {
            "version": ADP_LOG_SCHEMA_VERSION,
            "service_id": APP_NAME,
            "container_name": getattr(_manager().settings, "container_name", APP_NAME) if _manager().settings else APP_NAME,
            "host": HOSTNAME,
        }
        self._use_orjson = bool(_orjson and settings.use_orjson_if_available)

    def _safe_json_value(self, v):
        """Ensure extras are safe for JSON output, truncating if oversized.

        If preserve_structured_extras=True, dict/list values are embedded natively.
        Otherwise they are stringified.
        """
        lim = self._settings.max_extra_value_chars
        try:
            if isinstance(v, (dict, list)):
                js = json.dumps(v, ensure_ascii=False)
                if len(js) > lim:
                    return js[:lim] + "...(truncated)"
                if self._settings.preserve_structured_extras:
                    # Embed natively for structured pipelines; warn once via stderr to avoid formatter recursion.
                    if not self._warned_structured_extras:
                        self._warned_structured_extras = True
                        try:
                            sys.__stderr__.write(
                                "[logging] Embedding structured extras in logs; ensure downstream compatibility\n"
                            )
                        except Exception:
                            pass
                        self._warned_structured_extras = True
                    return v
                return js  # stringify for maximum compatibility
            s = str(v)
            return s if len(s) <= lim else s[:lim] + "...(truncated)"
        except Exception:
            s = repr(v)
            return s if len(s) <= lim else s[:lim] + "...(truncated)"

    def _iso_ts(self, record: logging.LogRecord) -> str:
        # Prefer high-resolution timestamp captured at record creation
        if self._settings.use_time_ns and hasattr(record, "created_ns"):
            ns = int(record.created_ns)
        elif self._settings.use_time_ns:
            # Fallback to created seconds if factory not installed
            created = getattr(record, "created", time.time())
            ns = int(created * 1_000_000_000)
        else:
            ns = int(getattr(record, "created", time.time()) * 1_000_000_000)
        if self._ts_cache:
            return self._ts_cache.fmt_ns(ns)
        dt = datetime.fromtimestamp(ns / 1_000_000_000, tz=timezone.utc).astimezone(self._tz)
        return dt.isoformat(timespec="milliseconds")

    def format(self, record: logging.LogRecord) -> str:
        try:
            message = record.getMessage()
        except Exception:
            message = "<unformattable log message>"
        if self._sanitize and isinstance(message, str):
            message = message.replace("\n", LOG_LINE_SEPARATOR)

        payload = {
            "version": ADP_LOG_SCHEMA_VERSION,
            "timestamp": self._iso_ts(record),
            "severity": record.levelname,
            "service_id": APP_NAME,
            "container_name": getattr(_manager().settings, "container_name", APP_NAME) if _manager().settings else APP_NAME,
            "logger": record.name,
            "module": record.module,
            "function": record.funcName,
            "file": record.filename,
            "line": record.lineno,
            "process": record.process,
            "process_name": getattr(record, "processName", None),
            "thread": record.thread,
            "thread_name": getattr(record, "threadName", None),
            "host": HOSTNAME,
            "message": message,
        }

        # Inject context
        if getattr(record, "trace_id", None): payload["trace_id"] = record.trace_id
        if getattr(record, "span_id", None): payload["span_id"] = record.span_id
        if getattr(record, "correlation_id", None): payload["correlation_id"] = record.correlation_id

        # Exception (bounded stack)
        if record.exc_info:
            etype, evalue, etb = record.exc_info
            payload["exc_type"] = etype.__name__ if etype else "Exception"
            payload["exc_message"] = str(evalue) if evalue else ""
            stack = "".join(traceback.format_exception(etype, evalue, etb)) if etype else ""
            lim = self._settings.max_stack_chars
            if len(stack) > lim:
                stack = stack[:lim] + "...(truncated)"
            payload["stack"] = stack

        # Hoist safe extras
        extra_fields = record.__dict__.get("extra_fields")
        if isinstance(extra_fields, dict):
            for k, v in extra_fields.items():
                if k not in payload:
                    payload[k] = self._safe_json_value(v)
        else:
            for k, v in record.__dict__.items():
                if k not in payload and k not in self._reserved and not k.startswith("_"):
                    payload[k] = self._safe_json_value(v)

        # Static extras (do not overwrite)
        for k, v in self._extra_static.items():
            if k not in payload:
                payload[k] = v

        try:
            if self._use_orjson:
                out_b = _orjson.dumps(payload, option=0)
                out = out_b.decode("utf-8", errors="replace")
            else:
                out = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        except Exception as e:
            # Emit a minimal, valid JSON line as a last resort and write once to the
            # original stderr to avoid recursion through logging handlers.
            self._minimal_payload["timestamp"] = self._iso_ts(record)
            try:
                out = json.dumps(self._minimal_payload, ensure_ascii=False, separators=(",", ":"))
            except Exception:
                # Last-ditch: guarantee a line (keys are ASCII)
                out = '{"version":"%s","timestamp":"%s","severity":"ERROR","service_id":"%s","message":"formatter serialization error"}' % (ADP_LOG_SCHEMA_VERSION, self._iso_ts(record), APP_NAME)
            try:
                sys.__stderr__.write(f"[logging] formatter json.dumps failed: {e}\n")
            except Exception:
                pass
        _stats().inc_emitted(1)
        return out

# --------------------------------------------------------------------------------------
# Queue handler with explicit shedding and accurate depth
# --------------------------------------------------------------------------------------

class _NBQueueHandler(lh.QueueHandler):
    """Non-blocking queue with optional pre-error ring buffer and explicit shedding."""
    def __init__(self, q: "Queue[logging.LogRecord]", drop_oldest: bool,
                 ring_size: int = 0, ring_level: int = logging.DEBUG):
        super().__init__(q)
        self.q = q
        self._drop_oldest = bool(drop_oldest)
        self._ring = deque(maxlen=int(ring_size)) if ring_size > 0 else None
        self._ring_level = int(ring_level)

    def _try_put(self, record: logging.LogRecord) -> None:
        try:
            self.q.put_nowait(record)
            _stats().ingest_inc()
        except queue.Full:
            if self._drop_oldest:
                try:
                    dropped = self.q.get_nowait()
                    _stats().ingest_dec()  # reflect physical removal from ingest queue
                    _stats().inc_dropped_by_level(getattr(dropped, "levelno", logging.INFO))
                    self.q.put_nowait(record)
                except Exception:
                    _stats().inc_dropped_by_level(getattr(record, "levelno", logging.INFO))
            else:
                _stats().inc_dropped_by_level(getattr(record, "levelno", logging.INFO))
            if _throttle().allow("queue_full_warn", every_sec=30.0):
                _LOGGER.error("log queue full; shedding records (drop_oldest=%s)", self._drop_oldest)


    def enqueue(self, record: logging.LogRecord) -> None:
        # Flush pre-error ring on first error
        if self._ring is not None and record.levelno >= logging.ERROR and len(self._ring):
            try:
                for r in list(self._ring):
                    self._try_put(r)
            finally:
                self._ring.clear()

        # Capture record into ring buffer if level >= threshold and < ERROR
        if self._ring is not None and self._ring_level <= record.levelno < logging.ERROR:
            self._ring.append(record)

        # Always go through unified path
        self._try_put(record)


class _DepthProxyHandler(logging.Handler):
    """Proxy around a real handler that decrements queue depth after handling.

    Ensures _Stats queue depth stays accurate when using QueueListener.
    """
    def __init__(self, inner: logging.Handler):
        super().__init__(level=inner.level)
        self.inner = inner
        self.setFormatter(inner.formatter)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.inner.handle(record)
        finally:
            _stats().ingest_dec()

# --------------------------------------------------------------------------------------
# Framing (injectable)
# --------------------------------------------------------------------------------------

class _Framer:
    def frame(self, payload: bytes) -> bytes:
        raise NotImplementedError

class _FramerLen(_Framer):
    def frame(self, payload: bytes) -> bytes:
        return struct.pack(">L", len(payload)) + payload

class _FramerV1(_Framer):
    def __init__(self, crc32_enabled: bool):
        self._use_crc = bool(crc32_enabled)
    def frame(self, payload: bytes) -> bytes:
        # Magic 'JL'(2B) + version(1B) + len(4B) + crc32(4B if enabled) + payload
        if not self._use_crc:
            return b"JL" + b"\x01" + struct.pack(">L", len(payload)) + b"\x00\x00\x00\x00" + payload
        crc = zlib.crc32(payload) & 0xFFFFFFFF
        return b"JL" + b"\x01" + struct.pack(">L", len(payload)) + struct.pack(">L", crc) + payload

# --------------------------------------------------------------------------------------
# Socket handlers with backoff
# --------------------------------------------------------------------------------------

class _LPBase(lh.SocketHandler):
    """Base for framed socket handlers with **async** backoff & standardized error handling.

    IMPORTANT: The logging thread never sleeps. Records are enqueued to an internal
    sender queue handled by a background thread which performs connect/retry/backoff.
    """
    def __init__(self, host: str, port: int, timeout_sec: float, framers: List[_Framer], backoff: _Backoff,
                 buffer_size: int, dynamic_batching: bool):
        super().__init__(host, port)
        self._timeout = float(timeout_sec)
        self._framers = list(framers) if framers else [_FramerLen()]
        self._framer_idx = 0
        self._backoff = backoff
        self._send_q: "Queue[logging.LogRecord]" = Queue(max(1, int(buffer_size)))
        self._send_q_depth = _AtomicInt(0)
        self._stop_event = threading.Event()
        self._next_allowed_ts = 0.0
        self._dynamic_batching = bool(dynamic_batching)
        self._sender_thread = threading.Thread(target=self._sender_loop, name="LogNetSender", daemon=True)
        self._sender_thread.start()

    # ---- centralized error handling ----
    def _on_stream_error(self, reason: str, exc: Optional[BaseException] = None, batch: Optional[list] = None) -> None:
        msg = f"{reason}: {exc}" if exc else reason
        _stats().inc_stream_fail(msg)
        delay = self._backoff.on_error()
        _stats().set_backoff(delay)
        self._next_allowed_ts = time.time() + delay
        _log_throttled(logging.ERROR, "stream_error", "log-stream: %s; backoff %.2fs", msg, delay)
        if self._framers:
            self._framer_idx = (self._framer_idx + 1) % len(self._framers)
            _log_throttled(logging.WARNING, "proto_fallback", "protocol index -> %d", self._framer_idx)
        try:
            if self.sock:
                try: self.sock.shutdown(socket.SHUT_RDWR)
                except OSError: pass
                self.sock.close()
        finally:
            self.sock = None

    # ---- Logging.Handler API (non-blocking) ----
    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._send_q.put_nowait(record)
            self._send_q_depth.inc()
            _stats().net_inc()
        except queue.Full:
            _stats().inc_dropped_by_level(getattr(record, "levelno", logging.INFO))
            _log_throttled(
                logging.WARNING,
                "net_sender_queue_full",
                "net-sender queue full; dropping record"
            )

    def close(self) -> None:
        try:
            self._stop_event.set()
            self._sender_thread.join(timeout=5.0)
        finally:
            super().close()

    def pending(self) -> int:
        """Number of records pending in the async sender queue."""
        return self._send_q_depth.get()

    # ---- Background sender loop ----
    def _sender_loop(self) -> None:
        batch: list[logging.LogRecord] = []
        last_reconcile = 0.0
        while not self._stop_event.is_set():
            # Backoff gate (no sleep in logging thread)
            now = time.time()
            if now < self._next_allowed_ts:
                time.sleep(min(0.25, self._next_allowed_ts - now))
                continue

            if not self.sock:
                self.createSocket()  # never sleeps; sets _next_allowed_ts on failure
                if not self.sock:
                    # Quick yield to avoid busy loop
                    time.sleep(0.1)
                    continue
            # Periodically reconcile send_q_depth with actual qsize to prevent drift
            if now - last_reconcile >= RECONCILE_INTERVAL_SEC:
                try:
                    qsize = self._send_q.qsize()
                    self._send_q_depth.set(qsize)
                    _stats().set_net_depth(qsize)
                    last_reconcile = now
                except Exception:
                    pass

            # Build a small batch to reduce syscalls
            batch.clear()
            try:
                # Always pull at least one; then drain up to 32 items if available
                rec = self._send_q.get(timeout=SENDER_TIMEOUT_SEC)
                batch.append(rec)
                self._send_q_depth.dec()
                _stats().net_dec()
                limit = BATCH_SIZE_LIMIT
                if self._dynamic_batching:
                    depth = self._send_q_depth.get()
                    if depth >= 1024:
                        limit = 256
                    elif depth >= 128:
                        limit = 64
                for _ in range(limit - 1):
                    try:
                        batch.append(self._send_q.get_nowait())
                        self._send_q_depth.dec()
                        _stats().net_dec()
                    except queue.Empty:
                        break
            except queue.Empty:
                continue

            # Send the batch (each framed separately, one sendall)
            try:
                chunks: list[bytes] = []
                for r in batch:
                    payload = self.format(r).encode("utf-8", errors="replace")
                    chunks.append(self._framers[self._framer_idx].frame(payload))
                data = b"".join(chunks)
                self.send(data)  # SocketHandler.send -> sendall
                _stats().mark_stream_ok()
                self._backoff.on_success()
                # Reset to preferred protocol after successful send
                self._framer_idx = 0
                # Stay on current framer after success
            except Exception as e:
                # On any error: delegate to central handler, schedule backoff, and best-effort requeue
                self._on_stream_error("send failed", e)
                for r in batch:
                    try:
                        self._send_q.put_nowait(r)
                        self._send_q_depth.inc()
                        _stats().net_inc()
                    except queue.Full:
                        _stats().inc_dropped_by_level(getattr(r, "levelno", logging.INFO))
                try:
                    if self.sock:
                        try:
                            self.sock.shutdown(socket.SHUT_RDWR)
                        except OSError:
                            pass
                        self.sock.close()
                finally:
                    self.sock = None
                # Try next framer (protocol fallback negotiation)
                if self._framers:
                    self._framer_idx = (self._framer_idx + 1) % len(self._framers)
                    _log_throttled(logging.WARNING, "proto_fallback", "log-stream: switching protocol index to %d", self._framer_idx)
                # do not sleep here; loop will gate on _next_allowed_ts

    # ---- Modified SocketHandler internals: never sleep here ----
    def handleError(self, record: logging.LogRecord) -> None:
        delay = self._backoff.on_error()
        _stats().inc_stream_fail("send error")
        _stats().set_backoff(delay)
        _log_throttled(logging.ERROR, "stream_send_error", "log-stream: send error; backing off %.2fs", delay)
        self._next_allowed_ts = time.time() + delay

    def createSocket(self) -> None:
        if self.sock:
            try:
                try:
                    self.sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                self.sock.close()
            except OSError:
                pass
            self.sock = None

        host, port = self.address
        try:
            infos = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
        except OSError as e:
            delay = self._backoff.on_error()
            _stats().inc_stream_fail(f"getaddrinfo {host}:{port}: {e}")
            _stats().set_backoff(delay)
            _log_throttled(logging.ERROR, "stream_dns_error", "log-stream: getaddrinfo %s:%s failed: %s; backoff %.2fs",
                           host, port, e, delay)
            self._next_allowed_ts = time.time() + delay
            return

        for family, socktype, proto, _canonname, sockaddr in infos:
            try:
                s = socket.socket(family, socktype, proto)
                s.settimeout(self._timeout)
                s = self._wrap_before_connect(s)
                s.connect(sockaddr)
                s.settimeout(None)
                self.sock = s
                self._backoff.on_success()
                _stats().mark_stream_ok()
                return
            except (OSError, ssl.SSLError) as e:
                try:
                    s.close()
                except OSError:
                    pass
                _stats().inc_stream_fail(f"connect {sockaddr}: {e}")
                _log_throttled(logging.ERROR, "stream_connect_error", "log-stream: connect %s failed: %s", sockaddr, e)
                continue

        delay = self._backoff.on_error()
        _stats().set_backoff(delay)
        self._next_allowed_ts = time.time() + delay
        self.sock = None

    def _wrap_before_connect(self, sock: socket.socket) -> socket.socket:
        return sock

class _LengthPrefixedTCPHandler(_LPBase):
    def __init__(self, host: str, port: int, timeout_sec: float, framers: List[_Framer], backoff: _Backoff,
                 buffer_size: int, dynamic_batching: bool):
        super().__init__(host, port, timeout_sec, framers, backoff, buffer_size, dynamic_batching)


class _LengthPrefixedTLSSocketHandler(_LPBase):
    def __init__(self, host: str, port: int, timeout_sec: float, framers: List[_Framer], backoff: _Backoff,
                 cert_file: str, key_file: str, ca_file: str, min_version: "ssl.TLSVersion",
                 enforce_tls: bool, buffer_size: int, dynamic_batching: bool):
        super().__init__(host, port, timeout_sec, framers, backoff, buffer_size, dynamic_batching)
        self._enforce = enforce_tls
        self._context: Optional[ssl.SSLContext] = None
        try:
            ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
            try:
                ctx.minimum_version = min_version
            except Exception as e:
                _log_throttled(logging.WARNING, "tls_version_fail", "[logging] Failed to set TLS minimum version %s: %s", min_version, e)
            ctx.load_cert_chain(certfile=cert_file, keyfile=key_file)
            ctx.load_verify_locations(cafile=ca_file)
            self._context = ctx
        except Exception as e:
            insecure_ok = _coerce_bool(os.getenv("LOG_ALLOW_INSECURE"), False)
            if enforce_tls or not insecure_ok:
                # Fail fast: either enforcement is on or insecure fallback not permitted.
                raise RuntimeError(f"TLS context creation failed and insecure fallback is disabled: {e}")
            _log_throttled(
                logging.ERROR,
                "tls_ctx_fail",
                "log-stream: TLS context creation failed; degrading to TCP (LOG_ALLOW_INSECURE=true): %s",
                e
            )
            self._context = None
            # Switch address to TCP port for insecure fallback
            self.address = (host, os.getenv("LOG_STREAM_TCP_PORT") and int(os.getenv("LOG_STREAM_TCP_PORT")) or 5025)

    def _wrap_before_connect(self, sock: socket.socket) -> socket.socket:
        if self._context is None:
            return sock
        try:
            return self._context.wrap_socket(sock, server_hostname=self.address[0])
        except Exception as e:
            insecure_ok = _coerce_bool(os.getenv("LOG_ALLOW_INSECURE"), False)
            if self._enforce or not insecure_ok:
                # Cause connection attempt to fail, honoring enforcement/disable-fallback policy.
                _log_throttled(logging.ERROR, "tls_wrap_fail_enforce", "log-stream: TLS wrap failed and fallback disabled: %s", e)
                raise ssl.SSLError(f"TLS wrap failed and insecure fallback is disabled: {e}")
            _log_throttled(logging.ERROR, "tls_wrap_fail", "log-stream: TLS wrap failed; degrading to TCP (LOG_ALLOW_INSECURE=true): %s", e)
            return sock

# --------------------------------------------------------------------------------------
# Watcher (root + per-logger levels) with error backoff
# --------------------------------------------------------------------------------------

class _LogConfWatcher(threading.Thread):
    def __init__(self, settings: LoggingSettings, apply_root_level, apply_logger_levels):
        super().__init__(name="LogConfWatcher", daemon=True)
        self._s = settings
        self._apply_root_level = apply_root_level
        self._apply_logger_levels = apply_logger_levels
        self._stop_event = threading.Event()
        self._last_mtime: Dict[str, float] = {
            self._k8s_level_path: 0.0,
            self._s.watcher.control_file: 0.0,
        }
        self._backoffs: Dict[str, _Backoff] = {
            self._k8s_level_path: _Backoff(settings.watcher.backoff.base, settings.watcher.backoff.factor,
                                           settings.watcher.backoff.jitter, settings.watcher.backoff.max_delay),
            self._s.watcher.control_file: _Backoff(settings.watcher.backoff.base, settings.watcher.backoff.factor,
                                                  settings.watcher.backoff.jitter, settings.watcher.backoff.max_delay),
        }
        self._next_allowed: Dict[str, float] = {k: 0.0 for k in self._last_mtime}

    @property
    def _k8s_level_path(self) -> str:
        return os.path.join(self._s.watcher.k8s_path, LOG_LEVEL_FILENAME)

    def run(self) -> None:
        interval = max(1, int(self._s.watcher.refresh_time))
        _LOGGER.info("log-watcher: started (interval=%ss)", interval)
        while not self._stop_event.wait(interval):
            self._tick()
            _stats().mark_watcher_heartbeat()

    def stop(self) -> None:
        self._stop_event.set()

    def _should_check(self, path: str) -> bool:
        return time.time() >= self._next_allowed.get(path, 0.0)

    def _note_failure(self, path: str, msg: str) -> None:
        delay = self._backoffs[path].on_error()
        self._next_allowed[path] = time.time() + delay
        _log_throttled(logging.ERROR, f"watcher_err_{os.path.basename(path)}", "%s; retry in %.1fs", msg, delay)

    def _note_success(self, path: str) -> None:
        self._backoffs[path].on_success()
        self._next_allowed[path] = 0.0

    def _tick(self) -> None:
        # Plain level file
        p = self._k8s_level_path
        if self._should_check(p) and self._file_updated(p):
            text = self._read_text(p)
            if text is not None:
                level = _coerce_level(text, logging.getLogger().level)
                self._apply_root_level(level, f"{p}:{text.strip()}")

        # Control JSON
        p = self._s.watcher.control_file
        if self._should_check(p) and self._file_updated(p):
            data = self._read_json(p)
            if data is not None:
                level = self._extract_level_from_control_json(
                    data, self._s.container_name, logging.getLogger().level
                )
                self._apply_root_level(level, f"{self._s.watcher.control_file}")
                self._apply_logger_levels(data)

    def _file_updated(self, path: str) -> bool:
        try:
            mtime = os.path.getmtime(path)
            self._note_success(path)
        except FileNotFoundError:
            self._note_failure(path, f"log-watcher: file not found: {path}")
            return False
        except PermissionError as e:
            self._note_failure(path, f"log-watcher: permission denied: {path} ({e})")
            self._last_mtime.pop(path, None)
            return False
        except OSError as e:
            self._note_failure(path, f"log-watcher: error accessing {path}: {e}")
            return False

        last = self._last_mtime.get(path, 0.0)
        if mtime != last:
            self._last_mtime[path] = mtime
            return True
        return False

    def _read_text(self, path: str) -> Optional[str]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception as e:
            self._note_failure(path, f"log-watcher: read {path} failed: {e}")
            return None

    def _read_json(self, path: str) -> Optional[dict]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, dict) or "logcontrol" not in data:
                    raise ValueError("invalid logcontrol JSON structure")
                self._note_success(path)
                return data
        except Exception as e:
            self._note_failure(path, f"log-watcher: invalid/failed JSON {path}: {e}")
            return None

    @staticmethod
    def _extract_level_from_control_json(data: dict, container_name: str, default: int) -> int:
        try:
            section = data.get("logcontrol", [])
            for entry in section:
                if not isinstance(entry, dict):
                    continue
                if entry.get("container") == container_name:
                    return _coerce_level(entry.get("severity"), default)
        except Exception:
            pass
        _stats().inc_missing_severity()
        _log_throttled(logging.INFO, "watcher_no_severity",
                       "log-watcher: severity for container '%s' not found (using default %s)",
                       container_name, logging.getLevelName(default))
        return default

# --------------------------------------------------------------------------------------
# Manager (singleton)
# --------------------------------------------------------------------------------------

class _LoggingManager:
    def __init__(self):
        self._lock = threading.RLock()
        self.settings: Optional[LoggingSettings] = None
        self._watcher: Optional[_LogConfWatcher] = None
        self._queue_listener: Optional[lh.QueueListener] = None
        self._started = False
        self._context_filter = _ContextFilter()
        self._extra_static: Dict[str, object] = {}
        self._stats_thread: Optional[threading.Thread] = None
        self._stats_stop = threading.Event()

    def _load_static_extras_from_env(self, var_name: str) -> Dict[str, object]:
        if not var_name:
            return {}
        text = os.getenv(var_name, "").strip()
        if not text:
            return {}
        if len(text.encode("utf-8", errors="ignore")) > MAX_STATIC_EXTRAS_BYTES:
            _log_throttled(logging.ERROR, "extras_env_too_large",
                           "static extras env too large (> %d bytes); ignoring", MAX_STATIC_EXTRAS_BYTES)
            return {}
        try:
            obj = json.loads(text)
            if not isinstance(obj, dict) or any(not isinstance(k, str) for k in obj.keys()):
                _log_throttled(logging.ERROR, "extras_env_bad", "[logging] %s must be a JSON object with string keys", var_name)
                return {}
            # Optionally validate values are JSON-serializable on best-effort basis
            try:
                json.dumps(obj)
            except Exception:
                _log_throttled(logging.ERROR, "extras_env_bad_val", "[logging] %s contains non-serializable values; ignoring", var_name)
                return {}
            return obj
        except Exception as e:
            _log_throttled(logging.ERROR, "extras_env_bad", "failed to parse %s JSON: %s", var_name, e)
            return {}

    def _stop_stats_thread_unlocked(self) -> None:
        if self._stats_thread:
            try:
                self._stats_stop.set()
                self._stats_thread.join(timeout=2.0)
            except Exception:
                pass
            self._stats_thread = None


    def init(self, settings: Optional[LoggingSettings] = None) -> None:
        with self._lock:
            new_settings = settings or LoggingSettings.from_env()
            if self._started and self.settings == new_settings:
                return

            # Build new handlers before swap; may raise if enforce_tls and TLS invalid.
            self._extra_static = self._load_static_extras_from_env(new_settings.static_fields_json_env_var)
            new_handlers = self._build_handlers(new_settings)
            new_watcher = self._build_watcher(new_settings)

            root = logging.getLogger()
            old_handlers = root.handlers[:]

            root.setLevel(new_settings.log_level)
            for h in new_handlers:
                h.addFilter(self._context_filter)
                root.addHandler(h)

            # Stop old pipeline after new attached to avoid gaps
            self._stop_stats_thread_unlocked()
            self._stop_queue_listener_unlocked()
            for h in old_handlers:
                try:
                    h.flush()
                except OSError:
                    pass
                try:
                    h.close()
                except OSError:
                    pass
                root.removeHandler(h)

            self._stop_watcher_unlocked()
            if new_watcher:
                new_watcher.start()
                self._watcher = new_watcher

            # Start periodic stats reporter if requested
            self._stats_stop.clear()
            if new_settings.stats_report_interval_sec > 0:
                self._stats_thread = threading.Thread(target=self._stats_reporter_loop, name="LogStatsReporter", daemon=True)
                self._stats_thread.start()

            self.settings = new_settings
            self._started = True
            _LOGGER.info("logging initialized (root level=%s)", logging.getLevelName(new_settings.log_level))

    def _choose_protocols(self, s: LoggingSettings) -> List[Tuple[str, _Framer]]:
        prefs: List[str] = [p.strip().lower() for p in s.log_stream_protocols.split(",") if p.strip()]
        chosen: List[Tuple[str, _Framer]] = []
        for p in prefs:
            if p == PROTO_V1:
                chosen.append((PROTO_V1, _FramerV1(crc32_enabled=s.protocol_crc32)))
            elif p == PROTO_LEN:
                chosen.append((PROTO_LEN, _FramerLen()))
        if not chosen:
            _log_throttled(logging.WARNING, "no_protocols", "[logging] No valid protocols specified; defaulting to %s", PROTO_LEN)
            chosen = [(PROTO_LEN, _FramerLen())]
        return chosen

    def _build_handlers(self, s: LoggingSettings) -> list[logging.Handler]:
        handlers: list[logging.Handler] = []
        # Track all network handlers and the single queue used by listener
        if not hasattr(self, "_net_handlers"):
            self._net_handlers: List[_LPBase] = []
        if not hasattr(self, "_queues"):
            self._queues: List["Queue[logging.LogRecord]"] = []
        stdout_fmt = _JSONFormatter(s, sanitize_newlines=False, extra_static=self._extra_static)
        network_fmt = _JSONFormatter(s, sanitize_newlines=True, extra_static=self._extra_static)

        if s.log_stdout:
            h = logging.StreamHandler(sys.stdout)
            h.setFormatter(stdout_fmt)
            handlers.append(h)

        if s.log_stderr:
            h = logging.StreamHandler(sys.stderr)
            h.setFormatter(stdout_fmt)
            handlers.append(h)

        if s.log_file and s.log_rotate_max_bytes > 0:
            h = lh.RotatingFileHandler(
                s.log_file, maxBytes=s.log_rotate_max_bytes, backupCount=s.log_rotate_backup_count
            )
            h.setFormatter(stdout_fmt)
            handlers.append(h)

        if s.log_stream:
            protos = self._choose_protocols(s)
            framers = [fr for (_name, fr) in protos]
            backoff = _Backoff(s.stream_backoff.base, s.stream_backoff.factor, s.stream_backoff.jitter, s.stream_backoff.max_delay)
            if s.tls.enabled:
                min_ver = _tls_version_from_str(s.tls.min_version, getattr(ssl.TLSVersion, "TLSv1_2", None))
                net = _LengthPrefixedTLSSocketHandler(
                    s.log_stream_host, s.log_stream_tls_port, s.connect_timeout_sec, framers, backoff,
                    cert_file=s.tls.cert_file, key_file=s.tls.key_file, ca_file=s.tls.ca_file,
                    min_version=min_ver, enforce_tls=s.tls.enforce, buffer_size=s.max_queue_size,
                    dynamic_batching=s.dynamic_batching
                )
            else:
                net = _LengthPrefixedTCPHandler(
                    s.log_stream_host, s.log_stream_tcp_port, s.connect_timeout_sec, framers, backoff,
                    buffer_size=s.max_queue_size, dynamic_batching=s.dynamic_batching
                )
            net.setFormatter(network_fmt)

            q: "Queue[logging.LogRecord]" = Queue(s.max_queue_size)
            qh = _NBQueueHandler(
                q,
                drop_oldest=s.drop_oldest_on_full,
                ring_size=s.pre_error_buffer_size,
                ring_level=s.pre_error_buffer_level,
            )
            # Replace queue listener atomically and close old net handlers
            self._stop_queue_listener_unlocked()
            if hasattr(self, "_net_handlers") and self._net_handlers:
                for nh in self._net_handlers:
                    try: nh.close()
                    except Exception: pass
                self._net_handlers.clear()
            self._net_handler = net  # backward-compat for single handler
            self._net_handlers.append(net)
            self._queues.append(q)
            handlers.append(qh)
            proxy = _DepthProxyHandler(net)
            self._queue_listener = lh.QueueListener(q, proxy, respect_handler_level=True)
            self._queue_listener.start()
            if s.eager_connect:
                try:
                    net.createSocket()
                except Exception:
                    pass
            _LOGGER.info("log-stream enabled (proto_pref=%s,tls=%s,enforce=%s)", ",".join([p for (p, _) in protos]), s.tls.enabled, s.tls.enforce)
        return handlers

    def _stats_reporter_loop(self) -> None:
        interval = max(1, int(getattr(self.settings, "stats_report_interval_sec", 0)))
        while not self._stats_stop.wait(interval):
            snap = _stats().snapshot()
            try:
                _LOGGER.info(
                    "log-stats: emitted=%s dropped=%s by_sev=%s ingest=%s net=%s total=%s fails=%s backoff=%.2fs",
                    snap["emitted_lines"], snap["dropped_lines"], snap["dropped_by_severity"],
                    snap["queue_ingest_cur_depth"], snap["queue_net_cur_depth"], snap["queue_cur_depth_total"],
                    snap["stream_connect_failures"], snap["current_backoff_seconds"]
                )
            except Exception:
                pass

    def flush_and_drain(self, timeout_sec: float = 5.0) -> bool:
        """Best-effort flush: wait until listener queue and network queue are empty."""
        t_end = time.time() + max(0.0, float(timeout_sec))
        last_reconcile = 0.0
        while time.time() < t_end:
            # Reconcile depth with actual queue size periodically to prevent drift
            now = time.time()
            if now - last_reconcile >= RECONCILE_INTERVAL_SEC:
                try:
                    if getattr(self, "_queue_listener", None) and hasattr(self, "_queues") and self._queues:
                        qsize = self._queues[-1].qsize()
                        _stats().set_ingest_depth(qsize)
                except Exception:
                    pass
                last_reconcile = now
            # Check all network handlers are drained
            nets_empty = True
            for nh in getattr(self, "_net_handlers", []):
                try:
                    if nh.pending() != 0:
                        nets_empty = False
                        break
                except Exception:
                    nets_empty = False
            if _stats().snapshot()["queue_cur_depth_total"] == 0 and nets_empty:
                return True
            time.sleep(FLUSH_POLL_INTERVAL_SEC)
        return False

    def _build_watcher(self, s: LoggingSettings) -> Optional[_LogConfWatcher]:
        if not s.watcher.enabled:
            return None
        return _LogConfWatcher(s, self._apply_root_level, self._apply_logger_levels)

    def _apply_root_level(self, level: int, source: str) -> None:
        with self._lock:
            logging.getLogger().setLevel(level)
            _LOGGER.warning("root log level updated to %s (source: %s)", logging.getLevelName(level), source)

    def _apply_logger_levels(self, data: dict) -> None:
        """Expected structure:
        {
          "logcontrol": [
            {"container":"...", "severity":"INFO",
             "loggers":{"urllib3":"WARNING","my.pkg":"DEBUG"}}
          ]
        }
        """
        try:
            section = data.get("logcontrol", [])
            for entry in section:
                if not isinstance(entry, dict):  # skip malformed
                    continue
                if entry.get("container") != getattr(self.settings, "container_name", None):
                    continue
                loggers = entry.get("loggers", {})
                if loggers and not isinstance(loggers, dict):
                    _log_throttled(logging.ERROR, "logger_levels_bad", "per-logger 'loggers' must be an object")
                    continue
                changed = []
                for name, lvl in (loggers or {}).items():
                    if not isinstance(name, str):
                        continue
                    level = _coerce_level(lvl, logging.getLogger(name).level)
                    logging.getLogger(name).setLevel(level)
                    changed.append(f"{name}={logging.getLevelName(level)}")
                if changed:
                    _LOGGER.warning("per-logger levels updated: %s", ",".join(changed))
        except Exception as e:
            _log_throttled(logging.ERROR, "apply_logger_levels", "failed to apply per-logger levels: %s", e)

    def _stop_watcher_unlocked(self) -> None:
        if self._watcher:
            try:
                self._watcher.stop()
                self._watcher.join(timeout=5)
            finally:
                self._watcher = None

    def _stop_queue_listener_unlocked(self) -> None:
        if self._queue_listener:
            try:
                # Best-effort drain using our own flush loop before stopping listener
                timeout = getattr(self.settings, "shutdown_timeout_sec", 10.0)
                self.flush_and_drain(timeout_sec=float(timeout))
                self._queue_listener.stop()
            finally:
                self._queue_listener = None

    def shutdown(self) -> None:
        with self._lock:
            if not self._started:
                return
            _LOGGER.info("shutting down logging")
            # Stop stats reporter
            try:
                self._stats_stop.set()
                if self._stats_thread:
                    self._stats_thread.join(timeout=2.0)
            except Exception:
                pass
            self._stop_watcher_unlocked()
            self._stop_queue_listener_unlocked()
            root = logging.getLogger()
            for h in root.handlers[:]:
                try:
                    h.flush()
                except OSError:
                    pass
                try:
                    h.close()
                except OSError:
                    pass
                root.removeHandler(h)
            # Close network handler explicitly (stops its async sender)
            if hasattr(self, "_net_handlers"):
                for nh in self._net_handlers:
                    try:
                        nh.close()
                    except Exception:
                        pass
                self._net_handlers.clear()
            self._started = False

_MANAGER_INSTANCE: Optional[_LoggingManager] = None
def _manager() -> _LoggingManager:
    global _MANAGER_INSTANCE
    # Thread-safe singleton init
    if _MANAGER_INSTANCE is None:
        with _MANAGER_LOCK:
            if _MANAGER_INSTANCE is None:
                _MANAGER_INSTANCE = _LoggingManager()
    return _MANAGER_INSTANCE

# --------------------------------------------------------------------------------------
# FastEventLogger adapter (structlog-lite)
# --------------------------------------------------------------------------------------

class FastEventLogger:
    """Minimal structlog-like helper while staying stdlib-only."""
    __slots__ = ("_logger", "_bound")
    def __init__(self, name: Optional[str] = None, **bound):
        self._logger = logging.getLogger(name or APP_NAME)
        self._bound = dict(bound)
    def bind(self, **kv) -> "FastEventLogger":
        nb = dict(self._bound); nb.update(kv); return FastEventLogger(self._logger.name, **nb)
    def log(self, level: int, msg: str, **kv) -> None:
        if not self._logger.isEnabledFor(level): return
        if self._bound: kv = {**self._bound, **kv}
        self._logger.log(level, msg, extra={"extra_fields": kv})
    def info(self, msg: str, **kv): self.log(logging.INFO, msg, **kv)
    def debug(self, msg: str, **kv): self.log(logging.DEBUG, msg, **kv)
    def warning(self, msg: str, **kv): self.log(logging.WARNING, msg, **kv)
    def error(self, msg: str, **kv): self.log(logging.ERROR, msg, **kv)
    def critical(self, msg: str, **kv): self.log(logging.CRITICAL, msg, **kv)
    def exception(self, msg: str, **kv):
        if self._logger.isEnabledFor(logging.ERROR):
            if self._bound: kv = {**self._bound, **kv}
            self._logger.error(msg, exc_info=True, extra={"extra_fields": kv})
    def bind_contextvars(self) -> "FastEventLogger":
        ctx = {}
        if _TRACE_ID.get(): ctx["trace_id"] = _TRACE_ID.get()
        if _SPAN_ID.get(): ctx["span_id"] = _SPAN_ID.get()
        if _CORR_ID.get(): ctx["correlation_id"] = _CORR_ID.get()
        return self.bind(**ctx)
# --------------------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------------------

def init_simple_logging(level: int | str = logging.INFO, *, stdout: bool = True, stderr: bool = False) -> None:
    """Initialize logging with safe, minimal defaults (no watcher, no streaming)."""
    base = LoggingSettings()
    s = replace(
        base,
        watcher=replace(base.watcher, enabled=False),
        log_stdout=bool(stdout),
        log_stderr=bool(stderr),
        log_stream=False,
        log_level=_coerce_level(level, logging.INFO),
        preserve_structured_extras=False,
    )
    _manager().init(s)

def init_logging(settings: Optional[LoggingSettings] = None) -> None:
    """
    Initialize logging. Idempotent.
    If enforce_tls=True and TLS is misconfigured, initialization fails fast with a RuntimeError.
    Runtime stream errors always use backoff; local JSON never stops.
    """
    _manager().init(settings)
    # Install a LogRecordFactory that captures a high-resolution timestamp once per record.
    try:
        # Avoid factory re-install if already patched.
        if getattr(logging.getLogRecordFactory(), "_hires_patch", False):
            return
        old_factory = logging.getLogRecordFactory()
        def _factory(*args, **kwargs):
            rec = old_factory(*args, **kwargs)
            try:
                if not hasattr(rec, "created_ns"):
                    rec.created_ns = time.time_ns()
            except Exception:
                # Best-effort; ignore if unsupported
                # Do not fail init if monotonic_ns unavailable (Py<3.7 fallback).
                pass
            _factory._hires_patch = True
            return rec
        _factory._hires_patch = True
        logging.setLogRecordFactory(_factory)
    except Exception:
        # If the environment forbids setting a custom factory, silently continue.
        pass

def flush_and_drain(timeout_sec: float = 5.0) -> bool:
    """Flush and drain both the QueueListener and async network sender.
    Returns True if drained within the timeout.
    """
    return _manager().flush_and_drain(timeout_sec)

def shutdown_logging() -> None:
    """Flush and close all handlers and stop background components."""
    try:
        # Try a best-effort flush before shutdown
        _manager().flush_and_drain(timeout_sec=5.0)
    except Exception:
        pass
    _manager().shutdown()

def set_log_level(level: int | str) -> None:
    """Set the root logger level programmatically (e.g., 'INFO', logging.DEBUG)."""
    lvl = _coerce_level(level, logging.getLogger().level)
    logging.getLogger().setLevel(lvl)
    _LOGGER.warning("root log level set to %s (programmatic)", logging.getLevelName(lvl))

# --------------------------------------------------------------------------------------
# Demo
# --------------------------------------------------------------------------------------

if __name__ == "__main__":
    try:
        init_logging()
        with trace_context(trace_id="demo-trace", span_id="root-span", correlation_id="corr-123"):
            _LOGGER.info("Example INFO with context", extra={"foo": "bar", "user_id": 123})
            _LOGGER.debug("Example DEBUG (may be hidden)")
            try:
                1 / 0
            except ZeroDivisionError:
                _LOGGER.exception("Captured exception")
        time.sleep(0.2)
        print(get_log_stats())
    finally:
        shutdown_logging()
