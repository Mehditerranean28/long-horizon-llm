#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import gc
import importlib.util
import io
import json
import logging
import os
import statistics
import sys
import threading
import time
from dataclasses import dataclass, asdict
from typing import Callable, Dict, List, Optional

# ---------- Optional imports (resolved lazily) ----------
def _is_available(pkg: str) -> bool:
    return importlib.util.find_spec(pkg) is not None

HAS_PSUTIL = _is_available("psutil")
if HAS_PSUTIL:
    import psutil  # type: ignore

# ---------- Utilities ----------
def rss_mb() -> Optional[float]:
    if not HAS_PSUTIL:
        return None
    try:
        p = psutil.Process()
        return p.memory_info().rss / (1024 * 1024)
    except Exception:
        return None

def now() -> float:
    return time.perf_counter()

def mean_ms_per_log(duration_s: float, n: int) -> float:
    if n <= 0 or duration_s <= 0:
        return 0.0
    return (duration_s / n) * 1000.0

# ---------- Benchmark cases ----------
CASES = ("info", "extras", "exception", "context")

# ---------- Base Framework Adapter ----------
class Framework:
    name: str = "base"

    def available(self) -> bool:
        return True

    def setup(self) -> None:
        """Install handlers to write to in-memory sink; set INFO level."""
        raise NotImplementedError

    def teardown(self) -> None:
        """Remove handlers and clean up any background threads."""
        pass

    def emit_factory(self, case: str) -> Callable[[], None]:
        """Return a zero-arg callable that emits exactly one log line for the `case`."""
        raise NotImplementedError

    def bytes_out(self) -> int:
        """Return number of bytes written to the sink(s)."""
        return 0

# ---------- Stdlib JSON (DIY minimal) ----------
class _MinimalJSONFormatter(logging.Formatter):
    _RESERVED = set(vars(logging.LogRecord("", 0, "", 0, "", (), None, None)).keys())

    def format(self, record: logging.LogRecord) -> str:
        try:
            msg = record.getMessage()
        except Exception:
            msg = "<unformattable>"
        payload: Dict[str, object] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": msg,
        }
        # extras (best-effort)
        for k, v in record.__dict__.items():
            if k not in self._RESERVED and not k.startswith("_"):
                try:
                    json.dumps(v)
                    payload[k] = v
                except Exception:
                    payload[k] = str(v)
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, separators=(",", ":"))

class StdlibFramework(Framework):
    name = "stdlib"
    def __init__(self) -> None:
        self._buf = io.StringIO()
        self._handler: Optional[logging.Handler] = None
        self._logger = logging.getLogger("bench.stdlib")

    def setup(self) -> None:
        self._logger.propagate = False
        self._logger.setLevel(logging.INFO)
        self._handler = logging.StreamHandler(self._buf)
        self._handler.setFormatter(_MinimalJSONFormatter())
        self._logger.addHandler(self._handler)

    def teardown(self) -> None:
        try:
            if self._handler:
                self._handler.flush()
                self._logger.removeHandler(self._handler)
                self._handler.close()
        except Exception:
            pass
        self._buf.seek(0); self._buf.truncate(0)

    def emit_factory(self, case: str) -> Callable[[], None]:
        extras = {"user_id": 123, "order_total": 42.75, "tags": ["a", "b", "c"], "ok": True}
        if case == "info":
            return lambda: self._logger.info("hello world")
        if case == "extras":
            return lambda: self._logger.info("with extras", extra=extras)
        if case == "exception":
            def _emit():
                try:
                    1/0
                except ZeroDivisionError:
                    self._logger.exception("boom")
            return _emit
        if case == "context":
            # Simulate context injection via LoggerAdapter
            adapter = logging.LoggerAdapter(self._logger, {"trace_id": "T-42", "span_id": "S-1"})
            return lambda: adapter.info("ctx")
        raise ValueError(f"unknown case: {case}")

    def bytes_out(self) -> int:
        data = self._buf.getvalue().encode("utf-8", errors="ignore")
        return len(data)

# ---------- kern-logging ----------
class KernFramework(Framework):
    name = "kern"
    def __init__(self) -> None:
        self._buf = io.StringIO()
        self._logger = logging.getLogger("bench.kern")
        self._stdout_cm: Optional[contextlib.AbstractContextManager] = None
        self._inited = False

    def setup(self) -> None:
        if not _is_available("kern"):
            raise RuntimeError("kern-logging not importable; is the package installed?")
        from kern import init_logging, LoggingSettings, flush_and_drain  # type: ignore
        self._flush = flush_and_drain

        # Route sys.stdout to in-memory before init so StreamHandler points to our buffer.
        self._stdout_cm = contextlib.redirect_stdout(self._buf)
        self._stdout_cm.__enter__()

        s = LoggingSettings()
        # disable watcher/network; stdout only
        s = s.__class__(**{
            **s.__dict__,
            "watcher": s.watcher.__class__(**{**s.watcher.__dict__, "enabled": False}),
            "log_stdout": True, "log_stderr": False, "log_stream": False,
            "log_level": logging.INFO,
            "preserve_structured_extras": True,   # closer to native structured
        })
        init_logging(s)
        self._logger.setLevel(logging.INFO)

        # Ensure kern root doesn't propagate into our stdlib bench logger
        self._logger.propagate = True
        self._inited = True

    def teardown(self) -> None:
        try:
            if self._inited:
                # best-effort flush
                try:
                    self._flush(timeout_sec=2.0)
                except Exception:
                    pass
                # restore stdout
                if self._stdout_cm:
                    try: self._stdout_cm.__exit__(None, None, None)
                    except Exception: pass
                    self._stdout_cm = None
        finally:
            self._buf.seek(0); self._buf.truncate(0)

    def emit_factory(self, case: str) -> Callable[[], None]:
        from kern import trace_context  # type: ignore
        lg = logging.getLogger("bench.kern")
        extras = {"user_id": 123, "order_total": 42.75, "tags": ["a", "b", "c"], "ok": True}

        if case == "info":
            return lambda: lg.info("hello world")
        if case == "extras":
            return lambda: lg.info("with extras", extra=extras)
        if case == "exception":
            def _emit():
                try:
                    1/0
                except ZeroDivisionError:
                    lg.exception("boom")
            return _emit
        if case == "context":
            def _emit():
                with trace_context(trace_id="T-42", span_id="S-1", correlation_id="C-9"):
                    lg.info("ctx")
            return _emit
        raise ValueError(f"unknown case: {case}")

    def bytes_out(self) -> int:
        data = self._buf.getvalue().encode("utf-8", errors="ignore")
        return len(data)

# ---------- Loguru ----------
class LoguruFramework(Framework):
    name = "loguru"
    def __init__(self) -> None:
        self._buf = io.StringIO()
        self._logger = None
        self._sink_id = None

    def available(self) -> bool:
        return _is_available("loguru")

    def setup(self) -> None:
        from loguru import logger  # type: ignore
        self._logger = logger
        self._logger.remove()
        # JSON serialization built-in
        self._sink_id = self._logger.add(self._buf, serialize=True, level="INFO")

    def teardown(self) -> None:
        if self._logger and self._sink_id is not None:
            try:
                self._logger.remove(self._sink_id)
            except Exception:
                pass
        self._buf.seek(0); self._buf.truncate(0)

    def emit_factory(self, case: str) -> Callable[[], None]:
        lg = self._logger
        if lg is None:
            raise RuntimeError("not set up")
        extras = {"user_id": 123, "order_total": 42.75, "tags": ["a", "b", "c"], "ok": True}

        if case == "info":
            return lambda: lg.info("hello world")
        if case == "extras":
            return lambda: lg.bind(**extras).info("with extras")
        if case == "exception":
            def _emit():
                try:
                    1/0
                except ZeroDivisionError:
                    lg.exception("boom")
            return _emit
        if case == "context":
            return lambda: lg.bind(trace_id="T-42", span_id="S-1", correlation_id="C-9").info("ctx")
        raise ValueError(f"unknown case: {case}")

    def bytes_out(self) -> int:
        return len(self._buf.getvalue().encode("utf-8", errors="ignore"))

# ---------- structlog ----------
class StructlogFramework(Framework):
    name = "structlog"
    def __init__(self) -> None:
        self._buf = io.StringIO()
        self._handler: Optional[logging.Handler] = None
        self._lg = None

    def available(self) -> bool:
        return _is_available("structlog")

    def setup(self) -> None:
        import structlog  # type: ignore
        # Configure structlog to JSON-serialize into stdlib logger -> StreamHandler(StringIO)
        self._handler = logging.StreamHandler(self._buf)
        self._handler.setFormatter(logging.Formatter("%(message)s"))
        root = logging.getLogger("bench.structlog")
        root.setLevel(logging.INFO)
        root.handlers[:] = [self._handler]
        root.propagate = False

        structlog.configure(
            processors=[
                structlog.processors.add_log_level,
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.JSONRenderer(separators=(",", ":")),
            ],
            wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
            logger_factory=structlog.stdlib.LoggerFactory(),
            cache_logger_on_first_use=True,
        )
        self._lg = structlog.get_logger("bench.structlog")

    def teardown(self) -> None:
        try:
            if self._handler:
                self._handler.flush()
                logging.getLogger("bench.structlog").removeHandler(self._handler)
                self._handler.close()
        except Exception:
            pass
        self._buf.seek(0); self._buf.truncate(0)

    def emit_factory(self, case: str) -> Callable[[], None]:
        lg = self._lg
        if lg is None:
            raise RuntimeError("not set up")
        extras = {"user_id": 123, "order_total": 42.75, "tags": ["a", "b", "c"], "ok": True}

        if case == "info":
            return lambda: lg.info("hello world")
        if case == "extras":
            return lambda: lg.info("with extras", **extras)
        if case == "exception":
            def _emit():
                try:
                    1/0
                except ZeroDivisionError:
                    lg.exception("boom", exc_info=True)
            return _emit
        if case == "context":
            import structlog.contextvars as ctx  # type: ignore
            def _emit():
                ctx.bind_contextvars(trace_id="T-42", span_id="S-1", correlation_id="C-9")
                lg.info("ctx")
                ctx.clear_contextvars()
            return _emit
        raise ValueError(f"unknown case: {case}")

    def bytes_out(self) -> int:
        return len(self._buf.getvalue().encode("utf-8", errors="ignore"))

# ---------- Runner ----------
@dataclass
class Result:
    framework: str
    case: str
    threads: int
    n: int
    duration_s: float
    throughput_lps: float
    ms_per_log: float
    bytes_out: int
    rss_mb: Optional[float]

def _run_once(fw: Framework, case: str, n: int, threads: int) -> Result:
    fw.setup()
    try:
        emit = fw.emit_factory(case)

        # Divide work evenly; first few threads get the remainder.
        per_thread = n // threads
        remainder = n % threads
        counts = [per_thread + (1 if i < remainder else 0) for i in range(threads)]

        # Tiny warmup to prime caches/JITs
        for _ in range(1000):
            emit()

        # IMPORTANT: clear pre-run bytes so warmup doesn't inflate results
        pre_bytes = fw.bytes_out()

        # Synchronize workers to start at the same time
        start_event = threading.Event()
        ready = threading.Barrier(threads + 1)

        def worker(k: int) -> None:
            # announce ready
            ready.wait()
            # wait for simultaneous start
            start_event.wait()
            for _ in range(k):
                emit()

        ths: List[threading.Thread] = [threading.Thread(target=worker, args=(c,)) for c in counts]
        for t in ths:
            t.start()

        # Wait until all threads are ready, then settle GC and start
        ready.wait()
        gc.collect()
        time.sleep(0.005)  # tiny settle to reduce scheduling noise

        before_rss = rss_mb()
        t0 = now()
        start_event.set()
        for t in ths:
            t.join()
        dur = max(1e-9, now() - t0)
        after_rss = rss_mb()

        # Collect
        total_bytes = max(0, fw.bytes_out() - pre_bytes)
        lps = n / dur
        ms = mean_ms_per_log(dur, n)
        r = Result(
            framework=fw.name,
            case=case,
            threads=threads,
            n=n,
            duration_s=dur,
            throughput_lps=lps,
            ms_per_log=ms,
            bytes_out=total_bytes,
            rss_mb=(after_rss if after_rss is not None else before_rss),
        )
        return r
    finally:
        fw.teardown()

def pick_frameworks(names: Optional[str]) -> List[Framework]:
    candidates: List[Framework] = [KernFramework(), StdlibFramework(), LoguruFramework(), StructlogFramework()]
    if not names:
        # Auto: keep only available ones (kern required)
        out: List[Framework] = []
        for c in candidates:
            if c.name == "kern" or c.available():
                out.append(c)
        return out
    wanted = {x.strip().lower() for x in names.split(",") if x.strip()}
    out: List[Framework] = []
    for c in candidates:
        if c.name in wanted:
            if c.name != "kern" and not c.available():
                print(f"[skip] framework '{c.name}' not installed")
                continue
            out.append(c)
    return out

def _parse_thread_list(s: str, fallback: int) -> List[int]:
    if not s:
        return [max(1, int(fallback))]
    out: List[int] = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            v = int(part)
            if v >= 1:
                out.append(v)
        except ValueError:
            pass
    return out or [max(1, int(fallback))]

# ---------- CLI ----------
def main() -> None:
    ap = argparse.ArgumentParser(description="kern-logging benchmark suite")
    ap.add_argument("--frameworks", help="comma-separated: kern,stdlib,loguru,structlog")
    ap.add_argument("--cases", default="info,extras,exception,context")
    ap.add_argument("--n", type=int, default=5000, help="messages per run (total across all threads)")
    ap.add_argument("--threads", type=int, default=1, help="thread count if --threads-list not provided")
    ap.add_argument("--threads-list", default="", help="run multiple thread counts (comma-separated), e.g. 1,2,4,8")
    ap.add_argument("--repeats", type=int, default=3, help="repetitions per (framework,case,threads)")
    ap.add_argument("--csv", help="write results CSV to path")
    ap.add_argument("--json", help="write results JSON to path")
    ap.add_argument("--no-header", action="store_true", help="suppress table header")
    args = ap.parse_args()

    frameworks = pick_frameworks(args.frameworks)
    if not any(f.name == "kern" for f in frameworks):
        print("kern framework is required. Install your package first (pip install -e .).")
        sys.exit(2)

    caselist = [c.strip() for c in args.cases.split(",") if c.strip() in CASES]
    if not caselist:
        print(f"No valid cases. Choose from: {', '.join(CASES)}")
        sys.exit(2)

    thread_counts = _parse_thread_list(args.threads_list, args.threads)

    results: List[Result] = []

    for thr in thread_counts:
        for fw in frameworks:
            for case in caselist:
                runs: List[Result] = []
                for _ in range(args.repeats):
                    r = _run_once(fw, case, args.n, thr)
                    runs.append(r)
                # Aggregate: median duration -> median throughput implied
                dur_med = statistics.median([r.duration_s for r in runs])
                bytes_med = int(statistics.median([r.bytes_out for r in runs]))
                rss_vals = [r.rss_mb for r in runs if r.rss_mb is not None]
                rss_med = float(statistics.median(rss_vals)) if rss_vals else None

                agg = Result(
                    framework=fw.name,
                    case=case,
                    threads=thr,
                    n=args.n,
                    duration_s=dur_med,
                    throughput_lps=args.n / dur_med,
                    ms_per_log=mean_ms_per_log(dur_med, args.n),
                    bytes_out=bytes_med,
                    rss_mb=rss_med,
                )
                results.append(agg)

    # Pretty print
    if not args.no_header:
        print(f"{'framework':<10} {'case':<10} {'thr':>3} {'n':>9}  {'logs/s':>12}  {'ms/log':>8}  {'bytes_out':>10}  {'rss(MB)':>8}")
        print("-" * 80)
    for r in results:
        print(f"{r.framework:<10} {r.case:<10} {r.threads:>3} {r.n:>9}  {r.throughput_lps:>12.0f}  {r.ms_per_log:>8.3f}  {r.bytes_out:>10}  {r.rss_mb if r.rss_mb is not None else '':>8}")

    # CSV / JSON
    if args.csv:
        os.makedirs(os.path.dirname(args.csv) or ".", exist_ok=True)
        with open(args.csv, "w", encoding="utf-8") as f:
            f.write("framework,case,threads,n,duration_s,throughput_lps,ms_per_log,bytes_out,rss_mb\n")
            for r in results:
                f.write(f"{r.framework},{r.case},{r.threads},{r.n},{r.duration_s:.6f},{r.throughput_lps:.3f},{r.ms_per_log:.6f},{r.bytes_out},{'' if r.rss_mb is None else f'{r.rss_mb:.2f}'}\n")
        print(f"[saved] {args.csv}")
    if args.json:
        os.makedirs(os.path.dirname(args.json) or ".", exist_ok=True)
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump([asdict(r) for r in results], f, indent=2)
        print(f"[saved] {args.json}")

if __name__ == "__main__":
    main()
