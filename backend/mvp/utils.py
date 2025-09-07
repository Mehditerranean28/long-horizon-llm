# -*- coding: utf-8 -*-
"""Utilities: logging, text sanitation, JSON extraction, embeddings, QA helpers, rate limiting."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import re
import statistics
from collections import deque
from dataclasses import asdict
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

try:
    import numpy as np
except Exception:  # pragma: no cover - optional dependency
    np = None  # type: ignore

from config import (
    GLOBAL_BURST_WINDOW_SEC,
    GLOBAL_MAX_CONCURRENT,
    GLOBAL_QPS,
    KLINE_EMBED_DIM,
)

# ------------------------------- Logging --------------------------------------
from backend.kern.src.kern.core import init_logging

init_logging()

LOG = logging.getLogger("blackboard")
AUDIT = logging.getLogger("blackboard.audit")
AUDIT.propagate = False


# --------------------------- Text & JSON helpers ------------------------------

_CTRL = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]")


def sanitize_text(s: str) -> str:
    return _CTRL.sub("", str(s)).replace("\r\n", "\n").replace("\r", "\n")


class _SafeFormatDict(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def fmt(template: str, /, **kwargs: Any) -> str:
    safe_kwargs = {k: ("" if v is None else str(v)) for k, v in kwargs.items()}
    return str(template).format_map(_SafeFormatDict(safe_kwargs))


def safe_json_loads(s: str, default: Any = None) -> Any:
    try:
        return json.loads(s)
    except Exception:
        return default


def first_json_object(s: str, *, max_scan: int = 300_000) -> Optional[str]:
    s = sanitize_text(s)
    start_obj, start_arr = s.find("{"), s.find("[")
    i = min(x for x in (start_obj, start_arr) if x != -1) if (start_obj != -1 or start_arr != -1) else -1
    if i < 0:
        return None
    open_char = s[i]
    close_char = "}" if open_char == "{" else "]"
    depth = 0
    in_str = False
    esc = False
    for j, c in enumerate(s[i:], i):
        if j - i > max_scan:
            break
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == open_char:
            depth += 1
        elif c == close_char:
            depth -= 1
            if depth == 0:
                return s[i : j + 1]
    return None


_slug_re = re.compile(r"[^a-z0-9_-]+")


def slug(s: str, fallback: str) -> str:
    s = _slug_re.sub("-", s.lower()).strip("-_")
    return s or fallback


_HDR = re.compile(r"^\s{0,3}(#+)\s+(.+?)\s*$", re.M)


def ensure_header(text: str, wanted: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
    headers = [m.group(2).strip().lower() for m in _HDR.finditer(text)]
    if wanted.lower() in headers:
        return True, None
    return False, {"level": 2, "title": wanted}


# -------------------------- Embeddings & Similarity ---------------------------


def hash_embed(text: str, dim: int = KLINE_EMBED_DIM) -> List[float]:
    text = re.sub(r"\s+", " ", text.strip().lower())
    toks = re.findall(r"[a-z0-9]+", text)
    if not toks:
        return [0.0] * dim

    vec = [0.0] * dim

    def _acc(s: str) -> None:
        h = int(hashlib.blake2b(s.encode(), digest_size=8).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if (h & 1) else -1.0
        vec[idx] += sign

    for i, t in enumerate(toks):
        _acc(t)
        if i + 1 < len(toks):
            _acc(t + "_" + toks[i + 1])

    n = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / n for v in vec]


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b:
        return 0.0
    if np is None:
        num = sum(x * y for x, y in zip(a, b))
        denom = (sum(x * x for x in a) ** 0.5) * (sum(y * y for y in b) ** 0.5) or 1.0
        return float(num / denom) if denom else 0.0
    na, nb = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    denom = float(np.linalg.norm(na) * np.linalg.norm(nb)) or 1.0
    return float(np.dot(na, nb) / denom)


def quantize(v: List[float]) -> List[int]:
    return [max(-127, min(127, int(round(x * 127)))) for x in v]


def dequantize(q: List[int]) -> List[float]:
    return [x / 127.0 for x in q]


# ------------------------------ QA / Patching --------------------------------

from bb_types import Contract, Issue, Patch, QAResult, TestSpec  # circular-safe


def run_tests(content: str, contract: Contract) -> QAResult:
    issues: List[Issue] = []
    words = len(re.findall(r"\b\w+\b", content))
    if words < 1:
        issues.append(Issue("empty"))
    for t in contract.tests:
        if t.kind == "nonempty" and words < 1:
            issues.append(Issue("nonempty_fail"))
        elif t.kind == "regex":
            try:
                if not re.search(str(t.arg), content, re.I | re.M):
                    issues.append(Issue("regex_fail", {"pattern": t.arg}))
            except re.error:
                issues.append(Issue("regex_invalid", {"pattern": t.arg}))
        elif t.kind == "contains" and str(t.arg).lower() not in content.lower():
            issues.append(Issue("contains_missing", {"needle": t.arg}))
        elif t.kind == "word_count_min":
            need = int(t.arg) if isinstance(t.arg, (int, str)) else 50
            if words < need:
                issues.append(
                    Issue("too_short", {"needed": need, "have": words}, [Patch("append_text", {"hint": f"Expand with {need - words}+ words."})])
                )
        elif t.kind == "header_present":
            want = str(t.arg)
            ok, patch = ensure_header(content, want)
            if not ok:
                suggested = Patch("insert_header", patch) if patch else None
                issues.append(Issue("header_missing", {"wanted": want}, [suggested] if suggested else []))
    return QAResult(len(issues) == 0, issues)


def apply_patches(content: str, patches: Sequence[Patch]) -> str:
    out = content
    for p in patches:
        if p.kind == "insert_header":
            title = p.arg.get("title", "Section")
            level = p.arg.get("level", 2)
            hdr = "#" * max(1, min(6, level)) + " " + title + "\n"
            if not out.strip():
                out = hdr
            else:
                lines = out.splitlines()
                if lines and lines[0].startswith("#"):
                    lines[0] = hdr.strip()
                else:
                    lines.insert(0, hdr.strip())
                out = "\n".join(lines)
        elif p.kind == "append_text":
            hint = p.arg.get("hint", "").strip()
            if hint:
                out = out.rstrip() + "\n\n" + hint + "\n"
        elif p.kind == "prepend_text":
            hint = p.arg.get("hint", "").strip()
            if hint:
                out = hint + "\n\n" + out.lstrip()
        elif p.kind == "regex_sub":
            pat = p.arg.get("pattern", "")
            repl = p.arg.get("repl", "")
            try:
                out = re.sub(pat, repl, out, flags=re.M)
            except re.error as e:
                AUDIT.info(json.dumps({"regex_sub_error": {"pattern": pat[:256], "error": str(e)}}, ensure_ascii=False))
    return out


# ------------------------------ Rate Limiting --------------------------------


class _SlidingWindowLimiter:
    def __init__(self, rate: int, per: float) -> None:
        self.rate = max(1, rate)
        self.per = float(per)
        self._events: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        loop = asyncio.get_running_loop()
        while True:
            async with self._lock:
                now = loop.time()
                while self._events and now - self._events[0] > self.per:
                    self._events.popleft()
                if len(self._events) < self.rate:
                    self._events.append(now)
                    return
                sleep_for = self.per - (now - self._events[0])
            await asyncio.sleep(max(0.0, sleep_for))


class GlobalRateLimiter:
    def __init__(self, max_concurrent: int, qps: int, burst_window_sec: float) -> None:
        self._conc = asyncio.Semaphore(max_concurrent)
        self._rate = _SlidingWindowLimiter(qps, burst_window_sec)

    class _Slot:
        def __init__(self, outer: "GlobalRateLimiter") -> None:
            self.outer = outer

        async def __aenter__(self) -> None:
            await self.outer._rate.acquire()
            await self.outer._conc.acquire()

        async def __aexit__(self, exc_type, exc, tb) -> None:
            self.outer._conc.release()

    def slot(self) -> "_Slot":
        return self._Slot(self)


GLOBAL_LIMITER = GlobalRateLimiter(GLOBAL_MAX_CONCURRENT, GLOBAL_QPS, GLOBAL_BURST_WINDOW_SEC)


# ------------------------------ Misc helpers ---------------------------------


def approx_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def clip_chars(s: str, max_tokens: int) -> str:
    """Roughly clip to token budget (chars ~= 4*tokens)."""
    max_chars = max_tokens * 4
    return s if len(s) <= max_chars else s[:max_chars]


def audit_event(kind: str, payload: Mapping[str, Any]) -> None:
    AUDIT.info(json.dumps({kind: payload}, ensure_ascii=False))


def dataclass_to_json(obj: Any) -> str:
    try:
        return json.dumps(asdict(obj), ensure_ascii=False)
    except Exception:
        return "{}"


def summarize_neighbors(neighbors: Sequence[Tuple[str, float, Dict[str, Any]]], *, char_budget: int = 2000) -> str:
    if not neighbors:
        return ""
    avg_sim = statistics.mean(sim for _, sim, _ in neighbors)
    lines = [f"PRIOR HINTS (n={len(neighbors)}, avg_sim={avg_sim:.2f})"]
    return "\n".join(lines)[:char_budget]
