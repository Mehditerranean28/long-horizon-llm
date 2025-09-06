#!/usr/bin/env python3
"""
Unit tests for the stdlib-only logging library.

Covers: settings, formatter, queue handling, backoff, watcher, streaming/TLS paths,
and public API. Uses targeted mocks to avoid real sockets and timers.

Run: python3 -m unittest this_file.py
"""

from dataclasses import replace
import json
import logging
import os
import queue
import struct
import sys
import tempfile
import time
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch
import zlib

try:
    from zoneinfo import ZoneInfo
except Exception:
    try:
        from backports.zoneinfo import ZoneInfo
    except Exception:
        ZoneInfo = None

from backend.kern.src.kern.core import (
    _CORR_ID,
    _SPAN_ID,
    _TRACE_ID,
    _Backoff,
    _FramerLen,
    _FramerV1,
    _JSONFormatter,
    _LogConfWatcher,
    _NBQueueHandler,
    BackoffSettings,
    FastEventLogger,
    LoggingSettings,
    TLSSettings,
    WatcherSettings,
    clear_trace_context,
    flush_and_drain,
    get_log_stats,
    init_logging,
    init_simple_logging,
    is_streaming_enabled,
    set_log_level,
    set_trace_context,
    shutdown_logging,
    trace_context,
)

# -----------------------------
# LoggingSettings
# -----------------------------

class TestLoggingSettings(unittest.TestCase):
    def test_from_env_defaults(self):
        with patch.dict(os.environ, {}):
            s = LoggingSettings.from_env()
            self.assertEqual(s.log_level, logging.INFO)
            self.assertTrue(s.log_stdout)
            self.assertFalse(s.log_stderr)
            self.assertFalse(s.log_stream)
            self.assertEqual(s.max_queue_size, 5000)
            self.assertTrue(s.drop_oldest_on_full)
            self.assertEqual(s.tz_name, "UTC")
            self.assertTrue(s.watcher.enabled)
            self.assertEqual(s.watcher.refresh_time, 5)
            self.assertFalse(s.tls.enabled)
            self.assertEqual(s.log_stream_protocols, "v1,len")
            self.assertTrue(s.protocol_crc32)
            self.assertEqual(s.connect_timeout_sec, 5.0)
            self.assertTrue(s.fast_time)
            self.assertTrue(s.use_orjson_if_available)
            self.assertTrue(s.dynamic_batching)
            self.assertTrue(s.eager_connect)
            self.assertEqual(s.pre_error_buffer_size, 64)
            self.assertEqual(s.pre_error_buffer_level, logging.DEBUG)

    def test_from_env_custom(self):
        env = {
            "LOG_LEVEL": "DEBUG",
            "LOG_STDOUT": "false",
            "LOG_STDERR": "true",
            "LOG_STREAM": "true",
            "LOG_STREAM_HOST": "custom-host",
            "LOG_STREAM_TCP_PORT": "9999",
            "LOG_STREAM_TLS_PORT": "8888",
            "LOG_STREAM_PROTOCOLS": "len,v1",
            "LOG_STREAM_PROTOCOL_CRC32": "false",
            "LOG_STREAM_CONNECT_TIMEOUT_SEC": "10.0",
            "LOG_STREAM_MAX_QUEUE_SIZE": "10000",
            "LOG_STREAM_DROP_OLDEST": "false",
            "TZ": "America/New_York",
            "LOG_USE_TIME_NS": "false",
            "LOG_MAX_EXTRA_VALUE_CHARS": "1024",
            "LOG_MAX_STACK_CHARS": "8192",
            "LOG_EXTRA_FIELDS_ENV": "EXTRA_JSON",
            "EXTRA_JSON": '{"static": "value"}',
            "LOG_PRESERVE_STRUCTURED_EXTRAS": "true",
            "LOG_STREAM_TLS_ENABLED": "true",
            "LOG_STREAM_ENFORCE_TLS": "true",
            "LOG_STREAM_TLS_MIN_VERSION": "1.3",
            "WATCH_LOG_CONF": "false",
            "LOG_REFRESH_TIME": "10",
            "LOG_WATCHER_BACKOFF_BASE": "1.0",
            "LOG_BACKOFF_BASE": "0.1",
            "LOG_STATS_REPORT_INTERVAL_SEC": "60",
            "LOG_FILE": "/tmp/logfile.log",
            "LOG_ROTATE_MAX_BYTES": "1000000",
            "LOG_ROTATE_BACKUP_COUNT": "3",
            "LOG_FAST_TIME": "false",
            "LOG_USE_ORJSON": "false",
            "LOG_DYNAMIC_BATCHING": "false",
            "LOG_EAGER_CONNECT": "false",
            "LOG_PRE_ERROR_BUFFER_SIZE": "128",
            "LOG_PRE_ERROR_BUFFER_LEVEL": "INFO",
        }
        with patch.dict(os.environ, env):
            s = LoggingSettings.from_env()
            self.assertEqual(s.log_level, logging.DEBUG)
            self.assertFalse(s.log_stdout)
            self.assertTrue(s.log_stderr)
            self.assertTrue(s.log_stream)
            self.assertEqual(s.log_stream_host, "custom-host")
            self.assertEqual(s.log_stream_tcp_port, 9999)
            self.assertEqual(s.log_stream_tls_port, 8888)
            self.assertEqual(s.log_stream_protocols, "len,v1")
            self.assertFalse(s.protocol_crc32)
            self.assertEqual(s.connect_timeout_sec, 10.0)
            self.assertEqual(s.max_queue_size, 10000)
            self.assertFalse(s.drop_oldest_on_full)
            self.assertEqual(s.tz_name, "America/New_York")
            self.assertFalse(s.use_time_ns)
            self.assertEqual(s.max_extra_value_chars, 1024)
            self.assertEqual(s.max_stack_chars, 8192)
            self.assertEqual(s.static_fields_json_env_var, "EXTRA_JSON")
            self.assertTrue(s.preserve_structured_extras)
            self.assertTrue(s.tls.enabled)
            self.assertTrue(s.tls.enforce)
            self.assertEqual(s.tls.min_version, "1.3")
            self.assertFalse(s.watcher.enabled)
            self.assertEqual(s.watcher.refresh_time, 10)
            self.assertEqual(s.watcher.backoff.base, 1.0)
            self.assertEqual(s.stream_backoff.base, 0.1)
            self.assertEqual(s.stats_report_interval_sec, 60)
            self.assertEqual(s.log_file, "/tmp/logfile.log")
            self.assertEqual(s.log_rotate_max_bytes, 1000000)
            self.assertEqual(s.log_rotate_backup_count, 3)
            self.assertFalse(s.fast_time)
            self.assertFalse(s.use_orjson_if_available)
            self.assertFalse(s.dynamic_batching)
            self.assertFalse(s.eager_connect)
            self.assertEqual(s.pre_error_buffer_size, 128)
            self.assertEqual(s.pre_error_buffer_level, logging.INFO)

    def test_validation_success(self):
        s = LoggingSettings()
        s._validate()  # no raise

    def test_validation_failures(self):
        with self.assertRaises(ValueError):
            LoggingSettings(watcher=WatcherSettings(refresh_time=0))._validate()
        with self.assertRaises(ValueError):
            LoggingSettings(max_queue_size=0)._validate()
        with self.assertRaises(ValueError):
            LoggingSettings(connect_timeout_sec=0, log_stream=True)._validate()
        with self.assertRaises(ValueError):
            LoggingSettings(log_stream_protocols="invalid")._validate()
        with self.assertRaises(ValueError):
            LoggingSettings(max_extra_value_chars=255)._validate()
        with self.assertRaises(ValueError):
            LoggingSettings(shutdown_timeout_sec=0)._validate()
        with self.assertRaises(ValueError):
            LoggingSettings(pre_error_buffer_size=-1)._validate()
        with self.assertRaises(ValueError):
            BackoffSettings(base=0.05).validate("test")
        with self.assertRaises(ValueError):
            BackoffSettings(factor=1.4).validate("test")
        with self.assertRaises(ValueError):
            BackoffSettings(jitter=1.0).validate("test")
        with self.assertRaises(ValueError):
            BackoffSettings(max_delay=0.1, base=0.5).validate("test")

    def test_tls_validation_enforce(self):
        with patch("os.path.isfile", return_value=False):
            with self.assertRaises(ValueError):
                LoggingSettings(tls=TLSSettings(enabled=True, enforce=True))._validate()

    def test_tls_validation_no_enforce_insecure_ok(self):
        with patch.dict(os.environ, {"LOG_ALLOW_INSECURE": "true"}):
            with patch("os.path.isfile", return_value=False):
                LoggingSettings(tls=TLSSettings(enabled=True, enforce=False))._validate()

    def test_tls_validation_no_enforce_no_insecure(self):
        with patch.dict(os.environ, {"LOG_ALLOW_INSECURE": "false"}):
            with patch("os.path.isfile", return_value=False):
                with self.assertRaises(ValueError):
                    LoggingSettings(tls=TLSSettings(enabled=True, enforce=False))._validate()

# -----------------------------
# _JSONFormatter
# -----------------------------

class TestJSONFormatter(unittest.TestCase):
    def setUp(self):
        self.settings = LoggingSettings(
            tz_name="UTC",
            use_time_ns=True,
            max_extra_value_chars=100,
            max_stack_chars=200,
            preserve_structured_extras=False,
        )
        self.formatter = _JSONFormatter(self.settings, sanitize_newlines=True, extra_static={"static_key": "static_val"})
        self.logger = logging.getLogger("test")
        self.record = self.logger.makeRecord("test", logging.INFO, "file.py", 10, "message %s", ("arg",), None)
        self.record.trace_id = "trace123"
        self.record.span_id = "span456"
        self.record.correlation_id = "corr789"
        self.record.created_ns = int(time.time_ns())
        self.record.extra_fields = {"extra_dict": {"nested": "val"}}

    def test_format_basic(self):
        out = self.formatter.format(self.record)
        data = json.loads(out)
        self.assertIn("timestamp", data)
        self.assertEqual(data["severity"], "INFO")
        self.assertEqual(data["message"], "message arg")
        self.assertEqual(data["trace_id"], "trace123")
        self.assertEqual(data["span_id"], "span456")
        self.assertEqual(data["correlation_id"], "corr789")
        self.assertEqual(data["static_key"], "static_val")
        self.assertIn("extra_dict", data)
        self.assertIsInstance(data["extra_dict"], str)

    def test_format_with_exception(self):
        try:
            raise ValueError("test error")
        except ValueError:
            exc_info = sys.exc_info()
        self.record.exc_info = exc_info
        out = self.formatter.format(self.record)
        data = json.loads(out)
        self.assertEqual(data["exc_type"], "ValueError")
        self.assertEqual(data["exc_message"], "test error")
        self.assertIn("stack", data)
        self.assertLessEqual(len(data["stack"]), 200 + len("...(truncated)"))

    def test_truncation(self):
        self.record.extra_fields = {"long_key": "a" * 200}
        out = self.formatter.format(self.record)
        data = json.loads(out)
        self.assertEqual(len(data["long_key"]), 100 + len("...(truncated)"))

    def test_preserve_structured_extras(self):
        self.settings = replace(self.settings, preserve_structured_extras=True)
        self.formatter = _JSONFormatter(self.settings, sanitize_newlines=True, extra_static={})
        self.record.extra_fields = {"struct": {"key": "val"}}
        out = self.formatter.format(self.record)
        data = json.loads(out)
        self.assertIsInstance(data["struct"], dict)
        self.assertEqual(data["struct"]["key"], "val")

    def test_sanitize_newlines(self):
        self.record.msg = "multi\nline"
        self.record.args = ()
        out = self.formatter.format(self.record)
        data = json.loads(out)
        self.assertEqual(data["message"], "multi_ls_line")

    def test_fast_time(self):
        ts = self.formatter._iso_ts(self.record)
        dt = datetime.fromisoformat(ts)
        # Don't rely on object identity; assert zero offset and +00:00 suffix.
        self.assertEqual(dt.utcoffset().total_seconds(), 0)
        self.assertTrue(ts.endswith("+00:00"))

    def test_fallback_on_json_fail(self):
        self.formatter._use_orjson = False
        with patch("json.dumps", side_effect=ValueError("mock fail")):
            out = self.formatter.format(self.record)
            data = json.loads(out)
            self.assertEqual(data["message"], "formatter serialization error")

# -----------------------------
# _NBQueueHandler
# -----------------------------

class TestNBQueueHandler(unittest.TestCase):
    def setUp(self):
        self.q = queue.Queue(maxsize=5)
        self.handler = _NBQueueHandler(self.q, drop_oldest=True)
        self.record = logging.LogRecord("name", logging.INFO, "path", 1, "msg", (), None)

    def test_enqueue_normal(self):
        self.handler.enqueue(self.record)
        self.assertEqual(self.q.qsize(), 1)
        got = self.q.get_nowait()
        self.assertEqual(got.msg, "msg")

    def test_drop_oldest(self):
        for i in range(5):
            rec = logging.LogRecord("name", logging.INFO, "path", 1, f"msg{i}", (), None)
            self.handler.enqueue(rec)
        self.assertEqual(self.q.qsize(), 5)
        new_rec = logging.LogRecord("name", logging.INFO, "path", 1, "new", (), None)
        self.handler.enqueue(new_rec)
        self.assertEqual(self.q.qsize(), 5)
        got = self.q.get_nowait()
        self.assertEqual(got.msg, "msg1")  # msg0 dropped

    def test_drop_newest(self):
        self.handler = _NBQueueHandler(self.q, drop_oldest=False)
        for i in range(5):
            rec = logging.LogRecord("name", logging.INFO, "path", 1, f"msg{i}", (), None)
            self.handler.enqueue(rec)
        new_rec = logging.LogRecord("name", logging.INFO, "path", 1, "new", (), None)
        self.handler.enqueue(new_rec)
        self.assertEqual(self.q.qsize(), 5)
        got = [self.q.get_nowait().msg for _ in range(5)]
        self.assertEqual(got, [f"msg{i}" for i in range(5)])

    def test_pre_error_buffer(self):
        q = queue.Queue(maxsize=10)
        handler = _NBQueueHandler(q, drop_oldest=True, ring_size=3, ring_level=logging.DEBUG)
        for i in range(5):
            handler.enqueue(logging.LogRecord("name", logging.DEBUG, "path", 1, f"debug{i}", (), None))
        self.assertEqual(q.qsize(), 5)
        handler.enqueue(logging.LogRecord("name", logging.INFO, "path", 1, "info", (), None))
        self.assertEqual(q.qsize(), 6)
        handler.enqueue(logging.LogRecord("name", logging.ERROR, "path", 1, "error", (), None))
        self.assertEqual(q.qsize(), 10)
        msgs = [q.get_nowait().msg for _ in range(10)]
        self.assertEqual(msgs[-4:], ["debug3", "debug4", "info", "error"])

    def test_pre_error_buffer_level(self):
        q = queue.Queue(maxsize=10)
        handler = _NBQueueHandler(q, drop_oldest=True, ring_size=3, ring_level=logging.INFO)
        handler.enqueue(logging.LogRecord("name", logging.DEBUG, "path", 1, "debug", (), None))
        self.assertEqual(q.qsize(), 1)  # enqueued, not ringed
        handler.enqueue(logging.LogRecord("name", logging.INFO, "path", 1, "info", (), None))
        self.assertEqual(q.qsize(), 2)
        self.assertEqual(len(handler._ring), 1)

# -----------------------------
# _Backoff
# -----------------------------

class TestBackoff(unittest.TestCase):
    def test_backoff_progression(self):
        b = _Backoff(base=1.0, factor=2.0, jitter=0.0, max_delay=10.0)
        self.assertEqual(b.current(), 0.0)
        self.assertEqual(b.on_error(), 1.0)
        self.assertEqual(b.current(), 1.0)
        self.assertEqual(b.on_error(), 2.0)
        self.assertEqual(b.on_error(), 4.0)
        self.assertEqual(b.on_error(), 8.0)
        self.assertEqual(b.on_error(), 10.0)  # capped
        b.on_success()
        self.assertEqual(b.current(), 0.0)

    def test_jitter(self):
        b = _Backoff(base=1.0, factor=2.0, jitter=0.5, max_delay=10.0)
        with patch("random.uniform", return_value=0.0):
            self.assertEqual(b.on_error(), 1.0)
            self.assertAlmostEqual(b.on_error(), 2.0 * (1 - 0.5), places=1)

# -----------------------------
# Framers
# -----------------------------

class TestFramers(unittest.TestCase):
    def test_framer_len(self):
        f = _FramerLen()
        framed = f.frame(b"test")
        self.assertEqual(framed, struct.pack(">L", 4) + b"test")

    def test_framer_v1_with_crc(self):
        f = _FramerV1(crc32_enabled=True)
        payload = b"test"
        crc = zlib.crc32(payload) & 0xFFFFFFFF
        expected = b"JL\x01" + struct.pack(">L", 4) + struct.pack(">L", crc) + payload
        self.assertEqual(f.frame(payload), expected)

    def test_framer_v1_no_crc(self):
        f = _FramerV1(crc32_enabled=False)
        framed = f.frame(b"test")
        self.assertEqual(framed, b"JL\x01" + struct.pack(">L", 4) + b"\x00\x00\x00\x00" + b"test")

# -----------------------------
# Watcher
# -----------------------------

class TestLogConfWatcher(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.k8s_path = os.path.join(self.temp_dir.name, "config")
        os.mkdir(self.k8s_path)
        self.level_file = os.path.join(self.k8s_path, "LOG_LEVEL")
        self.control_file = os.path.join(self.temp_dir.name, "logcontrol.json")
        self.settings = LoggingSettings(
            container_name="test_container",
            watcher=WatcherSettings(
                enabled=True,
                refresh_time=1,
                k8s_path=self.k8s_path,
                control_file=self.control_file,
                backoff=BackoffSettings(base=0.1, max_delay=1.0),
            ),
        )
        self.apply_root = MagicMock()
        self.apply_loggers = MagicMock()
        self.watcher = _LogConfWatcher(self.settings, self.apply_root, self.apply_loggers)
        self.watcher.start()
        time.sleep(0.2)  # let thread start

    def tearDown(self):
        self.watcher.stop()
        self.watcher.join(timeout=2.0)
        self.temp_dir.cleanup()

    def test_watch_level_file(self):
        with open(self.level_file, "w") as f:
            f.write("DEBUG")
        self.watcher._tick()
        self.apply_root.assert_called_with(logging.DEBUG, f"{self.level_file}:DEBUG")

    def test_watch_control_json(self):
        data = {
            "logcontrol": [{"container": "test_container", "severity": "WARNING", "loggers": {"test.logger": "ERROR"}}]
        }
        with open(self.control_file, "w") as f:
            json.dump(data, f)
        self.watcher._tick()
        self.apply_root.assert_called_with(logging.WARNING, self.control_file)
        self.apply_loggers.assert_called_with(data)

    def test_no_severity_fallback(self):
        data = {"logcontrol": [{"container": "other"}]}
        with open(self.control_file, "w") as f:
            json.dump(data, f)
        self.watcher._tick()
        self.apply_root.assert_called()  # falls back to default

    def test_backoff_on_error(self):
        with open(self.control_file, "w") as f:
            f.write("invalid")
        self.watcher._tick()  # just ensure no crash

# -----------------------------
# Streaming / TLS runtime paths
# -----------------------------

class TestStreamingHandler(unittest.TestCase):
    def setUp(self):
        shutdown_logging()

    def tearDown(self):
        shutdown_logging()

    def test_stream_retry_then_ok(self):
        # Force LOG_STREAM and non-TLS
        with patch.dict(os.environ, {"LOG_STREAM": "true", "LOG_STDOUT": "false", "LOG_STREAM_TLS_ENABLED": "false"}):
            # Make createSocket succeed immediately without real networking
            with patch("backend.kern.src.kern.core._LPBase.createSocket", autospec=True) as mock_create:
                def _create(self):
                    # any non-None value indicates "connected" to SocketHandler
                    self.sock = object()
                    return None
                mock_create.side_effect = _create

                # First send fails, second succeeds
                calls = {"n": 0}
                with patch("backend.kern.src.kern.core.lh.SocketHandler.send", autospec=True) as mock_send:
                    def _send(self, s, *args, **kwargs):
                        calls["n"] += 1
                        if calls["n"] == 1:
                            raise OSError("mock send fail")
                        # success thereafter
                        return None
                    mock_send.side_effect = _send

                    # Make backoff zero so retry happens immediately
                    with patch("backend.kern.src.kern.core._Backoff.on_error", return_value=0.0), \
                         patch("backend.kern.src.kern.core._Backoff.on_success", return_value=None):
                        init_logging()
                        logging.getLogger().error("trigger network path once")
                        ok = flush_and_drain(timeout_sec=2.0)
                        self.assertTrue(ok)

                        snap = get_log_stats()
                        self.assertGreaterEqual(snap["stream_connect_failures"], 1)
                        self.assertIsNone(snap["last_stream_error"])
                        self.assertEqual(snap["current_backoff_seconds"], 0.0)

    def test_tls_ctx_failure_enforce_raises(self):
        # Build settings that demand TLS, enforce=True, and pretend files exist
        with patch("os.path.isfile", return_value=True), \
             patch("ssl.create_default_context", side_effect=RuntimeError("ctx fail")):
            s = LoggingSettings(
                log_stream=True,
                log_stdout=False,
                tls=TLSSettings(enabled=True, enforce=True, min_version="1.2"),
            )
            # _validate passes (files "exist"), but init should fail fast due to TLS ctx error
            with self.assertRaises(RuntimeError):
                init_logging(s)

    def test_tls_ctx_failure_insecure_fallback(self):
        # enforce=False + LOG_ALLOW_INSECURE=true -> degrade to TCP, no raise
        with patch.dict(os.environ, {"LOG_ALLOW_INSECURE": "true"}), \
             patch("os.path.isfile", return_value=False), \
             patch("ssl.create_default_context", side_effect=RuntimeError("ctx fail")), \
             patch("backend.kern.src.kern.core._LPBase.createSocket", autospec=True) as mock_create:
            def _create(self):
                self.sock = object()
                return None
            mock_create.side_effect = _create

            s = LoggingSettings(
                log_stream=True,
                log_stdout=False,
                tls=TLSSettings(enabled=True, enforce=False, min_version="1.2"),
            )
            init_logging(s)
            logging.getLogger().info("hello over TCP fallback")
            self.assertTrue(flush_and_drain(timeout_sec=1.5))

# -----------------------------
# Public API
# -----------------------------

class TestPublicAPI(unittest.TestCase):
    def setUp(self):
        shutdown_logging()

    def tearDown(self):
        shutdown_logging()

    def test_init_logging(self):
        with patch.dict(os.environ, {"LOG_LEVEL": "DEBUG", "LOG_STDOUT": "true"}):
            init_logging()
            root = logging.getLogger()
            self.assertEqual(root.level, logging.DEBUG)
            self.assertTrue(any(isinstance(h, logging.StreamHandler) for h in root.handlers))

    def test_init_simple_logging(self):
        init_simple_logging(level="WARNING", stdout=False, stderr=True)
        root = logging.getLogger()
        self.assertEqual(root.level, logging.WARNING)
        self.assertTrue(any(isinstance(h, logging.StreamHandler) and h.stream is sys.stderr for h in root.handlers))

    def test_set_log_level(self):
        init_simple_logging()
        set_log_level("ERROR")
        self.assertEqual(logging.getLogger().level, logging.ERROR)

    def test_trace_context(self):
        set_trace_context(trace_id="t1", span_id="s1", correlation_id="c1")
        self.assertEqual(_TRACE_ID.get(), "t1")
        self.assertEqual(_SPAN_ID.get(), "s1")
        self.assertEqual(_CORR_ID.get(), "c1")
        with trace_context(trace_id="t2"):
            self.assertEqual(_TRACE_ID.get(), "t2")
        self.assertEqual(_TRACE_ID.get(), "t1")
        clear_trace_context()
        self.assertIsNone(_TRACE_ID.get())

    def test_fast_event_logger(self):
        init_simple_logging()
        fel = FastEventLogger("test", bound_key="bound_val")
        with patch.object(logging.getLogger("test"), "log") as mock_log:
            fel.info("msg", extra_key="extra_val")
            mock_log.assert_called_with(
                logging.INFO,
                "msg",
                extra={"extra_fields": {"bound_key": "bound_val", "extra_key": "extra_val"}},
            )

    def test_get_log_stats_and_flush(self):
        init_simple_logging()
        logging.getLogger().info("one")
        logging.getLogger().info("two")
        # No network queues — should drain trivially.
        self.assertTrue(flush_and_drain(timeout_sec=1.0))
        stats = get_log_stats()
        self.assertIn("emitted_lines", stats)
        self.assertIn("dropped_lines", stats)

    def test_is_streaming_enabled(self):
        with patch.dict(os.environ, {"LOG_STREAM": "false"}):
            init_logging()
            self.assertFalse(is_streaming_enabled())
        shutdown_logging()
        with patch.dict(os.environ, {"LOG_STREAM": "true"}):
            init_logging()
            self.assertTrue(is_streaming_enabled())


if __name__ == "__main__":
    unittest.main()
