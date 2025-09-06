# blackboard.py

from __future__ import annotations

import asyncio
import json
import logging
import hashlib
import math
import heapq
import uuid
import os
import re
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import (
    Any,
    Awaitable,
    Callable,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Protocol,
    Sequence,
    Tuple,
    runtime_checkable,
)

from constants import (
    PLANNER_PROMPT,
    CQAP_SECTION_PROMPT,
    TEMPLATE_REGISTRY,
    KNOWN_TEMPLATES,
    TEMPLATE_CONTRACTS,
    COHESION_PROMPT,
    COHESION_APPLY_PROMPT,
    LLM_JUDGE_PROMPT,
    NODE_RECOMMEND_PROMPT,
    NODE_APPLY_PROMPT,
    CONTRADICTION_PROMPT,
    ANALYSIS_NODE_PROMPT,
    ANSWER_NODE_PROMPT,
    EXAMPLES_NODE_PROMPT,
    cognitive_query_analysis_protocol,
    ITERATIVE_CONSTRAINTS_PROMPT,
    GUIDANCE_MESSAGES,
    JUDGE_ERROR_MSG,
    JUDGE_EXCEPTION_MSG,
    LLM_JUDGE_UNAVAILABLE,
    LLM_JUDGE_ERROR,
    FALLBACK_NODE_PLACEHOLDER,
    OVERLONG_HINT,
    TOO_SHORT_HINT,
)

from kern.src.kern.core import init_logging


try:
    init_logging()
except Exception as e:
    print(f"Failed to initialize production logging: {e}. Falling back to basic logging.")

_LOG = logging.getLogger("blackboard")
if not _LOG.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("[%(levelname)s] %(name)s: %(message)s"))
    _LOG.addHandler(_h)
    _LOG.setLevel(os.getenv("LOG_LEVEL", "INFO"))

_AUDIT = logging.getLogger("blackboard.audit")
if not _AUDIT.handlers:
    _ah = logging.StreamHandler()
    _ah.setFormatter(logging.Formatter("%(message)s"))
    _AUDIT.addHandler(_ah)
    _AUDIT.setLevel(logging.INFO)
    _AUDIT.propagate = False


class BlackboardError(Exception): ...
class PlanningError(BlackboardError): ...
class QAError(BlackboardError): ...
class ExecutionError(BlackboardError): ...
class CompositionError(BlackboardError): ...

_CTRL = re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F]')

async def classify_query_llm(query: str, llm: "PlannerLLM", *, timeout: float = 12.0) -> Classification:
    """
    LLM-backed classifier that respects 'short but deep' queries.
    Contract: the LLM must return a single JSON object like:
      {"kind":"Atomic|Hybrid|Composite","score":0..1,"rationale":"...","cues":{"deliverables":int,"comparisons":int,"dependencies":int,"lists":int,"conjunctions":int,"ops_depth":int,"advanced":int,"length":int}}
    Fallback: if parsing/fields fail, we return the heuristic classify_query().
    """
    if llm is None:
        return classify_query(query)
    schema_hint = (
        '{ "type":"object","required":["kind","score"],'
        '  "properties":{"kind":{"enum":["Atomic","Hybrid","Composite"]},"score":{"type":"number"},"rationale":{"type":"string"},"cues":{"type":"object"}} }'
    )
    prompt = (
        "SYSTEM: CLASSIFY\n"
        "Return ONLY a single JSON object. No prose.\n"
        "Schema (informal): " + schema_hint + "\n\n"
        "Task: Classify the user's query by scope/complexity.\n"
        "- Atomic = single, narrow deliverable; no multi-phase orchestration; no explicit comparisons.\n"
        "- Hybrid = two or more deliverables OR a compare/contrast OR explicit dependencies/rollout elements.\n"
        "- Composite = multi-phase plan (objectives/tactics), or broad strategy spanning analysis+design+validation.\n"
        "Important: a short sentence can still be deep; do NOT use length as a proxy. Consider ops depth (SLO/SLA, canary/rollback, observability), advanced CS terms,\n"
        "comparisons (versus/vs), explicit dependencies (after/before/depends), and enumerations (lists/bullets/commas/conjunctions).\n\n"
        "Output fields:\n"
        '- kind: "Atomic" | "Hybrid" | "Composite"\n'
        "- score: a confidence 0..1 for chosen kind\n"
        "- rationale: one non-fluffy sentence (optional)\n"
        "- cues: counts {deliverables, comparisons, dependencies, lists, conjunctions, ops_depth, advanced, length}\n\n"
        "QUERY:\n" + _sanitize_text(query)
    )
    try:
        raw = await llm.complete(prompt, temperature=0.0, timeout=timeout)
        blob = _first_json_object(raw) or "{}"
        data = safe_json_loads(blob, default={}) or {}
        kind = str(data.get("kind") or "").strip()
        score = float(data.get("score") or 0.0)
        if kind not in {"Atomic", "Hybrid", "Composite"} or not (0.0 <= score <= 1.0):
            raise ValueError("bad fields")
        # gentle guardrails: if LLM says Atomic but cues show breadth, nudge score up
        cues = data.get("cues") or {}
        breadth = sum(int(cues.get(k, 0)) for k in ("deliverables","comparisons","dependencies","lists","conjunctions"))
        depth = sum(int(cues.get(k, 0)) for k in ("ops_depth","advanced"))
        if kind == "Atomic" and (breadth >= 2 or depth >= 2):
            score = max(score, 0.42)  # hint it might be hybrid; caller can log
        return Classification(kind, round(score, 3))
    except Exception:
        _LOG.warning("LLM classification failed; falling back to heuristic.", exc_info=False)
        return classify_query(query)

def _sanitize_text(s: str) -> str:
    """Remove control chars and normalize newlines."""
    if not isinstance(s, str):
        return ""
    s = _CTRL.sub("", s)
    return s.replace("\r\n", "\n").replace("\r", "\n")

class _SafeFormatDict(dict):
    """Format helper: leaves unknown placeholders as literal braces instead of raising KeyError."""
    def __missing__(self, key: str) -> str:  # key may include quotes, spaces, etc.
        return "{" + key + "}"

def _fmt(template: str, /, **kwargs: Any) -> str:
    """
    Safe string formatting for prompt templates that may contain literal JSON like
    { "recommendations": [] }. Unknown placeholders remain intact.
    """
    try:
        # Ensure all values are strings (avoid None/objects surprising str.format)
        safe_kwargs = {k: ("" if v is None else str(v)) for k, v in kwargs.items()}
        return str(template).format_map(_SafeFormatDict(safe_kwargs))
    except Exception:
        # Fall back to raw template if anything goes sideways.
        return str(template)

def safe_json_loads(s: str, default: Any = None) -> Any:
    """Parse JSON safely; return default on error."""
    try:
        return json.loads(s)
    except Exception:
        return default


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
    vec = [0.0] * dim
    def _acc(s: str) -> None:
        h = int(hashlib.blake2b(s.encode("utf-8"), digest_size=8).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if ((h >> 1) & 1) else -1.0
        vec[idx] += sign
    for i, t in enumerate(toks):
        _acc(t)
        if i + 1 < len(toks):
            _acc(t + "_" + toks[i + 1])
    n = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / n for v in vec]

def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity for equal-length vectors. Returns [-1, 1]."""
    if not a or not b:
        return 0.0
    s = 0.0
    for x, y in zip(a, b):
        s += (x or 0.0) * (y or 0.0)
    return float(max(-1.0, min(1.0, s)))

def _quantize(v: List[float]) -> List[int]:
    return [max(-127, min(127, int(round(x*127)))) for x in v]

def _dequantize(q: List[int]) -> List[float]:
    return [x/127.0 for x in q]

class _SlidingWindowLimiter:
    def __init__(self, rate: int, per: float) -> None:
        self.rate = max(1, int(rate))
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
    def __init__(self, max_concurrent: int, qps: int, burst_window_sec: float = 1.0) -> None:
        self._conc = asyncio.Semaphore(max(1, int(max_concurrent)))
        self._rate = _SlidingWindowLimiter(max(1, int(qps)), float(burst_window_sec))
    class _Slot:
        def __init__(self, outer: "GlobalRateLimiter") -> None:
            self.outer = outer
        async def __aenter__(self) -> None:
            await self.outer._rate.acquire(); await self.outer._conc.acquire()
        async def __aexit__(self, exc_type, exc, tb) -> None:
            self.outer._conc.release()
    def slot(self) -> "GlobalRateLimiter._Slot":
        return GlobalRateLimiter._Slot(self)

_GLOBAL_MAX_CONCURRENT = int(os.getenv("GLOBAL_MAX_CONCURRENT", "16"))
_GLOBAL_QPS = int(os.getenv("GLOBAL_QPS", "8"))
_GLOBAL_BURST_WINDOW = float(os.getenv("GLOBAL_BURST_WINDOW", "1.0"))
GLOBAL_LIMITER = GlobalRateLimiter(_GLOBAL_MAX_CONCURRENT, _GLOBAL_QPS, _GLOBAL_BURST_WINDOW)
KLINE_EMBED_DIM = int(os.getenv("KLINE_EMBED_DIM", "256"))
KLINE_MAX_ENTRIES = int(os.getenv("KLINE_MAX_ENTRIES", "2000"))
AUDIT_MAX_CHARS = int(os.getenv("AUDIT_MAX_CHARS", "8192"))

@dataclass(slots=True)
class SolverResult:
    text: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None

@runtime_checkable
class BlackBoxSolver(Protocol):
    async def solve(self, task: str, context: Optional[Mapping[str, Any]] = None) -> str | SolverResult: ...

@runtime_checkable
class PlannerLLM(Protocol):
    async def complete(self, prompt: str, *, temperature: float = 0.0, timeout: float = 60.0) -> str: ...

@runtime_checkable
class Judge(Protocol):
    name: str
    async def critique(self, text: str, contract: "Contract") -> "Critique": ...

@dataclass(slots=True)
class TestSpec:
    kind: str
    arg: str | int

@dataclass(slots=True)
class Contract:
    format: Dict[str, Any] = field(default_factory=dict)
    tests: List[TestSpec] = field(default_factory=list)

@dataclass(slots=True)
class Node:
    name: str
    tmpl: str                  # template ID, e.g. "R3", "A7", "GENERIC"
    deps: List[str] = field(default_factory=list)
    contract: Contract = field(default_factory=Contract)
    role: str = "adjunct"
    prompt_override: Optional[str] = None

    def build_prompt(self, query: str, deps_bullets: str) -> str:
        # choose template (respect planner-supplied prompt if present)
        template = (self.prompt_override
                    or TEMPLATE_REGISTRY.get(self.tmpl)
                    or TEMPLATE_REGISTRY["GENERIC"])
        # expected header
        section = self.contract.format.get("markdown_section") or self.name.title()
        # render
        return _fmt(template, tmpl=self.tmpl, query=query, deps=deps_bullets, section=section)


@dataclass(slots=True)
class Plan:
    nodes: List[Node]

@dataclass(slots=True)
class Patch:
    kind: str
    arg: Dict[str, Any]

@dataclass(slots=True)
class Issue:
    code: str
    details: Dict[str, Any] = field(default_factory=dict)
    suggested: List[Patch] = field(default_factory=list)

@dataclass(slots=True)
class QAResult:
    ok: bool
    issues: List[Issue] = field(default_factory=list)

@dataclass(slots=True)
class Critique:
    score: float
    comments: str
    guidance: Dict[str, float]

@dataclass(slots=True)
class Artifact:
    node: str
    content: str
    qa: QAResult
    critiques: List[Critique] = field(default_factory=list)
    status: str = "ok"
    recommendations: List[str] = field(default_factory=list)

class MemoryStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.data: Dict[str, Any] = {}
        self._load()
    def _load(self) -> None:
        try:
            if self.path.exists():
                txt = self.path.read_text(encoding="utf-8")
                data = safe_json_loads(txt, default=None)
                if not isinstance(data, dict):
                    raise ValueError("memory json corrupted")
                self.data = data
            else:
                self.data = {"judges": {}, "patch_stats": {}, "klines": {}}
        except Exception as e:
            _LOG.exception("MemoryStore load failed: %s", e)
            try:
                if self.path.exists():
                    bak = self.path.with_suffix(".corrupt")
                    self.path.replace(bak)
                    _LOG.warning("quarantined corrupt memory to %s", bak)
            except Exception:
                pass
            self.data = {"judges": {}, "patch_stats": {}, "klines": {}}
    def save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        try:
            tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(self.path)
        except Exception as e:
            _LOG.exception("MemoryStore save failed: %s", e)
    def bump_judge(self, judge: str, delta: float) -> None:
        j = self.data.setdefault("judges", {}).setdefault(judge, {"weight": 1.0})
        j["weight"] = max(0.1, min(3.0, float(j.get("weight", 1.0)) + delta))
    def get_judge_weight(self, judge: str) -> float:
        return float(self.data.get("judges", {}).get(judge, {}).get("weight", 1.0))
    def record_patch(self, kind: str, ok: bool) -> None:
        s = self.data.setdefault("patch_stats", {}).setdefault(kind, {"ok": 0, "fail": 0})
        s["ok" if ok else "fail"] += 1
    def get_kline(self, sig: str) -> Optional[Dict[str, Any]]:
        return self.data.setdefault("klines", {}).get(sig)
    def put_kline(self, sig: str, payload: Dict[str, Any]) -> None:
        entry = dict(payload or {})
        entry.setdefault("level", int(entry.get("level", 0)))
        self.data.setdefault("klines", {})[sig] = entry
        self.save()

    # --- kline cognitive cache: nearest-neighbor query + meta synthesis ---
    def iter_klines(self) -> Iterable[Tuple[str, Dict[str, Any]]]:
        """Yield (sig, entry) for all klines; empty if none."""
        for k, v in (self.data.get("klines") or {}).items():
            if isinstance(v, dict):
                yield k, v
    def _ensure_entry_embedding(self, entry: Dict[str, Any], dim: int = KLINE_EMBED_DIM) -> None:
        # Prefer existing full-precision embedding if dimension matches.
        if "embedding" in entry and isinstance(entry["embedding"], list) and len(entry["embedding"]) == dim:
            return
        # If quantized exists, dequantize on the fly (but avoid persisting floats later).
        if "embedding_q" in entry and isinstance(entry["embedding_q"], list):
            ev = _dequantize(entry["embedding_q"])
            if len(ev) == dim:
                entry["embedding"] = ev
                return
        # Legacy/old entry: synthesize from stored query if available.
        q = entry.get("query")
        if isinstance(q, str) and q.strip():
            entry["embedding"] = _hash_embed(q, dim=dim)
    def prune_klines(self, max_entries: int = KLINE_MAX_ENTRIES) -> None:
        ks = list(self.iter_klines())
        if len(ks) <= max_entries: return
        ks.sort(key=lambda kv: kv[1].get("ts", 0.0))  # oldest first
        for sig, _ in ks[:-max_entries]:
            self.data["klines"].pop(sig, None)
        self.save()
    def query_klines(self, query: str, top_k: int = 3, min_sim: float = 0.2) -> List[Tuple[str, float, Dict[str, Any]]]:
        """
        Return top-k most similar past klines by cosine(query, entry.embedding).
        Falls back gracefully if older entries lack embeddings (they will be embedded on the fly).
        Extends retrieval to surface linked clusters and hierarchical children.
        """
        qv = _hash_embed(query, dim=KLINE_EMBED_DIM)
        changed = False
        heap: List[Tuple[float, str, Dict[str, Any]]] = []
        for sig, entry in self.iter_klines():
            try:
                if "embedding" not in entry or not isinstance(entry["embedding"], list) or len(entry["embedding"]) != KLINE_EMBED_DIM:
                    self._ensure_entry_embedding(entry, dim=KLINE_EMBED_DIM)
                    changed = True
                ev = entry.get("embedding")
                if not isinstance(ev, list) or not ev:
                    continue
                sim = _cosine(qv, ev)
                if sim >= min_sim:
                    if len(heap) < top_k:
                        heapq.heappush(heap, (sim, sig, entry))
                    else:
                        heapq.heappushpop(heap, (sim, sig, entry))
            except Exception:
                continue
        if changed:
            # Avoid persisting full-precision embeddings when a quantized vector exists.
            for _, entry in self.iter_klines():
                if "embedding_q" in entry and "embedding" in entry:
                    entry.pop("embedding", None)
            self.save()
        clusters: List[Tuple[str, float, Dict[str, Any], List[Tuple[str, float]]]] = []
        for sim, sig, e in sorted(heap, key=lambda t: t[0], reverse=True):
            neigh = self.cluster_retrieve(sig)
            cscore = sim
            for nsig, w in neigh:
                linked = self.get_kline(nsig)
                if linked:
                    self._ensure_entry_embedding(linked, dim=KLINE_EMBED_DIM)
                    lev = linked.get("embedding")
                    if isinstance(lev, list):
                        cscore += 0.1 * w * _cosine(qv, lev)
            clusters.append((sig, cscore, e, neigh))
        clusters.sort(key=lambda t: t[1], reverse=True)

        extended: List[Tuple[str, float, Dict[str, Any]]] = []
        seen: set[str] = set()

        def _expand(s: str, score: float, entry: Dict[str, Any], depth: int) -> None:
            if s in seen or depth > 3:
                return
            extended.append((s, score, entry))
            seen.add(s)
            if depth >= 3:
                return
            if int(entry.get("level", 0)) >= 1:
                for cs in entry.get("children") or []:
                    child = self.get_kline(cs)
                    if child:
                        self._ensure_entry_embedding(child, dim=KLINE_EMBED_DIM)
                        _expand(cs, score * 0.98, child, depth + 1)

        for sig, cscore, entry, neigh in clusters[: max(0, int(top_k))]:
            _expand(sig, cscore, entry, 0)
            for nsig, _w in neigh[:3]:
                if nsig in seen:
                    continue
                nentry = self.get_kline(nsig)
                if not nentry:
                    continue
                self._ensure_entry_embedding(nentry, dim=KLINE_EMBED_DIM)
                _expand(nsig, cscore * 0.97, nentry, 0)
            if len(extended) >= top_k * 4:
                break
        extended.sort(key=lambda t: t[1], reverse=True)
        return extended[: top_k * 4]


    def summarize_neighbors(
        self,
        neighbors: Sequence[Tuple[str, float, Dict[str, Any]]],
        *,
        char_budget: int = 1600,
        max_recs: int = 6,
    ) -> str:
        """
        Produce a compact, actionable hint block from similar klines.
        Heuristics:
        - common plan shapes
        - frequently weak nodes (nodes - ok_nodes)
        - top global recommendations (by frequency)
        """
        if not neighbors:
            return ""
        N = len(neighbors)
        avg_sim = sum(s for _, s, _ in neighbors) / max(1, N)
        # aggregate plan shapes (as "a->b->c")
        shape_counts: Dict[str, int] = {}
        weak_counts: Dict[str, int] = {}
        rec_counts: Dict[str, int] = {}
        cls_counts: Dict[str, int] = {}
        for _, _, e in neighbors:
            try:
                nodes = [n.get("name") for n in (e.get("nodes") or []) if isinstance(n, dict)]
                if nodes:
                    shape = " → ".join(nodes[:8])
                    shape_counts[shape] = shape_counts.get(shape, 0) + 1
                ok = set(e.get("ok_nodes") or [])
                for n in nodes or []:
                    if n not in ok:
                        weak_counts[n] = weak_counts.get(n, 0) + 1
                for r in (e.get("global_recs") or []):
                    if isinstance(r, str) and r.strip():
                        rec_counts[r.strip()] = rec_counts.get(r.strip(), 0) + 1
                ck = (e.get("classification") or {}).get("kind")
                if isinstance(ck, str) and ck:
                    cls_counts[ck] = cls_counts.get(ck, 0) + 1
            except Exception:
                continue
        def _top(d: Dict[str, int], k: int) -> List[str]:
            return [f"{k1}×{v1}" for k1, v1 in sorted(d.items(), key=lambda t: t[1], reverse=True)[:k]]
        lines: List[str] = []
        lines.append(f"PRIOR HINTS (n={N}, avg_sim≈{avg_sim:.2f})")
        if shape_counts:
            lines.append("- Common plan shapes: " + "; ".join(_top(shape_counts, 2)))
        if weak_counts:
            lines.append("- Frequently weak nodes: " + ", ".join([w.split("×")[0] for w in _top(weak_counts, 5)]))
        if rec_counts:
            lines.append("- Top global recs: " + "; ".join([r.split("×")[0] for r in _top(rec_counts, max_recs)]))
        if cls_counts:
            lines.append("- Historical classification mix: " + ", ".join(_top(cls_counts, 3)))
        out = "\n".join(lines)
        return out[: int(char_budget)]
    def upsert_kline(
        self,
        sig: str,
        payload: Dict[str, Any],
        *,
        query: Optional[str] = None,
        classification: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Insert/update a kline entry, attaching query, classification, embedding, and timestamp."""
        root = self.data.setdefault("klines", {})
        entry = dict(root.get(sig) or {})
        entry.update(payload or {})
        entry.setdefault("level", int(entry.get("level", 0)))
        if query is not None:
            emb = _hash_embed(query, dim=KLINE_EMBED_DIM)
            entry["embedding_q"] = _quantize(emb)
            entry.pop("embedding", None)
            entry["query"] = query
        if classification is not None:
            entry["classification"] = classification
        entry["ts"] = time.time()
        root[sig] = entry
        # size guard
        try:
            self.prune_klines(KLINE_MAX_ENTRIES)
        except Exception:
            pass
        self.save()
    def penalize_kline(self, sig: str) -> None:
        """Increment penalty counter for a kline."""
        entry = self.get_kline(sig)
        if entry is not None:
            entry["penalty"] = entry.get("penalty", 0) + 1
            self.put_kline(sig, entry)
    def explain_recall(self, sig: str) -> Dict[str, Any]:
        """Explain why a kline was recalled."""
        entry = self.get_kline(sig) or {}
        info = {
            "query": entry.get("query"),
            "classification": entry.get("classification"),
            "ts": entry.get("ts"),
            "penalty": entry.get("penalty", 0),
            "links": entry.get("links", {}),
        }
        _AUDIT.info(json.dumps({"explain_recall": {"sig": sig, "info": info}}, ensure_ascii=False))
        return info
    def link_klines(self, sig_a: str, sig_b: str, weight: float) -> None:
        """Bidirectionally link two klines with a utility weight."""
        if sig_a == sig_b:
            return
        for x, y in ((sig_a, sig_b), (sig_b, sig_a)):
            entry = self.get_kline(x) or {}
            links = entry.setdefault("links", {})
            links[y] = weight
            self.put_kline(x, entry)
    def cluster_retrieve(self, sig: str, max_neighbors: int = 3) -> List[Tuple[str, float]]:
        """Return strongest linked neighbors for a given kline signature."""
        entry = self.get_kline(sig) or {}
        links = entry.get("links") or {}
        neigh = sorted(links.items(), key=lambda kv: kv[1], reverse=True)[:max_neighbors]
        for nsig, w in neigh:
            _AUDIT.info(json.dumps({"cluster_recall": {"source": sig, "neighbor": nsig, "weight": w}}, ensure_ascii=False))
        return neigh
    def append_kline_trace(self, sig: str, trace: Dict[str, Any]) -> None:
        """Append an execution trace snapshot to a kline."""
        entry = self.data.setdefault("klines", {}).setdefault(sig, {})
        traces = entry.setdefault("traces", [])
        traces.append(trace)
        self.save()
    def replay_kline(self, sig: str) -> List["Node"]:
        """
        Reconstruct Nodes from the latest stored trace (preferred) or legacy 'nodes' snapshot.
        Falls back gracefully by synthesizing minimal contracts.
        """
        entry = (self.data.get("klines") or {}).get(sig) or {}
        plan_nodes = None
        traces = entry.get("traces") or []
        source = "nodes"
        if traces and isinstance(traces[-1], dict):
            plan_nodes = traces[-1].get("nodes")
            source = "trace"
        if plan_nodes is None:
            plan_nodes = entry.get("nodes")
        out: List["Node"] = []
        for nd in plan_nodes or []:
            try:
                name = str(nd.get("name"))
                deps = list(nd.get("deps") or [])
                role = str(nd.get("role") or "adjunct")
                tmpl = str(nd.get("tmpl") or "GENERIC")
                contract_dict = nd.get("contract") or {}
                fmt = contract_dict.get("format") or {}
                tests_raw = contract_dict.get("tests") or []
                tests = []
                for t in tests_raw:
                    kind = t.get("kind")
                    if kind is None:
                        continue
                    tests.append(TestSpec(kind=str(kind), arg=t.get("arg")))
                contract = Contract(format=fmt, tests=tests)
                prompt_override = nd.get("prompt_override") or nd.get("prompt")
                out.append(Node(
                    name=name,
                    tmpl=tmpl,
                    deps=deps,
                    contract=contract,
                    role=role if role in {"backbone","adjunct"} else "adjunct",
                    prompt_override=prompt_override))
            except Exception:
                continue
        if plan_nodes:
            _AUDIT.info(json.dumps({"trace_replay": {"sig": sig, "source": source}}, ensure_ascii=False))
        return out
    def promote_kline(self, parent_sig: str, child_sigs: List[str]) -> None:
        """
        Create/update a synthetic composite parent with references to children.
        """
        root = self.data.setdefault("klines", {})
        parent = root.setdefault(parent_sig, {"children": []})
        parent_children = parent.setdefault("children", [])
        child_levels: List[int] = []
        for cs in child_sigs:
            if cs not in parent_children:
                parent_children.append(cs)
            child_entry = root.setdefault(cs, {})
            child_levels.append(int(child_entry.get("level", 0)))
        parent["level"] = max(child_levels or [0]) + 1
        parent["ts"] = time.time()
        self.save()

_DELIVERABLE = re.compile(r"\b(design|architecture|spec|contract|roadmap|benchmark|compare|trade[- ]?offs?|rfc|plan|protocol|implementation|experiment|evaluate)\b", re.I)
_DEPENDENCY = re.compile(r"\b(after|before|then|depends|precede|follow|stage|phase|blocker|unblock)\b", re.I)
_BULLET = re.compile(r"(^\s*[-*]\s+|\d+\.\s+)", re.M)
_VERBS = re.compile(r"\b(\w+?)(?:ed|ing|e|ify|ise|ize)\b", re.I)

@dataclass(slots=True)
class Classification:
    kind: str
    score: float

def classify_query(query: str) -> Classification:
    q = query.strip()
    wc = len(re.findall(r"\b\w+\b", q))
    score = 0.34 * min(1.0, len(_DELIVERABLE.findall(q)) / 3) + 0.26 * min(1.0, len(_DEPENDENCY.findall(q)) / 2) + 0.20 * min(1.0, len(_BULLET.findall(q)) / 3) + 0.10 * (1.0 if wc > 100 else 0.0) + 0.10 * min(1.0, len(_VERBS.findall(q)) / 14)
    kind = "Atomic" if score < 0.25 else "Hybrid" if score < 0.55 else "Composite"
    return Classification(kind, round(score, 3))


async def _llm_json_phase(llm: "PlannerLLM", phase: str, base_prompt: str, *, temperature: float = 0.0, timeout: float = 25.0, max_retries: int = 1) -> Dict[str, Any]:
    """
    Small, dependency-free JSON enforcer:
      - Adds a SYSTEM header
      - Logs timing + prompt hash
      - Parses first JSON object
      - Retries once with a repair hint
    """
    if llm is None:
        return {}
    import time as _time
    header = (
        f"SYSTEM: {phase}\n"
        "Return ONLY a single JSON object. No prose or markdown.\n"
        "If unknown, use null or an empty list/string.\n\n"
    )
    prompt = header + base_prompt
    attempts = 0
    while attempts <= max_retries:
        attempts += 1
        t0 = _time.perf_counter()
        try:
            raw = await llm.complete(prompt, temperature=temperature, timeout=timeout)
        except Exception:
            raw = ""
        dt_ms = int((_time.perf_counter() - t0) * 1000)
        h = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16]
        _LOG.info("json-phase call phase=%s attempt=%d hash=%s len=%d dt_ms=%d", phase, attempts, h, len(prompt), dt_ms)
        blob = _first_json_object(_sanitize_text(raw) or "") or ""
        data = safe_json_loads(blob, default=None)
        if isinstance(data, dict):
            return data
        prompt = header + base_prompt + "\n\nREPAIR:\nSend ONLY valid JSON for the object. No commentary."
    return {}

def _cqap_meta_prompt(query: str, protocol: Mapping[str, Any]) -> str:
    """
    Ask the LLM to fill the cognitive_query_analysis_protocol as a JSON object
    with the SAME top-level keys.
    """
    proto_json = json.dumps(protocol, ensure_ascii=False, sort_keys=True)
    q = _sanitize_text(query)
    return (
        "Fill the PROTOCOL keys with concise, decision-ready analysis.\n"
        "- Keep the same keys as PROTOCOL; for nested hints (e.g., PrecisionLevel), return an object.\n"
        "- Be terse but specific; a short sentence can be deep.\n"
        f"TARGET: {q}\n"
        f"PROTOCOL: {proto_json}\n"
    )

def _mission_plan_prompt(query: str, meta: Mapping[str, Any]) -> str:
    """
    Ask the LLM to generate a mission-style plan: Strategy array with O1/O2...,
    optional queries, and tactics (name/description/dependencies/expected_artifact).
    This matches build_plan_from_mission expectations.
    """
    q = _sanitize_text(query)
    meta_json = json.dumps(meta, ensure_ascii=False, sort_keys=True)
    schema_hint = {
        "Strategy": [
            {
                "O1": "Objective text",
                "queries": {"Q1": "question...", "Q2": "question..."},
                "tactics": [
                    {
                        "t1": "tactic description",
                        "dependencies": ["expected_artifact_or_tactic_name"],
                        "expected_artifact": "file_or_doc_name",
                    }
                ],
            }
        ]
    }
    return (
        "Produce ONLY JSON for a mission plan that can compile into a DAG.\n"
        "Rules:\n"
        "- Use keys O1..On (or 'Objective' if needed).\n"
        "- Each tactic: a 'tX' key, 'dependencies' (names or artifacts), and 'expected_artifact'.\n"
        "- Prefer explicit dependencies if comparisons/rollouts are implied.\n"
        f"TARGET: {q}\nMETA: {meta_json}\nSCHEMA_HINT: {json.dumps(schema_hint, ensure_ascii=False)}\n"
    )

# === CQAP → Plan compiler (normalized, cohesive) ===
# We normalize keys ONCE and then use normalized identifiers throughout.
# Pretty titles come from PRETTY_SECTION; add here if you introduce new slots.
_CQAP_TIER1 = ["goal", "obstacles", "facts", "precision", "toneanalysis"]
_CQAP_TIER2 = [
    "insights",
    "structuralrelationships",
    "boundaryanalysis",
    "embeddedassumptions",
    "knowledgegaps",
    "factreflectionseparation",
]
_CQAP_TIER3 = ["uncertainty", "responsestrategy", "rationale"]

PRETTY_SECTION: Dict[str, str] = {
    "goal": "Goal",
    "obstacles": "Obstacles",
    "facts": "Facts",
    "precision": "Precision",
    "toneanalysis": "Tone Analysis",
    "insights": "Insights",
    "structuralrelationships": "Structural Relationships",
    "boundaryanalysis": "Boundary Analysis",
    "embeddedassumptions": "Embedded Assumptions",
    "knowledgegaps": "Knowledge Gaps",
    "factreflectionseparation": "Fact–Reflection Separation",
    "uncertainty": "Uncertainty",
    "responsestrategy": "Response Strategy",
    "rationale": "Rationale",
    "finalanswer": "Final Answer",
}


def _norm_key(k: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', k.lower())

def _get_norm(d: Mapping[str, Any], key: str, alt: str = "") -> str:
    return str(d.get(_norm_key(key), d.get(key, d.get(alt, ""))) or "")

def _normalize_map(proto: Mapping[str, Any]) -> Dict[str, Any]:
    """Lowercase alnum map used consistently across CQAP handling."""
    return {_norm_key(k): v for k, v in (proto or {}).items()}

def _cqap_unify(proto: Mapping[str, Any]) -> Dict[str, str]:
    p = _normalize_map(proto)
    # collapse uncertainties → "uncertainty"
    bits = []
    for k in (
        "explicituncertainty",
        "exploratoryuncertainty",
        "hiddenuncertainty",
        "toleranceforuncertainty",
        "contextualaccuracy",
        "precisionlevel",
    ):
        v = p.get(k)
        if isinstance(v, str) and v.strip():
            bits.append(f"{k}: {v}")
    if bits:
        p["uncertainty"] = "Integrate:\n" + "\n".join(f"- {b}" for b in bits)
    return p

def mk_contract(section: str, *, min_words: Optional[int] = None) -> Contract:
    """Single contract builder for all nodes (replaces _mk_contract/_mk_simple_contract)."""
    tests: List[Dict[str, Any]] = [
        {"kind": "nonempty", "arg": ""},
        {"kind": "header_present", "arg": section},
    ]
    if isinstance(min_words, int) and min_words > 0:
        tests.append({"kind": "word_count_min", "arg": min_words})
    return _parse_contract({"format": {"markdown_section": section}, "tests": tests}, fallback_section=section)


def _mk_prompt(slot: str, slot_spec: str, query: str) -> str:
    return _fmt(CQAP_SECTION_PROMPT, slot=slot, slot_spec=slot_spec, query=_sanitize_text(query))

# Converts a mission_plan dict into a concrete Plan (Nodes with actionable contracts).
def _mp_slug(s: str) -> str:
    return _slug(s, s)


def build_plan_from_mission(
    mission: Mapping[str, Any],
    *,
    query: Optional[str] = None,
    min_words_tactic: int = 40,
    min_words_objective: int = 80,
) -> Plan:
    """
    Map your mission_plan structure to Blackboard Nodes:
      - One Objective node per Strategy[i]
      - Optional 'queries' node per Strategy[i]
      - One Tactic node per Strategy[i].tactics[j]
      - A final synthesis node that depends on all Objective nodes

    Dependency semantics:
      - If a tactic declares "dependencies" that match any prior tactic's expected_artifact,
        we wire the tactic -> prior tactic node.
      - Each Objective depends on its queries node (if any) and all its tactic nodes.
      - Final Answer depends on all Objective nodes.
    """
    strategies: List[Mapping[str, Any]] = list(mission.get("Strategy") or [])
    nodes: List[Node] = []

    all_objective_node_names: List[str] = []
    artifact_owner: Dict[str, str] = {}  # expected_artifact -> tactic node name

    for oi, strat in enumerate(strategies, start=1):
        # 1) Objective
        # Accept a variety of keys: "O1", "O 1 => O n ", "Objective", etc.
        obj_title = None
        for k, v in strat.items():
            if isinstance(k, str) and k.strip().lower().startswith("o"):
                obj_title = str(v).strip() if isinstance(v, str) else None
                break
        if not obj_title:
            obj_title = str(strat.get("Objective") or f"Objective {oi}").strip()

        obj_section = f"O{oi}: {obj_title or f'Objective {oi}'}"
        obj_name = _mp_slug(f"o{oi}_objective")
        nodes.append(
            Node(
                name=obj_name,
                tmpl="GENERIC",
                deps=[],
                contract=mk_contract(obj_section, min_words=max(40, int(min_words_objective))),
                role="backbone",
            )
        )
        all_objective_node_names.append(obj_name)

        # 2) Queries (optional, if present)
        queries_map = strat.get("queries") or {}
        q_items = []
        if isinstance(queries_map, Mapping):
            # allow {"Q1": "...", "Q2": "..."} or {"Q 1 => Q n": "..."} forms
            for k, v in queries_map.items():
                if not isinstance(v, str): continue
                q_items.append((str(k), v.strip()))
        obj_idx = len(nodes) - 1 
        if q_items:
            q_name = _mp_slug(f"o{oi}_queries")
            q_section = f"O{oi} - Queries"
            nodes.append(
                Node(
                    name=q_name,
                    tmpl="GENERIC",
                    deps=[],
                    contract=mk_contract(q_section, min_words=30),
                    role="adjunct",
                )
            )
            # Objective depends on queries
            nodes[obj_idx].deps.append(q_name)

        # 3) Tactics
        tactics_list = list(strat.get("tactics") or [])
        made_tactic_nodes: List[str] = []
        for tj, tdict in enumerate(tactics_list, start=1):
            if not isinstance(tdict, Mapping): continue
            # Extract id (t1/t2/tn) and details
            t_keys = [k for k in tdict.keys() if isinstance(k, str) and k.strip().lower().startswith("t")]
            t_id = (t_keys[0] if t_keys else f"t{tj}").strip()
            t_desc = str(tdict.get(t_id, "")).strip() or f"Tactic {t_id.upper()}"
            t_deps_raw = [str(x).strip() for x in (tdict.get("dependencies") or []) if str(x).strip()]
            t_art = str(tdict.get("expected_artifact") or "").strip() or f"O{oi}_T{tj}_Artifact"

            t_name = _mp_slug(f"o{oi}_{t_id}")
            t_section = f"O{oi} - {t_id.upper()}: {t_desc}"

            node = Node(
                name=t_name,
                tmpl="GENERIC",
                deps=[],
                contract=mk_contract(t_section, min_words=max(20, int(min_words_tactic))),
                role="adjunct",
            )
            # Wire tactic dependencies by expected_artifact -> producing node mapping
            for dep in t_deps_raw:
                if dep in artifact_owner:
                    node.deps.append(artifact_owner[dep])
            nodes.append(node)
            made_tactic_nodes.append(t_name)
            artifact_owner[t_art] = t_name

        # Objective depends on its tactics
        for tn in made_tactic_nodes:
            if tn not in nodes[obj_idx].deps:
                nodes[obj_idx].deps.append(tn)

    # 4) Final synthesis node
    fin_name = "final_synthesis"
    fin_section = "Final Answer"
    nodes.append(
        Node(
            name=fin_name,
            tmpl="GENERIC",
            deps=list(all_objective_node_names),
            contract=mk_contract(fin_section, min_words=120),
            role="backbone",
        )
    )

    return Plan(nodes=_validate_and_repair_plan(nodes))


def build_plan_from_cqap(query: str, proto: Mapping[str, Any], cls: "Classification") -> "Plan":
    """Compile CQAP (normalized) → Nodes, with stable naming & headings."""
    _ = query  # reserved for future per-slot prompting
    _p = _cqap_unify(proto)  # normalized map; values not used to branch, only presence

    if cls.kind == "Atomic":
        slots = list(_CQAP_TIER1)
    elif cls.kind == "Hybrid":
        slots = list(_CQAP_TIER1) + ["insights", "boundaryanalysis", "embeddedassumptions"]
    else:
        slots = list(_CQAP_TIER1) + list(_CQAP_TIER2) + list(_CQAP_TIER3)

    def _title(key: str) -> str:
        return PRETTY_SECTION.get(key, key.replace("_", " ").title())

    nodes: List[Node] = []

    def add_node(key: str, *, role: str = "adjunct", deps: Optional[List[str]] = None, min_words: Optional[int] = None) -> None:
        name = _slug(key, key)
        nodes.append(
            Node(
                name=name,
                tmpl="GENERIC",
                deps=list(deps or []),
                contract=mk_contract(_title(key), min_words=min_words),
                role=role if role in {"backbone", "adjunct"} else "adjunct",
            )
        )

    # Backbone scaffold (normalized keys)
    add_node("goal", role="backbone")
    add_node("obstacles", role="backbone", deps=["goal"])
    add_node("facts", role="backbone", deps=["obstacles"])
    # Voice/rigor shapers
    if "precision" in slots:
        add_node("precision", deps=["facts"])
    if "toneanalysis" in slots:
        add_node("toneanalysis", deps=["goal"])
    # Tier-2 chain
    chain_tail = ["facts"]
    for s in (
        "insights",
        "structuralrelationships",
        "boundaryanalysis",
        "embeddedassumptions",
        "knowledgegaps",
        "factreflectionseparation",
    ):
        if s in slots:
            add_node(s, deps=chain_tail)
            chain_tail = [_slug(s, s)]
    # Tier-3 control
    for s in ("uncertainty", "responsestrategy", "rationale"):
        if s in slots:
            add_node(s, deps=["facts"] + ([chain_tail[0]] if chain_tail else []))
    # Final synthesis depends on all prior
    deps_all = [n.name for n in nodes]
    add_node("finalanswer", role="backbone", deps=deps_all, min_words=120)
    return Plan(nodes=_validate_and_repair_plan(nodes))


def _first_json_object(s: str, *, max_scan: int = 200_000) -> Optional[str]:
    i = s.find("{")
    if i < 0:
        return None
    depth = 0; in_str = False; esc = False
    for j, c in enumerate(s[i:], start=i):
        if in_str:
            if esc: esc = False
            elif c == "\\": esc = True
            elif c == '"': in_str = False
            continue
        if (j - i) > max_scan:
            break
        if depth > 10_000: break
        if c == '"': in_str = True
        elif c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0: return s[i:j+1]
    return None

def _slug(s: str, fallback: str) -> str:
    s = re.sub(r"[^a-z0-9_-]+", "-", s.lower()).strip("-_")
    return s or fallback

def _parse_contract(obj: Mapping[str, Any], fallback_section: str) -> Contract:
    fmt = dict(obj.get("format") or {})
    tests_in = obj.get("tests") or []
    tests: List[TestSpec] = []
    for t in tests_in:
        kind = str(t.get("kind", "")).strip(); arg = t.get("arg", "")
        if kind in {"nonempty", "regex", "contains", "word_count_min", "header_present"}:
            tests.append(TestSpec(kind=kind, arg=arg))
    if not fmt.get("markdown_section"): fmt["markdown_section"] = fallback_section
    if not any(t.kind == "nonempty" for t in tests): tests.append(TestSpec(kind="nonempty", arg=""))
    if not any(t.kind == "header_present" for t in tests): tests.append(TestSpec(kind="header_present", arg=fmt["markdown_section"]))
    return Contract(format=fmt, tests=tests)

def _validate_and_repair_plan(nodes: List[Node]) -> List[Node]:
    order = {n.name: i for i, n in enumerate(nodes)}
    for n in nodes:
        n.deps = [d for d in n.deps if d in order and order[d] < order[n.name]]
    by = {n.name: n for n in nodes}
    indeg: Dict[str, int] = {n.name: 0 for n in nodes}
    succ: Dict[str, List[str]] = {n.name: [] for n in nodes}
    for n in nodes:
        for d in n.deps:
            indeg[n.name] += 1; succ[d].append(n.name)
    q = deque([n for n in nodes if indeg[n.name] == 0]); seen = 0
    while q:
        v = q.popleft(); seen += 1
        for m in succ[v.name]:
            indeg[m] -= 1
            if indeg[m] == 0: q.append(by[m])
    if seen != len(nodes):
        _LOG.warning("cycle detected; clearing deps on cyclic nodes")
        for n in nodes:
            if indeg[n.name] > 0: n.deps = []
    return nodes

async def make_plan(llm: PlannerLLM, query: str, cls: Classification) -> Plan:
    prompt = _fmt(PLANNER_PROMPT, q=query)
    try:
        raw = await llm.complete(prompt, temperature=0.0, timeout=60.0)
    except Exception as e:
        raise PlanningError(f"planner LLM failed: {e}") from e
    blob = _first_json_object(raw) or "{}"
    nodes: List[Node] = []
    try:
        data = safe_json_loads(blob, default={}) or {}
        raw_nodes = data.get("nodes") or []
        if not isinstance(raw_nodes, list) or not raw_nodes:
            raise ValueError("no nodes")
        seen: set[str] = set()
        for i, nd in enumerate(raw_nodes):
            name = _slug(str(nd.get("name", f"step-{i+1}")), f"step-{i+1}")
            if name in seen:
                name = _slug(f"{name}-{i+1}", f"step-{i+1}")
            seen.add(name)
            deps = [str(d) for d in (nd.get("deps") or []) if isinstance(d, str)]
            tmpl = str(nd.get("tmpl") or "GENERIC")
            if tmpl not in KNOWN_TEMPLATES:
                _LOG.debug("Unknown tmpl '%s' → using GENERIC", tmpl)
                tmpl = "GENERIC"
            role = str(nd.get("role") or ("backbone" if i == 0 else "adjunct")).lower()
            prompt_override = None
            if isinstance(nd.get("prompt"), str) and nd["prompt"].strip():
                prompt_override = nd["prompt"].strip()
            # Contract: prefer planner-supplied contract if present; otherwise use template defaults.
            planner_contract_obj = nd.get("contract")
            if isinstance(planner_contract_obj, dict):
                contract = _parse_contract(planner_contract_obj, fallback_section=tmpl)
            else:
                contract = TEMPLATE_CONTRACTS.get(tmpl, _parse_contract({"format":{"markdown_section":tmpl}}, tmpl))
            nodes.append(Node(
                name=name,
                tmpl=tmpl,
                deps=deps,
                contract=contract,
                role=role if role in {"backbone","adjunct"} else "adjunct",
                prompt_override=prompt_override
            ))
    except Exception as e:
        _LOG.warning("planner parse failed (%s); falling back to linear", e)
        nodes = [Node(name="answer", tmpl="GENERIC", deps=[],
                      contract=_parse_contract({"format":{"markdown_section":"Answer"}}, "Answer"),
                      role="backbone")]
    if cls.kind == "Atomic" and len(nodes) != 1: nodes = nodes[:1]
    elif cls.kind == "Hybrid" and not (2 <= len(nodes) <= 4): nodes = nodes[:max(2, min(4, len(nodes)))]
    elif cls.kind == "Composite" and not (4 <= len(nodes) <= 8): nodes = nodes[:max(4, min(8, len(nodes)))]
    if not nodes: raise PlanningError("empty plan after repair")
    nodes = _validate_and_repair_plan(nodes)
    return Plan(nodes=nodes)

_HDR = re.compile(r"^\s{0,3}(#+)\s+(.+?)\s*$", re.M)

def _ensure_header(text: str, wanted: str) -> Tuple[bool, Optional[Patch]]:
    headers = [m.group(2).strip().lower() for m in _HDR.finditer(text)]
    if wanted.lower() in headers: return True, None
    return False, Patch(kind="insert_header", arg={"level": 2, "title": wanted})

# --- Output sanitization to keep internal prompt scaffolding out of artifacts ---
#
# Strip any context block the solver might have echoed and any guidance constraints
_CTXT_BLOCK = re.compile(r"(?ms)^\s*##\s*Context\s*\(deps\)\s*.*?(?=^\s*##\s|\Z)")
_CONS_BLOCK = re.compile(r"(?ms)\n+Constraints:\n(?:\s*-\s.*\n)+")

def _strip_internal_markers(text: str) -> str:
    t = _sanitize_text(text)
    t = _CTXT_BLOCK.sub("", t)
    t = _CONS_BLOCK.sub("\n", t)
    # collapse excessive blank lines
    t = re.sub(r"\n{3,}", "\n\n", t).strip()
    return t

def run_tests(content: str, contract: Contract) -> QAResult:
    issues: List[Issue] = []
    if not content.strip(): 
        issues.append(Issue(code="empty", details={}, suggested=[]))
    words = len(re.findall(r"\b\w+\b", content))
    for t in contract.tests:
        if t.kind == "nonempty":
            if words < 1: issues.append(Issue(code="nonempty_fail", details={}, suggested=[]))
        elif t.kind == "regex":
            try:
                rgx = re.compile(str(t.arg), re.I | re.M)
                if rgx.search(content) is None: issues.append(Issue(code="regex_fail", details={"pattern": t.arg}, suggested=[]))
            except re.error:
                issues.append(Issue(code="regex_invalid", details={"pattern": t.arg}, suggested=[]))
        elif t.kind == "contains":
            if str(t.arg).lower() not in content.lower(): issues.append(Issue(code="contains_missing", details={"needle": t.arg}, suggested=[]))
        elif t.kind == "word_count_min":
            try: need = int(t.arg)
            except Exception: need = 50
            if words < need: issues.append(Issue(code="too_short", details={"needed": need, "have": words}, suggested=[Patch(kind="append_text", arg={"hint": f"Expand with {need-words}+ words of specifics."})]))
        elif t.kind == "header_present":
            want = str(t.arg); ok, patch = _ensure_header(content, want)
            if not ok: issues.append(Issue(code="header_missing", details={"wanted": want}, suggested=[patch] if patch else []))
    return QAResult(ok=(len(issues) == 0), issues=issues)

def apply_patches(content: str, patches: Sequence[Patch]) -> str:
    out = content
    for p in patches:
        if p.kind == "insert_header":
            title = str(p.arg.get("title", "Section")).strip()
            ok, _ = _ensure_header(out, title)
            if ok:
                continue
            level = int(p.arg.get("level", 2))
            hdr = "#" * max(1, min(6, level))
            m = _HDR.search(out)
            if m and out[:m.start()].strip() == "":
                out = f"{hdr} {title}\n" + out[m.end():]
            else:
                out = f"{hdr} {title}\n\n{out}" if out.strip() else f"{hdr} {title}\n"
        elif p.kind == "append_text":
            hint = str(p.arg.get("hint", "")).strip()
            if hint: out = out.rstrip() + "\n\n" + hint + "\n"
        elif p.kind == "prepend_text":
            hint = str(p.arg.get("hint", "")).strip()
            if hint: out = hint + "\n\n" + out.lstrip()
        elif p.kind == "regex_sub":
            try:
                pat = re.compile(str(p.arg["pattern"]), re.M); repl = str(p.arg.get("repl", "")); out = pat.sub(repl, out)
            except Exception: pass
    return out

@dataclass(slots=True)
class StructureJudge:
    name: str = "structure"
    async def critique(self, text: str, contract: Contract) -> Critique:
        desired = str(contract.format.get("markdown_section") or "").strip()
        score = 0.8; comments = []; guidance = {"structure":0.0,"brevity":0.0,"evidence":0.0}
        if desired:
            hdr_ok, _ = _ensure_header(text, desired)
            if not hdr_ok: score -= 0.15; guidance["structure"] += 0.15; comments.append(f"Missing expected section header: '{desired}'.")
        if len(text.strip()) < 40:
            score -= 0.1
            guidance["evidence"] += 0.1
            comments.append("Content is thin; add concrete details or examples.")
        return Critique(score=max(0.0, min(1.0, score)), comments=" ".join(comments), guidance=guidance)

@dataclass(slots=True)
class ConsistencyJudge:
    name: str = "consistency"
    _is_not = re.compile(r"\b([\w\- ]+?)\s+is\s+not\b", re.I)
    _is_yes = re.compile(r"\b([\w\- ]+?)\s+is\b(?!\s*not)", re.I)
    async def critique(self, text: str, contract: Contract) -> Critique:
        negs = {m.group(1).strip().lower() for m in self._is_not.finditer(text)}
        poss = {m.group(1).strip().lower() for m in self._is_yes.finditer(text)}
        inter = {s for s in poss if s in negs}
        score = 0.8; comments = []; guidance = {"structure":0.0,"brevity":0.0,"evidence":0.0}
        if inter: score -= 0.25; comments.append(f"Possible self-contradiction on: {sorted(inter)}. Resolve or qualify."); guidance["evidence"] += 0.25
        return Critique(score=max(0.0, min(1.0, score)), comments=" ".join(comments), guidance=guidance)

@dataclass(slots=True)
class BrevityJudge:
    name: str = "brevity"
    async def critique(self, text: str, contract: Contract) -> Critique:
        words = len(re.findall(r"\b\w+\b", text))
        score = 0.8; comments = []; guidance = {"structure":0.0,"brevity":0.0,"evidence":0.0}
        if words > 800:
            score -= 0.15
            guidance["brevity"] += 0.15
            comments.append(OVERLONG_HINT)
        elif words < 80:
            score -= 0.10
            guidance["evidence"] += 0.1
            comments.append(TOO_SHORT_HINT)
        return Critique(score=max(0.0, min(1.0, score)), comments=" ".join(comments), guidance=guidance)

class JudgeRegistry:
    def __init__(self) -> None:
        self._judges: Dict[str, Judge] = {}
    def register(self, judge: Judge) -> None:
        self._judges[judge.name] = judge
    def get_all(self) -> List[Judge]:
        return list(self._judges.values())

JUDGES = JudgeRegistry()
JUDGES.register(StructureJudge())
JUDGES.register(ConsistencyJudge())
JUDGES.register(BrevityJudge())

@dataclass(slots=True)
class LLMJudge:
    name: str = "llm-judge"
    solver: Optional[BlackBoxSolver] = None
    async def critique(self, text: str, contract: Contract) -> Critique:
        if self.solver is None:
            return Critique(score=0.7, comments=LLM_JUDGE_UNAVAILABLE, guidance={"structure":0.0,"brevity":0.0,"evidence":0.0})
        prompt = _fmt(LLM_JUDGE_PROMPT, text=text, contract=json.dumps(contract.format))
        try:
            async with GLOBAL_LIMITER.slot():
                res = await asyncio.wait_for(self.solver.solve(prompt, context={"mode":"judge"}), timeout=15.0)
            raw = res.text if isinstance(res, SolverResult) else str(res)
            data = json.loads(_first_json_object(raw) or "{}")
            score = max(0.0, min(1.0, float(data.get("score", 0.7))))
            comments = str(data.get("comments", ""))
            g = data.get("guidance", {"structure":0.0,"brevity":0.0,"evidence":0.0})
            guidance = {"structure":float(g.get("structure",0.0)), "brevity":float(g.get("brevity",0.0)), "evidence":float(g.get("evidence",0.0))}
            return Critique(score=score, comments=comments, guidance=guidance)
        except Exception as e:
            _LOG.warning("LLMJudge failed: %s", e)
            return Critique(score=0.7, comments=LLM_JUDGE_ERROR, guidance={"structure":0.0,"brevity":0.0,"evidence":0.0})

def detect_cross_contradictions(artifacts: Sequence[Artifact]) -> List[Tuple[str, str, str]]:
    is_not = re.compile(r"\b([\w\- ]+?)\s+is\s+not\b", re.I)
    is_yes = re.compile(r"\b([\w\- ]+?)\s+is\b", re.I)
    claims_yes: Dict[str, List[str]] = {}
    claims_no: Dict[str, List[str]] = {}
    for a in artifacts:
        subs_no = {m.group(1).strip().lower() for m in is_not.finditer(a.content)}
        subs_yes = {m.group(1).strip().lower() for m in is_yes.finditer(a.content)}
        for s in subs_no: claims_no.setdefault(s, []).append(a.node)
        for s in subs_yes: claims_yes.setdefault(s, []).append(a.node)
    conflicts: List[Tuple[str, str, str]] = []
    for subj, nodes_yes in claims_yes.items():
        nodes_no = claims_no.get(subj, [])
        for na in nodes_yes:
            for nb in nodes_no:
                if na != nb: conflicts.append((na, nb, subj))
    uniq = sorted(set((min(a,b), max(a,b), s) for a, b, s in conflicts))
    return uniq

def _extract_claim_snippets(text: str, subject: str) -> str:
    sent = re.split(r'(?<=[.!?])\s+', text)
    keep = [s for s in sent if subject.lower() in s.lower() and re.search(r"\bis\s+(?:not\b)?", s, re.I)]
    merged = "\n".join(keep[:4]).strip()
    return merged or text[:300]

async def draft_resolution(solver: BlackBoxSolver, conflicts: List[Tuple[str, str, str]], blackboard: Dict[str, Artifact]) -> str:
    if not conflicts: return ""
    lines = ["## Contradiction Resolution", ""]
    for a, b, subj in conflicts:
        ta = _extract_claim_snippets(blackboard[a].content, subj)
        tb = _extract_claim_snippets(blackboard[b].content, subj)
        prompt = _fmt(CONTRADICTION_PROMPT, subject=subj, a=ta, b=tb)
        try:
            async with GLOBAL_LIMITER.slot():
                res = await asyncio.wait_for(solver.solve(prompt, context={"mode":"contradiction_resolution"}), timeout=30.0)
            text = res.text if isinstance(res, SolverResult) else str(res)
        except Exception as e:
            text = f"_Resolution unavailable: {e}_"
        lines.append(f"### {subj.title()}"); lines.append(text.strip()); lines.append("")
    return "\n".join(lines).strip()

@dataclass(slots=True)
class OrchestratorConfig:
    concurrent: int = int(os.getenv("LOCAL_CONCURRENT", "6"))
    max_rounds: int = int(os.getenv("MAX_ROUNDS", "3"))
    min_score: float = float(os.getenv("MIN_SCORE", "0.65"))
    qa_hard_fail: bool = bool(int(os.getenv("QA_HARD_FAIL", "0")))
    max_tokens_per_node: int = int(os.getenv("MAX_TOKENS_PER_NODE", "3000"))
    max_tokens_per_run: int = int(os.getenv("MAX_TOKENS_PER_RUN", "12000"))
    node_timeout_sec: float = float(os.getenv("NODE_TIMEOUT_SEC", "60.0"))
    judge_timeout_sec: float = float(os.getenv("JUDGE_TIMEOUT_SEC", "8.0"))
    enable_llm_judge: bool = bool(int(os.getenv("ENABLE_LLM_JUDGE", "0")))
    apply_node_recs: bool = bool(int(os.getenv("APPLY_NODE_RECS", "1")))
    apply_global_recs: bool = bool(int(os.getenv("APPLY_GLOBAL_RECS", "1")))
    hedge_enable: bool = bool(int(os.getenv("HEDGE_ENABLE", "0")))
    hedge_delay_sec: float = float(os.getenv("HEDGE_DELAY_SEC", "1.0"))
    kline_enable: bool = bool(int(os.getenv("KLINE_ENABLE", "1")))
    kline_top_k: int = int(os.getenv("KLINE_TOP_K", "3"))
    kline_min_sim: float = float(os.getenv("KLINE_MIN_SIM", "0.2"))
    kline_hint_tokens: int = int(os.getenv("KLINE_HINT_TOKENS", "400"))
    use_cqap: bool = bool(int(os.getenv("USE_CQAP", "1")))
    use_llm_cqap: bool = bool(int(os.getenv("USE_LLM_CQAP", "1")))
    plan_from_meta: bool = bool(int(os.getenv("PLAN_FROM_META", "1")))
    use_llm_classifier: bool = bool(int(os.getenv("USE_LLM_CLASSIFIER", "1")))

@dataclass(slots=True)
class Orchestrator:
    solver: BlackBoxSolver
    planner_llm: PlannerLLM
    memory: MemoryStore
    judges: Optional[List[Judge]] = None
    config: OrchestratorConfig = field(default_factory=OrchestratorConfig)
    cqap: Optional[Mapping[str, Any]] = None
    mission_plan: Optional[Mapping[str, Any]] = None
    on_node_start: Optional[Callable[[str], Awaitable[None]]] = None
    on_node_complete: Optional[Callable[[Artifact], Awaitable[None]]] = None
    on_pass_complete: Optional[Callable[[str, Dict[str, Artifact]], Awaitable[None]]] = None
    _tokens_used: int = 0
    run_id: Optional[str] = None
    _token_lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False)
    _score_history: List[float] = field(default_factory=list, init=False)
    _last_energy: Optional[float] = None
    _current_sig: Optional[str] = None
    _current_query: str = ""

    @staticmethod
    def _approx_tokens(text: str) -> int:
        return max(1, len(text) // 4)

    def _coerce_solver_result(self, res: str | SolverResult) -> SolverResult:
        if isinstance(res, SolverResult):
            return res
        s = str(res) if res is not None else ""
        # Handle cases where backends return "SolverResult(text='...')" as a string.
        try:
            m = re.search(r"SolverResult\(\s*text\s*=\s*(['\"])(?P<t>(?:\\.|(?!\1).)*)\1", s, re.S)
            if m:
                txt = m.group("t")
                # best-effort unescape of Python-style escapes
                try:
                    txt = bytes(txt, "utf-8").decode("unicode_escape")
                except Exception:
                    pass
                return SolverResult(text=_sanitize_text(txt))
        except Exception:
            pass
        return SolverResult(text=_sanitize_text(s))

    def _add_tokens(self, result: SolverResult) -> int:
        used = result.total_tokens or ((result.prompt_tokens or 0) + (result.completion_tokens or 0)) or self._approx_tokens(result.text)
        self._tokens_used += int(used); 
        return int(used)

    async def _reserve_tokens(self, n: int) -> bool:
        async with self._token_lock:
            if self._tokens_used + n > self.config.max_tokens_per_run:
                return False
            self._tokens_used += n
            return True

    def _weighted_average(self, scores: List[Any], weights: Optional[List[float]] = None) -> float:
        """Compute weighted average of judge scores. Defaults to simple mean."""
        if not scores:
            return 0.0
        clean_scores: List[float] = []
        for s in scores:
            if isinstance(s, (int, float)):
                clean_scores.append(float(s))
            elif isinstance(s, Critique):
                clean_scores.append(float(s.score))
            else:
                _LOG.debug("Ignoring non-numeric score: %r", s)
        if not clean_scores:
            return 0.0
        if weights and len(weights) == len(clean_scores):
            total = sum(w * s for s, w in zip(clean_scores, weights))
            return total / (sum(weights) or 1.0)
        return sum(clean_scores) / len(clean_scores)

    
    async def _hedged_solve(self, task: str, context: Mapping[str, Any], timeout: float) -> SolverResult:
        if not self.config.hedge_enable:
            async with GLOBAL_LIMITER.slot():
                res = await asyncio.wait_for(self.solver.solve(task, context=context), timeout=timeout)
            return self._coerce_solver_result(res)
        async with GLOBAL_LIMITER.slot():
            primary = asyncio.create_task(asyncio.wait_for(self.solver.solve(task, context=context), timeout=timeout))
        async def _backup():
            await asyncio.sleep(self.config.hedge_delay_sec)
            async with GLOBAL_LIMITER.slot():
                return await asyncio.wait_for(self.solver.solve(task, context=context), timeout=timeout)
        backup = asyncio.create_task(_backup())
        done, pending = await asyncio.wait({primary, backup}, return_when=asyncio.FIRST_COMPLETED)
        for p in pending: p.cancel()
        res = list(done)[0].result()
        return self._coerce_solver_result(res)

    async def _run_judges(self, text: str, contract: Contract) -> List[Critique]:
        judges = self.judges or JUDGES.get_all()
        async def _one(j: Judge) -> Critique:
            try:
                # Noise-resilient ensemble for LLM judges
                if isinstance(j, LLMJudge):
                    c1 = await asyncio.wait_for(j.critique(text, contract), timeout=self.config.judge_timeout_sec)
                    c2 = await asyncio.wait_for(j.critique(text, contract), timeout=self.config.judge_timeout_sec)
                    if abs(c1.score - c2.score) > 0.3:
                        # choose closer to neutral baseline; avoid referencing outer results
                        base = 0.7
                        return c1 if abs(c1.score - base) <= abs(c2.score - base) else c2
                    # average if consistent
                    return Critique(score=(c1.score + c2.score) / 2.0,
                                    comments=(c1.comments or "")[:200] or c2.comments,
                                    guidance={
                                        "structure": (c1.guidance.get("structure",0.0)+c2.guidance.get("structure",0.0))/2.0,
                                        "brevity": (c1.guidance.get("brevity",0.0)+c2.guidance.get("brevity",0.0))/2.0,
                                        "evidence": (c1.guidance.get("evidence",0.0)+c2.guidance.get("evidence",0.0))/2.0,
                                    })
                return await asyncio.wait_for(j.critique(text, contract), timeout=self.config.judge_timeout_sec)
            except Exception as e:
                _LOG.warning("judge '%s' failed: %s", getattr(j, "name", "unknown"), e)
                return Critique(score=0.7, comments=JUDGE_ERROR_MSG, guidance={"structure":0.0,"brevity":0.0,"evidence":0.0})
        results_raw = await asyncio.gather(*(_one(j) for j in judges), return_exceptions=True)
        results: List[Critique] = []
        for j, r in zip(judges, results_raw):
            if isinstance(r, Critique):
                results.append(r)
            else:
                _LOG.warning("judge '%s' raised: %s", getattr(j, "name", "unknown"), r)
                results.append(Critique(score=0.7, comments=JUDGE_EXCEPTION_MSG, guidance={"structure":0.0,"brevity":0.0,"evidence":0.0}))
        for j, c in zip(judges, results):
            delta = (c.score - 0.7) * 0.1; self.memory.bump_judge(getattr(j, "name", "unknown"), delta)
        self.memory.save()
        return results

    def deliberate_judges(self, critiques: List[Critique]) -> float:
        """Aggregate judge critiques via negotiation."""
        if not critiques:
            return 0.0
        scores = [c.score for c in critiques]
        mean = sum(scores) / len(scores)
        var = sum((s - mean) ** 2 for s in scores) / len(scores)
        stddev = math.sqrt(var)
        if stddev < 0.15:
            return mean
        # check for >= 2/3 agreement
        for s in set(round(sc, 2) for sc in scores):
            if scores.count(s) / len(scores) >= (2 / 3):
                return s
        # fallback weighted average
        judges = self.judges or JUDGES.get_all()
        w = [self.memory.get_judge_weight(getattr(j, "name", "unknown")) for j in judges]
        return sum(c.score * ww for c, ww in zip(critiques, w)) / (sum(w) or 1.0)

    class Homeostat:
        async def monitor(self, orch: "Orchestrator") -> None:
            """Adaptive controller adjusting max_rounds based on performance."""
            try:
                while True:
                    await asyncio.sleep(1.0)
                    try:
                        arts = list(getattr(orch, "_last_artifacts", {}).values())
                        scores = [c.score for a in arts for c in a.critiques]
                        avg_score = sum(scores) / len(scores) if scores else 0.0
                        failures = sum(1 for a in arts[-5:] if a.status != "ok")
                        if failures > 2:
                            orch.config.max_rounds = min(5, orch.config.max_rounds + 1)
                        elif avg_score > 0.9 and len(arts) >= 3:
                            orch.config.max_rounds = max(1, orch.config.max_rounds - 1)
                    except Exception:
                        continue
            except asyncio.CancelledError:
                # Graceful shutdown on cancel
                return

    def _build_context(self, node: Node, blackboard: Dict[str, Artifact], token_budget: int = 800) -> str:
        """Concise pack of dependency artifacts; trimmed to ~token_budget."""
        if not node.deps:
            return ""
        parts: List[str] = []
        used = 0
        for d in node.deps:
            a = blackboard.get(d)
            if not a: 
                continue
            head = f"### {d}\n"
            body = _sanitize_text(a.content).strip()
            room = max(0, token_budget - used)
            if room <= 0:
                break
            max_chars = max(200, room * 4)
            snippet = body[:max_chars].rstrip()
            parts.append(head + snippet)
            used += max(1, len(snippet)//4)
        return ("## Context (deps)\n" + "\n\n".join(parts)).strip()

    def _deps_bullets(self, *, context_text: str, node: Node, blackboard: Dict[str, Artifact]) -> str:
        """
        Single source of truth for building dependency bullets used in first-pass and improvements.
        Prefers structured extraction from context; falls back to node.dep names.
        """
        if context_text:
            _hdr = re.compile(r"^###\s+(.+?)\s*$", re.M)
            bullets = []
            last = None
            for m in _hdr.finditer(context_text):
                if last is not None:
                    start = last.end()
                    end = m.start()
                    body = context_text[start:end].strip().replace("\n", " ")
                    bullets.append(f"- {last.group(1)}: {body[:120]}")
                last = m
            if last is not None:
                body = context_text[last.end():].strip().replace("\n", " ")
                bullets.append(f"- {last.group(1)}: {body[:120]}")
            if bullets:
                return "\n".join(bullets)
        # fallback: short previews from concrete deps
        if node.deps:
            previews = []
            for d in node.deps:
                a = blackboard.get(d)
                if a and a.content:
                    previews.append(f"- {d}: {a.content[:120].replace('\n',' ')}")
            if previews:
                return "\n".join(previews)
        return "\n".join(f"- {d}" for d in (node.deps or []))

    def _sig(self, query: str, cls_kind: str) -> str:
        key = (cls_kind + ":" + re.sub(r"\s+", " ", query).strip().lower())[:512]
        return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]

    async def _guidance_summary(self, text: str, contract: Contract) -> str:
        qa = run_tests(text, contract)
        bullets = []
        for issue in qa.issues:
            if issue.code in {"missing_header","header_missing"}: bullets.append(f"- Include the markdown header '{issue.details.get('wanted')}'.")
            elif issue.code == "too_short": bullets.append(f"- Expand with at least {issue.details.get('needed',150)} words of concrete details and examples.")
            elif issue.code == "regex_fail": bullets.append(f"- Ensure pattern present: {issue.details.get('pattern')}.")
            elif issue.code == "contains_missing": bullets.append(f"- Include this key term: {issue.details.get('needle')}.")
            elif issue.code == "empty": bullets.append("- Content must not be empty; write the section fully.")
        if not bullets:
            bullets.append(GUIDANCE_MESSAGES["fallback"])
        return "\n".join(bullets)

    async def _recommend_node(self, node: Node, art: Artifact) -> Artifact:
        prompt = _fmt(
            NODE_RECOMMEND_PROMPT,
            section=node.contract.format.get("markdown_section"),
            content=str(art.content),
        )
        try:
            res = await self._hedged_solve(prompt, {"mode":"node_recommend","node":node.name}, timeout=10.0)
            data = json.loads(_first_json_object(res.text) or "{}")
            recs = [str(x) for x in data.get("recommendations", [])][:8]
        except Exception:
            recs = []
        art.recommendations = recs
        if self.config.apply_node_recs and recs:
            apply_prompt = _fmt(
                NODE_APPLY_PROMPT,
                recs="\n- ".join(recs),
                content=str(art.content),
            )
            try:
                r = await self._hedged_solve(apply_prompt, {"mode":"node_apply","node":node.name}, timeout=20.0)
                art.content = r.text
                art.qa = run_tests(art.content, node.contract)
                art.critiques = await self._run_judges(art.content, node.contract)
            except Exception: pass
        # Judges are advisory; only QA failure should mark a node as needing more depth
        if not art.qa.ok:
            art.status = "needs_more_depth"
        return art

    async def _improve_until_ok(self, node: Node, initial: SolverResult, blackboard: Dict[str, Artifact], context_text: str = "") -> Artifact:
        content = initial.text
        node_tokens = self._add_tokens(initial)
        self._audit_event(node.name, "initial_solve",
                          input={"template": node.tmpl, "context": context_text},
                          output={"content": _strip_internal_markers(content) or content})

        for round_idx in range(self.config.max_rounds):
            if self._tokens_used >= self.config.max_tokens_per_run: raise ExecutionError("run token budget exhausted")
            if node_tokens >= self.config.max_tokens_per_node: break
            qa = run_tests(content, node.contract)
            if qa.ok:
                crits = await self._run_judges(content, node.contract)
                self._audit_event(node.name, f"judge_round_{round_idx}",
                                  output={"qa_ok": qa.ok,
                                          "issues": [i.code for i in qa.issues],
                                          "scores": [c.score for c in crits]})
                # Judges are advisory; if QA passes, accept the section
                return Artifact(node=node.name, content=content, qa=qa, critiques=crits)
            patches = [p for issue in qa.issues for p in issue.suggested]
            if patches:
                try: content = apply_patches(content, patches); self.memory.record_patch("batch", True)
                except Exception: self.memory.record_patch("batch", False)
            guide = await self._guidance_summary(content, node.contract)
            # Build dependency bullets (unified)
            deps_bullets = self._deps_bullets(context_text=context_text, node=node, blackboard=blackboard)

            try:
                prompt = node.build_prompt(query=self._current_query, deps_bullets=deps_bullets)
                if context_text:
                    prompt += "\n\n" + _sanitize_text(context_text)
                prompt += "\n\n" + _fmt(ITERATIVE_CONSTRAINTS_PROMPT, guide=guide)
                res = await self._hedged_solve(prompt, {"improve_round":round_idx+1,"node":node.name}, timeout=self.config.node_timeout_sec)
                content = _strip_internal_markers(res.text); node_tokens += self._add_tokens(res)
                self._audit_event(node.name, f"revise_round_{round_idx}",
                                  input={"constraints": guide, "patches": [p.kind for p in patches]},
                                  output={"content": content})
                if node_tokens > self.config.max_tokens_per_node:
                    content = content[:max(100, self.config.max_tokens_per_node * 4)]
            except Exception as e:
                _LOG.exception("solver improve failed (node=%s): %s", node.name, e)
                if self.config.qa_hard_fail: raise ExecutionError(f"solver failed for {node.name}: {e}")
                break
        qa = run_tests(content, node.contract)
        crits = await self._run_judges(content, node.contract)
        # Only QA gates acceptance; persist best-effort content either way
        status = "ok" if qa.ok else "needs_more_depth"
        if (not qa.ok) and self._current_sig:
            self.memory.penalize_kline(self._current_sig)
        return Artifact(node=node.name, content=content, qa=qa, critiques=crits, status=status)


    async def _execute_node(self, node: Node, blackboard: Dict[str, Artifact]) -> Artifact:
        if self._tokens_used >= self.config.max_tokens_per_run: raise ExecutionError("run token budget exhausted")
        if self.on_node_start:
            try: await self.on_node_start(node.name)
            except Exception as e: _LOG.warning("on_node_start callback failed: %s", e)

        ctx = self._build_context(node, blackboard, token_budget=800)
        try:
            deps_bullets = self._deps_bullets(context_text=ctx, node=node, blackboard=blackboard)
            first_prompt = node.build_prompt(query=self._current_query, deps_bullets=deps_bullets)
            if ctx:
                first_prompt += "\n\n" + ctx
            res = await self._hedged_solve(first_prompt, {"node":node.name, "deps":node.deps}, timeout=self.config.node_timeout_sec)
            est = res.total_tokens or self._approx_tokens(res.text)
            if est > self.config.max_tokens_per_node:
                res = SolverResult(text=_sanitize_text(res.text)[:max(100, self.config.max_tokens_per_node * 4)], total_tokens=self.config.max_tokens_per_node)
        except Exception as e:
            raise ExecutionError(f"solver failed for node {node.name}: {e}") from e
        art = await self._improve_until_ok(node, res, blackboard, context_text=ctx)
        art = await self._recommend_node(node, art)
        # track rolling score history for stability/forecasting
        if art.critiques:
            try:
                self._score_history.append(self.deliberate_judges(art.critiques))
                self._score_history[:] = self._score_history[-50:]
            except Exception:
                pass
        if self.on_node_complete:
            try: await self.on_node_complete(art)
            except Exception as e: _LOG.warning("on_node_complete callback failed: %s", e)
        return art

    def _partition_backbone(self, plan: Plan) -> Tuple[List[Node], List[Node]]:
        by = {n.name: n for n in plan.nodes}
        succ: Dict[str, List[str]] = {n.name: [] for n in plan.nodes}
        for n in plan.nodes:
            for d in n.deps:
                if d in by: succ[d].append(n.name)
        bb = {n.name for n in plan.nodes if n.role == "backbone"}
        if not bb:
            sinks = [n.name for n in plan.nodes if not succ[n.name]] or [plan.nodes[-1].name]
            target = sinks[0]
            path = [target]; seen = set([target])
            cur = by[target]
            while cur.deps:
                d = cur.deps[0]
                if d in seen: break
                path.append(d); seen.add(d); cur = by[d]
                if len(path) >= 3: break
            bb = set(path)
        closure = set()
        stack = list(bb)
        while stack:
            x = stack.pop()
            if x in closure: continue
            closure.add(x)
            for d in by[x].deps:
                if d not in closure: stack.append(d)
        backbone_nodes = [n for n in plan.nodes if n.name in closure]
        adjunct_nodes = [n for n in plan.nodes if n.name not in closure]
        return backbone_nodes, adjunct_nodes

    async def adaptive_run_dag(self, nodes: List[Node]) -> Dict[str, Artifact]:
        by_name = {n.name: n for n in nodes}
        indeg: Dict[str, int] = {n.name: 0 for n in nodes}
        succ: Dict[str, List[str]] = {n.name: [] for n in nodes}
        for n in nodes:
            for d in n.deps:
                if d in by_name:
                    indeg[n.name] += 1; succ[d].append(n.name)
        sem = asyncio.Semaphore(self.config.concurrent)
        blackboard: Dict[str, Artifact] = {}
        ready = [n for n in nodes if indeg[n.name] == 0]
        in_flight: Dict[str, asyncio.Task[Artifact]] = {}
        async def run_with_sem(n: Node) -> Artifact:
            async with sem:
                return await self._execute_node(n, blackboard)
        for n in ready:
            in_flight[n.name] = asyncio.create_task(run_with_sem(n))
        pending = set(in_flight.values())
        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                try:
                    art = task.result()
                except Exception as e:
                    # Identify which node failed
                    failed_node = None
                    try:
                        for name, t in in_flight.items():
                            if t is task:
                                failed_node = by_name.get(name)
                                break
                    except Exception:
                        failed_node = None
                    # Retry once
                    if failed_node:
                        try:
                            _AUDIT.info(json.dumps({"rewire":"retry","node":failed_node.name,"reason":str(e)}))
                            retry_art = await run_with_sem(failed_node)
                            art = retry_art
                        except Exception as e2:
                            _AUDIT.info(json.dumps({"rewire":"bypass","node":failed_node.name,"error":str(e2),"deps":failed_node.deps,"succ":succ.get(failed_node.name,[])}, ensure_ascii=False))
                            blackboard[failed_node.name] = Artifact(node=failed_node.name, content="", qa=QAResult(ok=False), critiques=[], status="bypassed")
                            for m in succ.get(failed_node.name, []):
                                cur = by_name[m]
                                # splice deps
                                cur.deps = [d for d in cur.deps if d != failed_node.name]
                                for d in failed_node.deps:
                                    if d not in cur.deps:
                                        cur.deps.append(d)
                                # recompute indegree from live deps
                                indeg[m] = sum(1 for d in cur.deps if d in by_name)
                                if indeg[m] == 0 and m not in in_flight:
                                    in_flight[m] = asyncio.create_task(run_with_sem(cur)); pending.add(in_flight[m])
                            continue
                    else:
                        raise ExecutionError(f"node execution failed: {e}") from e
                # ✅ Store the finished artifact so deps & composer can see it
                blackboard[art.node] = art
                for m in succ[art.node]:
                    indeg[m] -= 1
                    if indeg[m] == 0:
                        in_flight[m] = asyncio.create_task(run_with_sem(by_name[m])); pending.add(in_flight[m])
        return blackboard

    @staticmethod
    def _compose(plan: Plan, blackboard: Dict[str, Artifact], include_resolution: str = "") -> str:
        parts: List[str] = []
        for n in plan.nodes:
            art = blackboard.get(n.name)
            if not art:
                placeholder = f"## {n.contract.format.get('markdown_section') or n.name.title()}\n\n{FALLBACK_NODE_PLACEHOLDER}"
                parts.append(placeholder)
                continue
            sec = str(n.contract.format.get("markdown_section") or "").strip() or n.name.title()
            hdr_ok, _ = _ensure_header(art.content, sec)
            cleaned = _strip_internal_markers(art.content)
            body = cleaned if hdr_ok else f"## {sec}\n\n{cleaned.strip()}"
            parts.append(body.strip())
        if include_resolution:
            parts.append(include_resolution.strip())
        return "\n\n---\n\n".join(parts).strip() + "\n"


    async def _cohesion_pass(self, query: str, composed: str, conflicts: List[Tuple[str,str,str]], resolution: str) -> Tuple[List[str], str]:
        prompt = _fmt(
            COHESION_PROMPT,
            query=query,
            conflicts=json.dumps(conflicts),
            resolution=resolution,
            document=composed,
        )
        try:
            res = await self._hedged_solve(prompt, {"mode":"cohesion"}, timeout=45.0)
            data = safe_json_loads(_first_json_object(res.text) or "{}", default={}) or {}
            recs = [str(x) for x in data.get("recommendations", [])][:12]
            revised = _sanitize_text(str(data.get("revised", composed))).strip() or composed
            if len(revised) > 200_000: revised = revised[:200_000]
        except Exception:
            recs, revised = [], composed
        if self.config.apply_global_recs and recs:
            apply_prompt = _fmt(
                COHESION_APPLY_PROMPT,
                recs="\n- ".join(recs),
                document=revised,
            )
            try:
                rr = await self._hedged_solve(apply_prompt, {"mode":"cohesion_apply"}, timeout=45.0)
                revised = rr.text
            except Exception: pass
        return recs, revised

    async def run(self, query: str) -> Dict[str, Any]:
        self._tokens_used = 0
        run_id = uuid.uuid4().hex[:8]
        self.run_id = run_id
        self._audit_event("orchestrator", "start", input={"query": query})
        if self.judges is None: self.judges = JUDGES.get_all()
        if self.config.enable_llm_judge: self.judges = list(self.judges) + [LLMJudge(solver=self.solver)]
        # 0) Optional CQAP meta-first via LLM
        meta_cqap: Optional[Dict[str, Any]] = None
        if self.config.use_cqap and self.config.use_llm_cqap:
            try:
                meta_cqap = await _llm_json_phase(self.planner_llm, "CQAP", _cqap_meta_prompt(query, self.cqap or cognitive_query_analysis_protocol))
                if meta_cqap:
                    self.cqap = meta_cqap  # persist for plan builders
            except Exception as e:
                _LOG.warning("CQAP meta LLM phase failed: %s", e)
        # 1) Classification (after meta; honors short-but-deep via LLM classifier if enabled)
        if self.config.use_llm_classifier:
            try:
                cls = await classify_query_llm(query, self.planner_llm)
            except Exception:
                cls = classify_query(query)
        else:
            cls = classify_query(query)
        _LOG.info("[run=%s] classification: %s (score=%.3f)", run_id, cls.kind, cls.score)
        sig = self._sig(query, cls.kind)
        self._current_sig = sig
        self._current_query = query
        monitor = asyncio.create_task(self.Homeostat().monitor(self))
        try:
            hints = ""
            if self.config.kline_enable:
                try:
                    nbrs = self.memory.query_klines(
                        query, top_k=self.config.kline_top_k, min_sim=self.config.kline_min_sim
                    )
                    # explain recall for transparency
                    for nsig, _sim, _ in nbrs:
                        try:
                            self.memory.explain_recall(nsig)
                        except Exception:
                            pass
                    hints_txt = self.memory.summarize_neighbors(
                        nbrs, char_budget=self.config.kline_hint_tokens * 4
                    )
                    if hints_txt:
                        hints = "\n\n" + hints_txt
                except Exception as e:
                    _LOG.warning("kline hint retrieval failed: %s", e)
            try:
                # 2) Plan selection priority:
                #    a) if plan_from_meta: ask LLM to emit a mission plan using meta (if available)
                #    b) else if CQAP exists: compile CQAP→nodes
                #    c) else: default planner
                plan: Optional[Plan] = None
                if self.config.plan_from_meta and (meta_cqap or self.cqap):
                    try:
                        mp_raw = await _llm_json_phase(self.planner_llm, "MISSION", _mission_plan_prompt(query, meta_cqap or self.cqap or {}), timeout=40.0, max_retries=1)
                        if isinstance(mp_raw, dict) and (mp_raw.get("Strategy") or []):
                            self.mission_plan = mp_raw
                            plan = build_plan_from_mission(mp_raw, query=query)
                    except Exception as e:
                        _LOG.warning("Mission plan LLM phase failed: %s", e)
                if plan is None:
                    if self.config.use_cqap and (meta_cqap or self.cqap):
                        plan = build_plan_from_cqap(query, meta_cqap or self.cqap or {}, cls)
                    else:
                        plan = await make_plan(self.planner_llm, query + hints, cls)
            except PlanningError:
                _LOG.warning("planner failed; attempting replay from best prior kline")
                nodes_replay: List[Node] = []
                best_sig: Optional[str] = None
                try:
                    prev = self.memory.query_klines(query, top_k=3, min_sim=0.1)
                    for sig, _sim, ent in prev:
                        nodes_total = ent.get("nodes") or []
                        ok_nodes = ent.get("ok_nodes") or []
                        if nodes_total and len(ok_nodes) / len(nodes_total) >= 0.8:
                            best_sig = sig
                            break
                    if best_sig is None and prev:
                        best_sig = prev[0][0]
                    if best_sig:
                        nodes_replay = self.memory.replay_kline(best_sig)
                except Exception:
                    nodes_replay = []
                if nodes_replay and best_sig:
                    _AUDIT.info(json.dumps({"trace_replay": {"sig": best_sig}}, ensure_ascii=False))
                    plan = Plan(nodes=_validate_and_repair_plan(nodes_replay))
                else:
                    _LOG.warning("replay unavailable; circuit-breaker to Atomic")
                    plan = Plan(nodes=[Node(name="answer",
                                            tmpl="GENERIC",
                                            deps=[],
                                            contract=_parse_contract({"format":{"markdown_section":"Answer"}}, "Answer"),
                                            role="backbone")])
            _LOG.info("[run=%s] plan: %d nodes", run_id, len(plan.nodes))
            backbone_nodes, adjunct_nodes = self._partition_backbone(plan)
            bb_board = await self.adaptive_run_dag(backbone_nodes)
            if self.on_pass_complete:
                try: await self.on_pass_complete("backbone", bb_board)
                except Exception as e: _LOG.warning("on_pass_complete backbone failed: %s", e)
            ad_board = await self.adaptive_run_dag(adjunct_nodes) if adjunct_nodes else {}
            if self.on_pass_complete:
                try: await self.on_pass_complete("adjuncts", ad_board)
                except Exception as e: _LOG.warning("on_pass_complete adjuncts failed: %s", e)
            blackboard = {**bb_board, **ad_board}
            # expose to controller
            try:
                self._last_artifacts = blackboard  # used by Homeostat
            except Exception:
                pass
            # Stability check after DAG passes
            try:
                self.stability_check()
            except Exception:
                pass
            arts = list(blackboard.values())
            conflicts = detect_cross_contradictions(arts)
            resolution = await draft_resolution(self.solver, conflicts, blackboard) if conflicts else ""
            final = self._compose(plan, blackboard, include_resolution=resolution)

            global_recs, final_cohesive = await self._cohesion_pass(query, final, conflicts, resolution)
            # Persist execution trace snapshot
            try:
                trace = {
                    "nodes": [
                        {
                            "name": n.name,
                            "tmpl": n.tmpl,
                            "deps": n.deps,
                            "role": n.role,
                            "prompt_override": n.prompt_override,
                            "contract": {"format": {"markdown_section": n.contract.format.get("markdown_section")},
                                         "tests": [{"kind": t.kind, "arg": t.arg} for t in n.contract.tests]},
                        }
                        for n in plan.nodes
                    ],
                    "statuses": {k: v.status for k, v in blackboard.items()},
                    "issues": {k: [i.code for i in v.qa.issues] if v.qa else [] for k, v in blackboard.items()},
                }
                self.memory.append_kline_trace(sig, trace)
            except Exception as e:
                _LOG.warning("trace persist failed: %s", e)
            try:
                self.memory.upsert_kline(
                    sig,
                    {
                        "nodes": [
                            {"name": n.name, "role": n.role, "deps": n.deps, "section": n.contract.format.get("markdown_section")}
                            for n in plan.nodes
                        ],
                        "ok_nodes": [k for k, v in blackboard.items() if v.status == "ok"],
                        "global_recs": global_recs[:8],
                        "run": run_id,
                    },
                    query=query,
                    classification={"kind": cls.kind, "score": cls.score},
                )
            except Exception as e:
                _LOG.warning("kline save failed: %s", e)

            # Final stability check post-cohesion
            try:
                self.stability_check()
            except Exception:
                pass

            return {
                "classification": {"kind": cls.kind, "score": cls.score},
                "plan": [{"name": n.name, "deps": n.deps, "role": n.role, "section": n.contract.format.get("markdown_section")} for n in plan.nodes],
                "artifacts": {k: {"content": v.content, "status": v.status, "recommendations": v.recommendations} for k, v in blackboard.items()},
                "conflicts": conflicts,
                "resolution": resolution,
                "final_pre_cohesion": final,
                "final": final_cohesive,
                "global_recommendations": global_recs,
                "run_id": run_id,
            }
        finally:
            monitor.cancel()


    def _audit_event(self, node: str, stage: str,
                     input: Optional[Dict[str, Any]] = None,
                     output: Optional[Dict[str, Any]] = None,
                     status: str = "ok") -> None:
        def _cap(obj: Any) -> Any:
            try:
                s = json.dumps(obj, ensure_ascii=False)
            except Exception:
                s = str(obj)
            if len(s) > AUDIT_MAX_CHARS:
                return {"_truncated": True, "preview": s[:AUDIT_MAX_CHARS]}
            return obj

        ev = {
            "ts": time.time(),
            "run_id": getattr(self, "run_id", None),
            "node": node,
            "stage": stage,
            "status": status,
            "input": _cap(input or {}),
            "output": _cap(output or {}),
        }
        try:
            _AUDIT.info(json.dumps(ev, ensure_ascii=False))
        except Exception:
            pass

    def predict_quality(self, scores: Sequence[float]) -> float:
        """Moving average + exponential smoothing to damp noise."""
        if not scores:
            return 0.7
        ma_window = 5
        ma = sum(scores[-ma_window:]) / min(len(scores), ma_window)
        alpha = 0.4
        s = scores[0]
        for x in scores[1:]:
            s = alpha * x + (1 - alpha) * s
        return (ma + s) / 2.0

    def stability_check(self) -> bool:
        """
        Lyapunov-style energy: E = (pending_tokens / max_tokens) + (1 - avg_score_pred).
        Ensure E decreases; otherwise tighten controls.
        """
        max_tokens = max(1, self.config.max_tokens_per_run)
        pending = max(0, max_tokens - self._tokens_used)
        avg_score_pred = self.predict_quality(self._score_history)
        energy = (pending / max_tokens) + (1.0 - avg_score_pred)
        decreased = True if self._last_energy is None else (energy < (self._last_energy - 1e-6))
        action = {}
        if not decreased:
            # tighten: reduce concurrency or raise min_score
            new_conc = max(1, self.config.concurrent - 1)
            new_min = min(0.95, self.config.min_score + 0.02)
            action = {"concurrent_old": self.config.concurrent, "concurrent_new": new_conc,
                      "min_score_old": self.config.min_score, "min_score_new": new_min}
            self.config.concurrent = new_conc
            self.config.min_score = new_min
        self._last_energy = energy
        try:
            _AUDIT.info(json.dumps({"stability_check":{
                "run_id": self.run_id, "energy": round(energy,4), "avg_score_pred": round(avg_score_pred,4),
                "tokens_used": self._tokens_used, "max_tokens": max_tokens, "decreased": decreased, "action": action
            }}, ensure_ascii=False))
        except Exception:
            pass
        return decreased

class EchoSolver:
    """Trivial echo solver (for demo & testing)."""
    async def solve(
        self, task: str, context: Optional[Mapping[str, Any]] = None
    ) -> str | SolverResult:
        section = "Answer"
        if isinstance(context, Mapping) and "node" in context:
            section = str(context["node"]).replace("-", " ").title()
        text = f"## {section}\n\n{task.strip()}\n"
        approx_tokens = max(1, len(text) // 4)
        return SolverResult(text=text, total_tokens=approx_tokens)


class PromptLLM:
    """Fake planner LLM returning a fixed 3-node plan."""
    async def complete(
        self, prompt: str, *, temperature: float = 0.0, timeout: float = 60.0
    ) -> str:
        plan = {
            "nodes": [
                {
                    "name": "analysis",
                    "prompt": ANALYSIS_NODE_PROMPT,
                    "deps": [],
                    "role": "backbone",
                    "contract": {
                        "format": {"markdown_section": "Analysis"},
                        "tests": [
                            {"kind": "nonempty", "arg": ""},
                            {"kind": "header_present", "arg": "Analysis"},
                            {"kind": "word_count_min", "arg": 80},
                        ],
                    },
                },
                {
                    "name": "answer",
                    "prompt": ANSWER_NODE_PROMPT,
                    "deps": ["analysis"],
                    "role": "backbone",
                    "contract": {
                        "format": {"markdown_section": "Final Answer"},
                        "tests": [
                            {"kind": "nonempty", "arg": ""},
                            {"kind": "header_present", "arg": "Final Answer"},
                            {"kind": "contains", "arg": "analysis"},
                        ],
                    },
                },
                {
                    "name": "examples",
                    "prompt": EXAMPLES_NODE_PROMPT,
                    "deps": ["answer"],
                    "role": "adjunct",
                    "contract": {
                        "format": {"markdown_section": "Examples"},
                        "tests": [
                            {"kind": "nonempty", "arg": ""},
                            {"kind": "header_present", "arg": "Examples"},
                        ],
                    },
                },
            ]
        }
        return json.dumps(plan, ensure_ascii=False, indent=2)


async def _demo() -> None:
    """Demo: dynamically compile a mission plan from the user query, then run the full pipeline."""
    import argparse
    from adapters import build_pipeline_solver_and_planner

    p = argparse.ArgumentParser(description="Blackboard Orchestrator Demo (Dynamic Mission Plan)")
    p.add_argument("query", nargs="*", help="User query text")
    p.add_argument("--mem", default=".blackboard_memory.json", help="Path to memory file")
    p.add_argument("--concurrent", type=int, default=int(os.getenv("LOCAL_CONCURRENT", "4")))
    p.add_argument("--rounds", type=int, default=int(os.getenv("MAX_ROUNDS", "2")))
    p.add_argument("--verbose", action="store_true", help="Enable debug logging")
    p.add_argument("--mock", action="store_true", help="Use MockLLM for deterministic runs")
    p.add_argument("--no-mission", action="store_true",
                   help="Disable dynamic mission planning and use regular planner/CQAP instead")
    p.add_argument("--print-mission", action="store_true",
                   help="Print the generated mission plan JSON")
    args = p.parse_args()

    if args.verbose:
        _LOG.setLevel(logging.DEBUG)

    query = " ".join(args.query).strip() or (
        "Design a secure CRUD API. Provide architecture, data model, and risks. "
        "Compare 2 frameworks and give a migration plan."
    )

    # Build solver + planner (pipeline-backed or mock)
    solver, planner = await build_pipeline_solver_and_planner(use_mock_llm=args.mock)
    memory = MemoryStore(Path(args.mem))

    # === 1) Dynamically compile a mission plan from the query ===
    mission_plan: Optional[Dict[str, Any]] = None
    if not args.no_mission:
        try:
            mission_plan = await planner.plan(query, mode="mission")
            # Guardrail: if mission is empty or has no Strategy, fall back
            if not isinstance(mission_plan, dict) or not (mission_plan.get("Strategy") or []):
                _LOG.warning("Mission planner returned empty/invalid plan; falling back to non-mission mode.")
                mission_plan = None
            else:
                _LOG.info("🧭 mission plan compiled: phases=%d",
                          len(mission_plan.get("Strategy") or []))
                if args.print_mission:
                    print("\n===== 🧭 GENERATED MISSION PLAN =====")
                    print(json.dumps(mission_plan, ensure_ascii=False, indent=2))
        except Exception as e:
            _LOG.warning("Mission planning failed (%s); falling back to non-mission mode.", e)
            mission_plan = None

    async def _on_start(n: str) -> None:
        _LOG.info("🚀 node start: %s", n)

    async def _on_node(a: Artifact) -> None:
        icon = "✅" if a.status == "ok" else "⚠️"
        _LOG.info("%s node complete: %s (status=%s, recs=%d)",
                  icon, a.node, a.status, len(a.recommendations))

    async def _on_pass(name: str, board: Dict[str, Artifact]) -> None:
        _LOG.info("📦 pass complete: %s (%d artifacts)", name, len(board))

    # === 2) Orchestrator: if mission_plan exists, we'll compile it into a DAG and run ===
    orch = Orchestrator(
        solver=solver,
        planner_llm=planner,
        memory=memory,
        mission_plan=mission_plan,
        config=OrchestratorConfig(
            concurrent=args.concurrent,
            max_rounds=args.rounds,
            apply_node_recs=True,
            apply_global_recs=True,
            hedge_enable=True,
            hedge_delay_sec=0.5,
            enable_llm_judge=False,
            # If a mission is provided, we don't need CQAP; otherwise the orchestrator may use it.
            use_cqap=False if mission_plan else True,
        ),
        cqap=cognitive_query_analysis_protocol,         # used only if mission is unavailable and CQAP is enabled
        on_node_start=_on_start,
        on_node_complete=_on_node,
        on_pass_complete=_on_pass,
    )

    # === 3) Run end-to-end: parallel objective pursuit → reconciliation → cohesive synthesis ===
    result = await orch.run(query)

    print("\n===== 📝 FINAL (COHESIVE) =====\n")
    print(result["final"])

    print("\n===== 📋 PLAN =====")
    print(json.dumps(result["plan"], indent=2))

    print("\n===== 🧩 ARTIFACTS =====")
    for k, v in result["artifacts"].items():
        print(f"\n--- {k} ({v['status']}) ---")
        print(v["content"].strip()[:400] + ("..." if len(v["content"]) > 400 else ""))
        if v["recommendations"]:
            print("🔧 Recs:", ", ".join(v["recommendations"]))

    print("\n===== ⚖️ CONFLICTS =====")
    print(result["conflicts"] or "none")

    print("\n===== 🪄 RESOLUTION =====")
    print(result["resolution"] or "(none)")

    print("\n===== 🌐 GLOBAL RECOMMENDATIONS =====")
    for r in result["global_recommendations"]:
        print("-", r)

    print("\n===== 🏷 METADATA =====")
    meta = {"classification": result["classification"], "run_id": result["run_id"]}
    print(json.dumps(meta, indent=2))



def main() -> None:
    try:
        asyncio.run(_demo())
    except KeyboardInterrupt:
        print("\n⏹️ Interrupted by user", flush=True)


_OCTO = r"""

	    ░░██╗  ░░░  ░░░  ██╗░░
	    ░██╔╝            ╚██╗░
	    ██╔╝░  ░░░  ░░░  ░╚██╗
	    ╚██╗░  ░░░  ░░░  ░██╔╝
	    ░╚██╗  ██╗  ██╗  ██╔╝░
	    ░░╚═╝  ╚═╝  ╚═╝  ╚═╝░░
        ░░██╗░░██╗░░██╗██╗░░██╗░░██╗░░
        ░██╔╝░██╔╝░██╔╝╚██╗░╚██╗░╚██╗░
        ██╔╝░██╔╝░██╔╝░░╚██╗░╚██╗░╚██╗
        ╚██╗░╚██╗░╚██╗░░██╔╝░██╔╝░██╔╝
        ░╚██╗░╚██╗░╚██╗██╔╝░██╔╝░██╔╝░
        ░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝░░╚═╝░░
"""

if __name__ == "__main__":
    print(_OCTO)
    main()
