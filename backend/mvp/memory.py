# -*- coding: utf-8 -*-
"""Persistent memory: judges, klines (query memory), beliefs, self-models."""

from __future__ import annotations

import hashlib
import json
import time
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from config import (
    CLUSTER_LINK_WEIGHT,
    CLUSTER_MIN_SIM,
    KLINE_EMBED_DIM,
    KLINE_MAX_ENTRIES,
)
from utils import AUDIT, LOG, cosine, dequantize, hash_embed, quantize


class MemoryStore:
    """JSON-backed store. Safe for MVP; switch to DB later."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.data: Dict[str, Any] = {}
        self._io_lock = threading.RLock()
        self._load()
        LOG.debug("MemoryStore initialized at %s", self.path)

    # ------------------------------- I/O -------------------------------------

    def _load(self) -> None:
        if self.path.exists():
            try:
                txt = self.path.read_text(encoding="utf-8")
                data = json.loads(txt)
                self.data = data if isinstance(data, dict) else {}
                LOG.info("Loaded memory from %s", self.path)
            except Exception as e:
                LOG.error("Failed to load memory file %s: %s", self.path, e)
                self.data = {}
        if not self.data:
            self.data = {"judges": {}, "patch_stats": {}, "klines": {}, "beliefs": {}, "self_models": {}}
            LOG.debug("Initialized new memory store")

    def save(self) -> None:
        with self._io_lock:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(self.path)
        LOG.debug("Saved memory to %s", self.path)

    # ----------------------------- Judges ------------------------------------

    def bump_judge(self, judge: str, delta: float) -> None:
        j = self.data["judges"].setdefault(judge, {"weight": 1.0})
        j["weight"] = max(0.1, min(3.0, j["weight"] + delta))
        LOG.debug("Judge %s weight adjusted by %.3f -> %.3f", judge, delta, j["weight"])

    def get_judge_weight(self, judge: str) -> float:
        return self.data.get("judges", {}).get(judge, {}).get("weight", 1.0)

    # ----------------------------- Patches -----------------------------------

    def record_patch(self, kind: str, ok: bool) -> None:
        s = self.data["patch_stats"].setdefault(kind, {"ok": 0, "fail": 0})
        s["ok" if ok else "fail"] += 1
        LOG.debug("Patch %s recorded: %s", kind, "ok" if ok else "fail")

    # ----------------------------- Beliefs -----------------------------------

    @staticmethod
    def _belief_id(claim: Mapping[str, Any]) -> str:
        sub = str(claim.get("subject", "")).strip().lower()
        pred = str(claim.get("predicate", "")).strip().lower()
        obj = claim.get("object")
        pol = "1" if claim.get("polarity", True) else "0"
        raw = f"{sub}|{pred}|{obj}|{pol}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    def add_beliefs(self, *, sig: str, node: str, run_id: str, claims: Sequence[Mapping[str, Any]]) -> None:
        now = time.time()
        beliefs = self.data["beliefs"]
        for c in claims:
            bid = self._belief_id(c)
            b = beliefs.get(bid, {})
            conf = max(float(b.get("confidence", 0.0)), float(c.get("confidence", 0.5)))
            prov = b.get("provenance", []) + [{"sig": sig, "node": node, "run_id": run_id, "ts": now}]
            beliefs[bid] = {
                "id": bid,
                "subject": c.get("subject", b.get("subject")),
                "predicate": c.get("predicate", b.get("predicate")),
                "object": c.get("object", b.get("object")),
                "polarity": c.get("polarity", b.get("polarity", True)),
                "confidence": conf,
                "provenance": prov,
            }
        self.save()
        LOG.info("Added %d beliefs for sig=%s node=%s", len(claims), sig, node)

    def beliefs_for_sig(self, sig: str) -> Dict[str, Any]:
        return {bid: b for bid, b in self.data.get("beliefs", {}).items() if any(p.get("sig") == sig for p in b.get("provenance", []))}

    def detect_belief_conflicts(self, *, scope_sig: Optional[str] = None) -> List[Tuple[str, str, Dict[str, Any]]]:
        LOG.debug("Detecting belief conflicts for scope %s", scope_sig)
        by_key: Dict[Tuple[str, str, Any], Dict[str, Any]] = {}
        conflicts: List[Tuple[str, str, Dict[str, Any]]] = []
        for bid, b in self.data.get("beliefs", {}).items():
            if scope_sig and not any(p.get("sig") == scope_sig for p in b.get("provenance", [])):
                continue
            k = (str(b.get("subject", "")).lower(), str(b.get("predicate", "")).lower(), b.get("object"))
            other = by_key.get(k)
            if other and other.get("polarity") != b.get("polarity"):
                conflicts.append((other["id"], bid, {"key": k}))
            else:
                by_key[k] = {"id": bid, "polarity": b.get("polarity")}
        LOG.info("Detected %d belief conflicts", len(conflicts))
        return conflicts

    # ---------------------------- K-Lines Memory ------------------------------

    def get_kline(self, sig: str) -> Optional[Dict[str, Any]]:
        return self.data.get("klines", {}).get(sig)

    def put_kline(self, sig: str, payload: Dict[str, Any]) -> None:
        self.data["klines"][sig] = payload
        self.save()
        LOG.debug("Stored kline %s", sig)

    def iter_klines(self) -> Iterable[Tuple[str, Dict[str, Any]]]:
        return self.data.get("klines", {}).items()

    def _ensure_entry_embedding(self, entry: Dict[str, Any], dim: int = KLINE_EMBED_DIM) -> None:
        if "embedding" in entry and len(entry["embedding"]) == dim:
            return
        if "embedding_q" in entry:
            entry["embedding"] = dequantize(entry["embedding_q"])
            if len(entry["embedding"]) == dim:
                return
        q = entry.get("query", "")
        if q:
            entry["embedding"] = hash_embed(q, dim)

    def form_clusters(self, min_sim: float = CLUSTER_MIN_SIM) -> None:
        all_entries = list(self.iter_klines())
        for i, (sig_a, ent_a) in enumerate(all_entries):
            for sig_b, ent_b in all_entries[i + 1 :]:
                self._ensure_entry_embedding(ent_a)
                self._ensure_entry_embedding(ent_b)
                sim = cosine(ent_a.get("embedding", []), ent_b.get("embedding", []))
                if sim >= min_sim:
                    self.link_klines(sig_a, sig_b, sim * CLUSTER_LINK_WEIGHT)

    def prune_klines(self, max_entries: int = KLINE_MAX_ENTRIES) -> None:
        ks = list(self.iter_klines())
        if len(ks) > max_entries:
            ks.sort(key=lambda kv: kv[1].get("ts", 0.0))
            for sig, _ in ks[: len(ks) - max_entries]:
                self.data["klines"].pop(sig, None)
            self.save()
            LOG.info("Pruned kline store to %d entries", max_entries)

    def upsert_kline(
        self,
        sig: str,
        payload: Dict[str, Any],
        *,
        query: Optional[str] = None,
        classification: Optional[Dict[str, Any]] = None,
    ) -> None:
        entry = self.data["klines"].get(sig, {})
        entry.update(payload)
        if query:
            entry["embedding_q"] = quantize(hash_embed(query, KLINE_EMBED_DIM))
            entry["query"] = query
        if classification:
            entry["classification"] = classification
        entry["ts"] = time.time()
        self.data["klines"][sig] = entry
        self.form_clusters()
        self.prune_klines()
        self.save()
        LOG.info("Upserted kline %s", sig)

    def penalize_kline(self, sig: str) -> None:
        entry = self.get_kline(sig)
        if entry:
            entry["penalty"] = entry.get("penalty", 0) + 1
            self.put_kline(sig, entry)
            LOG.info("Penalized kline %s", sig)

    def link_klines(self, sig_a: str, sig_b: str, weight: float) -> None:
        for x, y in ((sig_a, sig_b), (sig_b, sig_a)):
            entry = self.get_kline(x) or {}
            links = entry.setdefault("links", {})
            links[y] = max(links.get(y, 0), weight)
            self.put_kline(x, entry)
        LOG.debug("Linked klines %s <-> %s w=%.3f", sig_a, sig_b, weight)

    def cluster_retrieve(self, sig: str, max_neighbors: int = 5) -> List[Tuple[str, float]]:
        entry = self.get_kline(sig) or {}
        links = entry.get("links", {})
        neigh = sorted(links.items(), key=lambda kv: kv[1], reverse=True)[:max_neighbors]
        for nsig, w in neigh:
            AUDIT.info(json.dumps({"cluster_recall": {"source": sig, "neighbor": nsig, "weight": w}}, ensure_ascii=False))
        return neigh

    def explain_recall(self, sig: str) -> Dict[str, Any]:
        entry = self.get_kline(sig) or {}
        info = {
            "query": entry.get("query"),
            "classification": entry.get("classification"),
            "ts": entry.get("ts"),
            "penalty": entry.get("penalty", 0),
            "links": entry.get("links", {}),
        }
        AUDIT.info(json.dumps({"explain_recall": {"sig": sig, "info": info}}, ensure_ascii=False))
        return info

    # ---------------------------- Self-Model ----------------------------------

    def get_self_model(self, sig: str) -> Dict[str, Any]:
        return self.data.setdefault("self_models", {}).get(sig, {})

    def store_self_model(self, sig: str, model: Mapping[str, Any]) -> None:
        sm = self.data.setdefault("self_models", {})
        sm[sig] = dict(model)
        self.save()
