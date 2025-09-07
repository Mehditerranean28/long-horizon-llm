# -*- coding: utf-8 -*-
"""Classification & planning (CQAP or free-form) producing a DAG Plan."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional

from constants import PLANNER_PROMPT  # prompt strings live in constants.py
from bb_types import Classification, Contract, Node, Plan, TestSpec
from utils import fmt, first_json_object, safe_json_loads, slug

# Heuristics for classifier
_DELIVERABLE = re.compile(r"\b(design|architecture|spec|contract|roadmap|benchmark|compare|trade[- ]?offs?|rfc|plan|protocol|implementation|experiment|evaluate)\b", re.I)
_DEPENDENCY = re.compile(r"\b(after|before|then|depends|precede|follow|stage|phase|blocker|unblock)\b", re.I)
_BULLET = re.compile(r"(^\s*[-*]\s+|\d+\.\s+)", re.M)
_VERBS = re.compile(r"\b(\w+?)(?:ed|ing|e|ify|ise|ize)\b", re.I)


def classify_query(query: str) -> Classification:
    q = query.strip()
    wc = len(re.findall(r"\b\w+\b", q))
    score = (
        0.34 * min(1.0, len(_DELIVERABLE.findall(q)) / 3)
        + 0.26 * min(1.0, len(_DEPENDENCY.findall(q)) / 2)
        + 0.20 * min(1.0, len(_BULLET.findall(q)) / 3)
        + 0.10 * (1.0 if wc > 100 else 0.0)
        + 0.10 * min(1.0, len(_VERBS.findall(q)) / 14)
    )
    kind = "Atomic" if score < 0.25 else "Hybrid" if score < 0.55 else "Composite"
    return Classification(kind, round(score, 3))


async def classify_query_llm(query: str, llm, *, timeout: float = 15.0) -> Classification:
    if llm is None:
        return classify_query(query)
    schema_hint = '{ "kind":"Atomic|Hybrid|Composite","score":0..1,"rationale":"...","cues":{...} }'
    prompt = f"SYSTEM: CLASSIFY\nReturn ONLY JSON.\nSchema: {schema_hint}\nTask: Classify scope/complexity.\nQUERY: {query}"
    try:
        raw = await llm.complete(prompt, temperature=0.0, timeout=timeout)
        data = safe_json_loads(first_json_object(raw) or "{}"); data = data or {}
        kind = str(data.get("kind", "Atomic"))
        score = float(data.get("score", 0.5))
        return Classification(kind, score)
    except Exception:
        return classify_query(query)


def mk_contract(section: str, *, min_words: Optional[int] = None) -> Contract:
    tests = [TestSpec("nonempty", ""), TestSpec("header_present", section)]
    if min_words:
        tests.append(TestSpec("word_count_min", min_words))
    return Contract({"markdown_section": section}, tests)


def _parse_contract(obj: Mapping[str, Any], fallback_section: str) -> Contract:
    fmt_obj = dict(obj.get("format", {}))
    tests_in = obj.get("tests", [])
    tests = [
        TestSpec(str(t.get("kind", "")), t.get("arg", "")) for t in tests_in if t.get("kind") in {"nonempty", "regex", "contains", "word_count_min", "header_present"}
    ]
    fmt_obj.setdefault("markdown_section", fallback_section)
    if not any(t.kind == "nonempty" for t in tests):
        tests.append(TestSpec("nonempty", ""))
    if not any(t.kind == "header_present" for t in tests):
        tests.append(TestSpec("header_present", fmt_obj["markdown_section"]))
    return Contract(fmt_obj, tests)


def _validate_and_repair_plan(nodes: List[Node]) -> List[Node]:
    # Remove forward deps and cycles
    order = {n.name: i for i, n in enumerate(nodes)}
    for n in nodes:
        n.deps = [d for d in n.deps if d in order and order[d] < order[n.name]]

    by = {n.name: n for n in nodes}
    indeg = {n.name: 0 for n in nodes}
    succ = {n.name: [] for n in nodes}
    for n in nodes:
        for d in n.deps:
            indeg[n.name] += 1
            succ[d].append(n.name)

    from collections import deque

    q = deque([n for n in nodes if indeg[n.name] == 0])
    seen = 0
    while q:
        v = q.popleft()
        seen += 1
        for m in succ[v.name]:
            indeg[m] -= 1
            if indeg[m] == 0:
                q.append(by[m])

    if seen != len(nodes):
        for n in nodes:
            if indeg[n.name] > 0:
                n.deps = []
    return nodes


async def make_plan(planner_llm, query: str, cls: Classification) -> Plan:
    """Ask LLM for a plan; fallback to one-node plan if needed."""
    hints = ""
    raw = await planner_llm.complete(fmt(PLANNER_PROMPT, q=query, hints=hints), temperature=0.0, timeout=70.0)
    blob = first_json_object(raw) or "{}"
    data = safe_json_loads(blob) or {}
    raw_nodes = data.get("nodes", []) if isinstance(data, dict) else []
    nodes: List[Node] = []
    seen = set()
    for i, nd in enumerate(raw_nodes):
        name = slug(str(nd.get("name", f"step-{i+1}")), f"step-{i+1}")
        if name in seen:
            name = f"{name}-{i+1}"
        seen.add(name)
        deps = [str(d) for d in nd.get("deps", [])]
        tmpl = nd.get("tmpl", "GENERIC")
        role = str(nd.get("role", "adjunct")).lower()
        prompt_override = nd.get("prompt") or None
        contract_obj = nd.get("contract")
        contract = _parse_contract(contract_obj, tmpl) if contract_obj else mk_contract("Section", min_words=50)
        nodes.append(Node(name, tmpl, deps, contract, role, prompt_override))

    if not nodes:
        nodes = [Node("answer", "GENERIC", [], mk_contract("Answer", min_words=120), "backbone")]

    # Size trim by complexity
    if cls.kind == "Atomic":
        nodes = nodes[:1]
    elif cls.kind == "Hybrid":
        nodes = nodes[: max(2, min(4, len(nodes)))]
    else:
        nodes = nodes[: max(4, min(8, len(nodes)))]

    return Plan(nodes=_validate_and_repair_plan(nodes))
