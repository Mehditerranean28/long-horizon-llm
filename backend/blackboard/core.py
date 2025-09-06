"""
core.py - Foundational code for Blackboard Orchestrator.
This module is intentionally kept low-level and dependency-free
(other than stdlib + numpy if explicitly enabled).

Includes:
  - Error types
  - Constants & regex patterns
  - Sanitization & JSON helpers
  - Embedding + similarity
  - Rate limiting primitives
  - Core dataclasses (Contract, Node, Plan, Artifact, etc.)
  - Classification helpers
  - QA patch helpers
"""

from __future__ import annotations

import os
import re
import json
import math
import time
import hashlib
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from dataclasses import dataclass, field

import numpy as np


# ============================================================
# Errors
# ============================================================

class BlackboardError(Exception):
    """Base error for blackboard system."""


class PlanningError(BlackboardError):
    """Raised when plan generation fails."""


class QAError(BlackboardError):
    """Raised when QA steps fail."""


class CompositionError(BlackboardError):
    """Raised when artifacts cannot be composed."""


# ============================================================
# Constants & Regex
# ============================================================

_CTRL = re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F]')

_GLOBAL_MAX_CONCURRENT = int(os.getenv("GLOBAL_MAX_CONCURRENT", "16"))
_GLOBAL_QPS = int(os.getenv("GLOBAL_QPS", "8"))
_GLOBAL_BURST_WINDOW = float(os.getenv("GLOBAL_BURST_WINDOW", "1.0"))

KLINE_MAX_ENTRIES = int(os.getenv("KLINE_MAX_ENTRIES", "2000"))
AUDIT_MAX_CHARS = int(os.getenv("AUDIT_MAX_CHARS", "8192"))

_DELIVERABLE = re.compile(
    r"\b(design|architecture|spec|contract|roadmap|benchmark|compare|trade[- ]?offs?|rfc|plan|protocol|implementation|experiment|evaluate)\b",
    re.I,
)
_DEPENDENCY = re.compile(
    r"\b(after|before|then|depends|precede|follow|stage|phase|blocker|unblock)\b",
    re.I,
)
_BULLET = re.compile(r"(^\s*[-*]\s+|\d+\.\s+)", re.M)


# ============================================================
# Sanitization & JSON helpers
# ============================================================

def _sanitize_text(s: str) -> str:
    """Remove control chars and normalize newlines."""
    if not isinstance(s, str):
        return ""
    s = _CTRL.sub("", s)
    return s.replace("\r\n", "\n").replace("\r", "\n")


def safe_json_loads(s: str, default: Any = None) -> Any:
    """Parse JSON safely; return default on error."""
    try:
        return json.loads(s)
    except Exception:
        return default


# ============================================================
# Embedding & Similarity
# ============================================================

def _hash_embed(text: str, dim: int = 256) -> List[float]:
    """
    Deterministic, dependency-free embedding.
    - token unigrams + bigrams
    - hashed into `dim` bins with ±1 signed feature hashing
    - L2-normalized
    """
    text = re.sub(r"\s+", " ", (text or "").strip().lower())
    toks = re.findall(r"[a-z0-9]+", text)
    if not toks:
        return [0.0] * dim

    vec = np.zeros(dim)

    def _acc(s: str) -> None:
        h = int(hashlib.blake2b(s.encode("utf-8"), digest_size=8).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if ((h >> 1) & 1) else -1.0
        vec[idx] += sign

    for i, t in enumerate(toks):
        _acc(t)
        if i + 1 < len(toks):
            _acc(t + "_" + toks[i + 1])

    n = np.linalg.norm(vec) or 1.0
    return (vec / n).tolist()


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity for equal-length vectors. Returns [-1, 1]."""
    a_arr = np.array(a)
    b_arr = np.array(b)
    if a_arr.size == 0 or b_arr.size == 0:
        return 0.0
    s = np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr) or 1.0)
    return float(np.clip(s, -1.0, 1.0))


def _quantize(v: List[float]) -> List[int]:
    return np.clip(np.round(np.array(v) * 127), -127, 127).astype(int).tolist()


def _dequantize(q: List[int]) -> List[float]:
    return (np.array(q) / 127.0).tolist()


# ============================================================
# Rate Limiter
# ============================================================

class _SlidingWindowLimiter:
    """Sliding window rate limiter."""

    def __init__(self, rate: int, per: float) -> None:
        self.rate = max(1, int(rate))
        self.per = float(per)
        self.events: List[float] = []

    def allow(self) -> bool:
        now = time.monotonic()
        cutoff = now - self.per
        self.events = [t for t in self.events if t >= cutoff]
        if len(self.events) >= self.rate:
            return False
        self.events.append(now)
        return True


class GlobalRateLimiter:
    """Global process-wide limiter."""

    class _Slot:
        def __init__(self, limiter: "GlobalRateLimiter") -> None:
            self.limiter = limiter

        def __enter__(self): return self
        def __exit__(self, exc_type, exc, tb): return False

    def __init__(self, qps: int = _GLOBAL_QPS, burst_window: float = _GLOBAL_BURST_WINDOW):
        self.limiter = _SlidingWindowLimiter(qps, burst_window)

    def slot(self) -> "GlobalRateLimiter._Slot":
        return GlobalRateLimiter._Slot(self)


# ============================================================
# Core Data Types
# ============================================================

@dataclass(slots=True)
class SolverResult:
    text: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None


@dataclass(slots=True)
class Contract:
    format: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Node:
    name: str
    prompt: str
    deps: List[str]
    contract: Contract
    role: str = "backbone"


@dataclass(slots=True)
class Plan:
    nodes: List[Node]


@dataclass(slots=True)
class Artifact:
    node: str
    content: str
    status: str = "ok"
    recommendations: List[str] = field(default_factory=list)


@dataclass(slots=True)
class QAResult:
    passed: bool
    issues: List[str]


@dataclass(slots=True)
class Critique:
    score: float
    comments: str
    guidance: Dict[str, float]


@dataclass(slots=True)
class Patch:
    span: Tuple[int, int]
    replacement: str


@dataclass(slots=True)
class Issue:
    description: str
    severity: str = "medium"


@dataclass(slots=True)
class TestSpec:
    description: str
    expected: Any


@dataclass(slots=True)
class Classification:
    kind: str
    score: float


# ============================================================
# Classification Helper
# ============================================================

def classify_query(query: str) -> Classification:
    """Naive heuristic classification."""
    q = query.strip().lower()
    if _DELIVERABLE.search(q):
        return Classification("Composite", 0.9)
    if _DEPENDENCY.search(q):
        return Classification("Hybrid", 0.7)
    if _BULLET.search(q):
        return Classification("Composite", 0.6)
    return Classification("Atomic", 0.5)


# ============================================================
# QA Patch Helpers
# ============================================================

_HDR = re.compile(r"^\s{0,3}(#+)\s+(.+?)\s*$", re.M)


def _ensure_header(text: str, wanted: str) -> Tuple[bool, Optional[Patch]]:
    """
    Ensure a Markdown header is present.
    Return (ok, patch) where patch is None if already satisfied.
    """
    if _HDR.search(text):
        return True, None
    return False, Patch((0, 0), f"# {wanted}\n\n{text}")
