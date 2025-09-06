# kern-logging

**Structured Logging for Serious Systems**

`kern-logging` is a resilient, production-grade logging framework for Python.
Designed for **finance, data science, and mission-critical applications**, it treats logs not as debug noise but as **verifiable evidence**.

## ✨ Key Features

* **Strict JSON logs** — ISO-8601 timestamps, schema versioning
* **Trace propagation** — `trace_id`, `span_id`, `correlation_id`
* **Async TCP/TLS streaming** — CRC32 integrity & exponential backoff
* **Dynamic log levels** — hot-reload via Kubernetes or JSON control plane
* **Health metrics** — emitted, dropped, queue depth, backoff, last error
* **Zero dependencies** — implemented entirely with the Python standard library

## 📦 Installation

```bash
pip install kern-logging
```

## 🚀 Quickstart

```python
import logging
from kern import init_logging, trace_context, get_log_stats

init_logging()

with trace_context(trace_id="T-42", span_id="S-1"):
    logging.getLogger("example").info("Structured log with context")

print(get_log_stats())
```
