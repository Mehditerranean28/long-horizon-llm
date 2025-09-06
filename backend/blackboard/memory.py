"""
memory.py - Persistent memory store for Blackboard Orchestrator.

Responsibilities:
  - Manage persistent JSON-backed "kline" memory (knowledge lines).
  - Store/retrieve artifacts keyed by hash signature.
  - Provide nearest-neighbor search using core embeddings.
  - Summarize neighbors for hint injection.
  - Replay stored plans for fallback.
"""

from __future__ import annotations

import json
import os
import time
import re
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

from .core import (
    _hash_embed,
    _cosine,
    _quantize,
    _dequantize,
    _sanitize_text,
    KLINE_MAX_ENTRIES,
    Artifact,
    Node,
)


class MemoryStore:
    """Persistent store for kline cache."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.data: Dict[str, Any] = {}
        self.load()

    # ============================================================
    # Persistence
    # ============================================================

    def load(self) -> None:
        if self.path.exists():
            try:
                with self.path.open("r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception:
                self.data = {}
        self.data.setdefault("klines", {})

    def save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        try:
            with tmp.open("w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False)
            tmp.replace(self.path)
        except Exception:
            pass

    # ============================================================
    # Kline Management
    # ============================================================

    def put_kline(self, sig: str, nodes: List[Node], artifacts: Dict[str, Artifact]) -> None:
        """Store a plan and its artifacts keyed by signature."""
        try:
            payload = {
                "sig": sig,
                "ts": time.time(),
                "nodes": [n.__dict__ for n in nodes],
                "artifacts": {k: v.__dict__ for k, v in artifacts.items()},
            }
            self.data["klines"][sig] = payload
            self.prune_klines()
            self.save()
        except Exception:
            pass

    def iter_klines(self):
        return self.data.get("klines", {}).items()

    def prune_klines(self, max_entries: int = KLINE_MAX_ENTRIES) -> None:
        ks = list(self.iter_klines())
        if len(ks) <= max_entries:
            return
        # sort by ts, penalize "bad" entries with effective aging
        ks.sort(key=lambda kv: kv[1].get("ts", 0.0) - kv[1].get("penalty", 0) * 3600.0)
        for sig, _ in ks[:-max_entries]:
            self.data["klines"].pop(sig, None)
        self.save()

    # ============================================================
    # Query / Similarity
    # ============================================================

    def query_klines(
        self, query: str, top_k: int = 5, min_sim: float = 0.3
    ) -> List[Tuple[str, float, Dict[str, Any]]]:
        """Find nearest klines by cosine similarity of embeddings."""
        qvec = _hash_embed(query)
        results = []
        for sig, payload in self.data.get("klines", {}).items():
            avec = _dequantize(payload.get("vec", []))
            sim = _cosine(qvec, avec)
            if sim >= min_sim:
                results.append((sig, sim, payload))
        results.sort(key=lambda t: t[1], reverse=True)
        return results[:top_k]

    def explain_recall(self, sig: str) -> None:
        """Debug hook - could print/log recall reasoning (stubbed here)."""
        # For production: hook into logging
        return

    def summarize_neighbors(
        self,
        neighbors: Sequence[Tuple[str, float, Dict[str, Any]]],
        char_budget: int = 500,
    ) -> str:
        """Summarize nearest neighbor artifacts into a hint string."""
        out: List[str] = []
        used = 0
        for _, sim, payload in neighbors:
            art_map = payload.get("artifacts", {})
            for node, art in art_map.items():
                text = _sanitize_text(art.get("content", ""))[:200]
                snippet = f"[sim={sim:.2f}] {node}: {text}"
                if used + len(snippet) > char_budget:
                    return "\n".join(out)
                out.append(snippet)
                used += len(snippet)
        return "\n".join(out)

    # ============================================================
    # Replay (fallback)
    # ============================================================

    def replay_kline(self, sig: str) -> List[Node]:
        """Replay stored nodes for a given signature (if available)."""
        payload = self.data.get("klines", {}).get(sig)
        if not payload:
            return []
        nodes_raw = payload.get("nodes", [])
        nodes = []
        for nd in nodes_raw:
            try:
                nodes.append(Node(**nd))
            except Exception:
                continue
        return nodes
