from .core import (
    LoggingSettings,
    init_logging,
    init_simple_logging,
    flush_and_drain,
    shutdown_logging,
    set_log_level,
    set_trace_context,
    clear_trace_context,
    trace_context,
    get_log_stats,
    is_streaming_enabled,
    is_streaming_healthy,
)

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
]

try:
    from importlib.metadata import version, PackageNotFoundError
except Exception:
    try:
        from importlib_metadata import version, PackageNotFoundError
    except Exception:
        version = None
        PackageNotFoundError = Exception

if version is not None:
    try:
        __version__ = version("kern-logging")
    except PackageNotFoundError:
        __version__ = "0.0.0"
else:
    __version__ = "0.0.0"
