# deterministic, single-file reasoning orchestrator

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import (
    Any,
    Awaitable,
    Callable,
    Dict,
    Iterable,
    List,
    Optional,
    Protocol,
    Tuple,
    TypedDict,
)

from .constants import (
    A_TEMPLATES,
    CRITIC_SCHEMA,
    DEFAULT_A_CLUSTER,
    DEFAULT_R_CLUSTER,
    FINAL_CRITIC_SCHEMA,
    FORBIDDEN_PHRASES,
    META_SCHEMA,
    MISSION_END,
    MISSION_START,
    PLAN_SCHEMA,
    R_TEMPLATES,
    SYSTEM_CONTRACT,
    cognitive_query_analysis_protocol,
    deep_analysis_protocol,
    precepts,
    fallback_queries,
    query_clusters,
    r_fallback_queries,
    r_query_clusters,
)


__all__ = [
    "LLM",
    "Judge",
    "TemplateSelector",
    "Artifact",
    "CriticReport",
    "MetaProtocol",
    "TacticSpec",
    "FrameSpec",
    "PlanSpec",
    "PromptKit",
    "AnalyzerPlanner",
    "DefaultSelector",
    "Executor",
    "Evaluator",
    "OrchestratorConfig",
    "PolicyRouter",
    "Orchestrator",
    "MockLLM",
]

try:
    from openai import AsyncOpenAI
except Exception:
    AsyncOpenAI = None

try:
    from jsonschema import Draft7Validator
except Exception:
    Draft7Validator = None

from .kern.src.kern.core import init_logging

try:
    init_logging()
except Exception as e:
    print(f"Failed to initialize production logging: {e}. Falling back to basic logging.")


# Use module name for clearer logs (was 'adapters' which was misleading here)
log = logging.getLogger("pipeline")
if not log.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    log.addHandler(handler)
log.setLevel(os.getenv("LOG_LEVEL", "INFO"))


class CriticReport(TypedDict):
    score: float
    summary: str
    missing_insight: str
    misstep: str
    bundles: Dict[str, Any]


class MetaProtocol(TypedDict, total=False):
    Goal: str
    Priority: str  # Low | Medium | High | Critical
    Subgoals: List[str]
    PrecisionLevel: Dict[str, Any]
    response_strategy: Dict[str, Any]
    Facts: List[str]


class TacticSpec(TypedDict):
    name: str
    description: str
    dependencies: List[str]
    expected_artifact_name: str


class FrameSpec(TypedDict):
    objective: str
    tactics: List[TacticSpec]


class PlanSpec(TypedDict):
    frames: List[FrameSpec]


@dataclass(slots=True)
class Artifact:
    key: str
    content: str
    meta: Dict[str, Any] = field(default_factory=dict)


class LLM(Protocol):
    async def complete(
        self,
        prompt: str,
        *,
        temperature: float = 0.0,
        timeout: float = 30.0,
    ) -> str: ...


class MockLLM:
    async def complete(self, prompt: str, *, temperature: float = 0.0, timeout: float = 30.0) -> str:
        await asyncio.sleep(0.002)
        if prompt.startswith("SYSTEM: META"):
            return json.dumps({
                "Goal": "Produce a robust, testable solution.",
                "Priority": "High",
                "PrecisionLevel": {"Required precision level": "high"},
                "response_strategy": {"recommendation": "Deep Analysis"},
                "Facts": [],
            })
        if prompt.startswith("SYSTEM: PLAN"):
            return json.dumps({
                "frames": [
                    {
                        "objective": "Foundations",
                        "tactics": [
                            {
                                "name": "t_rules",
                                "description": "Enumerate rules, assumptions, edge cases.",
                                "dependencies": [],
                                "expected_artifact_name": "rules.md",
                            },
                            {
                                "name": "t_algo",
                                "description": "Define algorithm and complexity.",
                                "dependencies": ["t_rules"],
                                "expected_artifact_name": "algorithm.md",
                            },
                        ],
                    },
                    {
                        "objective": "Solution",
                        "tactics": [
                            {
                                "name": "t_impl",
                                "description": "Provide outline + tests.",
                                "dependencies": ["t_algo"],
                                "expected_artifact_name": "impl.md",
                            },
                        ],
                    },
                ]
            })
        if "CRITIC" in prompt and "FINAL" not in prompt:
            return json.dumps({
                "score": 8.9,
                "summary": "Solid; add explicit base cases and DP state clarity.",
                "missing_insight": "Precise '*' collapse and '?' on empty input.",
                "misstep": "Assumed linear-time; clarify DP grid size.",
                "bundles": {"A": {"A6": {}}, "R": {"R2": {}, "R3": {}}},
            })
        if prompt.startswith("SYSTEM: FINAL_CRITIC"):
            return json.dumps({"score": 9.1, "summary": "ready", "missing_insight": "", "misstep": "", "bundles": {}})
        if prompt.startswith("THINK"):
            return "Candidate: crisp rules/approach; edge cases enumerated; complexity noted."
        if prompt.startswith("IMPROVE"):
            return "Improved: base cases, DP state (i,j), '*' collapse rule; tests outlined."
        if prompt.startswith("SYNTHESIZE"):
            return "Final: cohesive, actionable plan with algorithms, edge handling, and tests."
        return "noop"


class OpenAILLM:
    def __init__(self, api_key: str = os.getenv("OPENAI_API_KEY", ""), model: str = "gpt-4o"):
        if not AsyncOpenAI:
            raise ImportError("openai is not installed in this environment.")
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    async def complete(self, prompt: str, *, temperature: float = 0.0, timeout: float = 30.0) -> str:
        try:
            try:
                resp = await self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    timeout=timeout,  # newer clients
                )
            except TypeError:
                resp = await self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                )
            return (resp.choices[0].message.content or "").strip()
        except Exception:
            log.exception("OpenAI.complete failed")
            raise

def _first_json_object(text: str) -> Optional[str]:
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        c = text[i]
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
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def parse_json(text: str, req_keys: Iterable[str] = (), fallback: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    try:
        j = _first_json_object(text) or text
        j = j.strip()
        obj = json.loads(j)
        if not isinstance(obj, dict):
            raise ValueError("JSON root is not object")
        for k in req_keys:
            if k not in obj:
                raise KeyError(k)
        return obj
    except Exception:
        log.exception("parse_json failed")
        return fallback or {}

def _extract_mission(query: str) -> Tuple[str, Optional[Dict[str, Any]]]:
    """
    Pull a mission JSON out of the query if present, returning (clean_query, mission_obj|None).
    The cleaned query is the original with the mission block removed.
    """
    if not query:
        return query, None
    start = query.find(MISSION_START)
    end = query.find(MISSION_END)
    if start == -1 or end == -1 or end <= start:
        return query, None
    # slice out JSON payload
    payload = query[start + len(MISSION_START): end].strip()
    cleaned = (query[:start] + query[end + len(MISSION_END):]).strip()
    try:
        obj = json.loads(_first_json_object(payload) or payload)
        if isinstance(obj, dict):
            return cleaned or "", obj
    except Exception:
        log.warning("Mission block present but failed to parse JSON; ignoring.")
    return cleaned or "", None


def _mission_to_plan(mission: Dict[str, Any]) -> "PlanSpec":
    """
    Convert a normalized mission {query_context, Strategy:[{Objective, queries, tactics, ...}]} to PlanSpec.
    - Tactic 'name' is the first key in each tactic dict that starts with 't' (e.g., 't1').
    - expected_artifact_name is taken from 'expected_artifact' (fallback to '<name>.md').
    - dependencies:
        * if a dep matches a known tactic name, keep it as a tactic-dependency
        * else if it matches a known expected_artifact, rewrite to the corresponding tactic name
        * else keep as-is (non-tactic deps will be ignored by topo layering but still provided to prompts)
    """
    frames: List[FrameSpec] = []
    strat = mission.get("Strategy") or []
    if not isinstance(strat, list):
        return get_fallback_plan()

    # Map artifact filename -> tactic name for cross-frame dep rewriting
    artifact_to_tactic: Dict[str, str] = {}
    seen_tactic_names: set[str] = set()

    for stage in strat:
        if not isinstance(stage, dict):
            continue
        objective = str(stage.get("Objective") or stage.get("objective") or "Objective").strip()
        tacts_in = stage.get("tactics") or []
        tacts_out: List[TacticSpec] = []
        for t in tacts_in:
            if not isinstance(t, dict) or not t:
                continue
            # find the 't*' key holding the description (e.g., 't1', 't2', ...)
            desc_key = next((k for k in t.keys() if isinstance(k, str) and k.lower().startswith("t")), None)
            if not desc_key:
                # try id/description shape
                desc_key = (str(t.get("id") or "").strip() or "t1").lower()
            name = desc_key.strip()
            if name in seen_tactic_names:
                # ensure uniqueness if reused across frames
                name = f"{name}_{len(seen_tactic_names)+1}"
            seen_tactic_names.add(name)
            description = str(t.get(desc_key) or t.get("description") or "").strip() or f"Tactic {name}"
            exp_art = str(t.get("expected_artifact") or "").strip() or f"{name}.md"
            # rewrite deps to tactic names where possible
            raw_deps = t.get("dependencies") or []
            deps: List[str] = []
            for d in raw_deps if isinstance(raw_deps, list) else [raw_deps]:
                ds = str(d).strip()
                if not ds:
                    continue
                if ds in seen_tactic_names:
                    deps.append(ds)
                elif ds in artifact_to_tactic:
                    deps.append(artifact_to_tactic[ds])
                else:
                    deps.append(ds)  # keep as-is (non-tactic dep)
            # register artifact -> tactic mapping *after* building deps to avoid self-loops
            artifact_to_tactic[exp_art] = name
            # NOTE: TypedDicts are not constructors; use plain dicts.
            tacts_out.append({
                "name": name,
                "description": description,
                "dependencies": deps,
                "expected_artifact_name": exp_art,
            })  # type: ignore[typeddict-item]
        if tacts_out:
            frames.append({
                "objective": objective,
                "tactics": tacts_out,
            })  # type: ignore[typeddict-item]
    return {"frames": frames} if frames else get_fallback_plan()

def _hash(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]


def nontrivial(text: str) -> bool:
    t = (text or "").strip().lower()
    return len(t) >= 5 and t not in {"ok", "none", "n/a", "good", "fine"}


def sanitize(text: str) -> str:
    t = text or ""
    low = t.lower()
    for p in FORBIDDEN_PHRASES:
        if p in low:
            # Soften boilerplate without deleting content
            t = t.replace(p, "").strip()
            break
    return t.strip()


def _stable_union(base: List[str], extra: Iterable[str], allowed: Dict[str, Any]) -> List[str]:
    seen = set(base)
    out = list(base)
    for k in extra:
        if k in allowed and k not in seen:
            out.append(k)
            seen.add(k)
    return out


def topo_layers(tactics: List[TacticSpec]) -> List[List[TacticSpec]]:
    """
    Kahn's algorithm layered: returns list of levels (each can run concurrently).
    Raises on missing deps or cycles.
    """
    by_name: Dict[str, TacticSpec] = {t["name"]: t for t in tactics}
    indeg: Dict[str, int] = {t["name"]: 0 for t in tactics}
    adj: Dict[str, List[str]] = {t["name"]: [] for t in tactics}

    for t in tactics:
        for dep in t["dependencies"]:
            if dep not in by_name:
                continue
            adj[dep].append(t["name"])
            indeg[t["name"]] += 1

    layer: List[str] = [n for n, d in indeg.items() if d == 0]
    layers: List[List[TacticSpec]] = []
    seen = 0

    while layer:
        current = [by_name[n] for n in layer]
        current.sort(key=lambda t: t["name"])
        layers.append(current)
        next_layer: List[str] = []
        for n in sorted(layer):
            for m in sorted(adj[n]):
                indeg[m] -= 1
                if indeg[m] == 0:
                    next_layer.append(m)
        seen += len(layer)
        layer = next_layer

    if seen != len(tactics):
        raise ValueError("cycle detected in tactics")
    return layers


def _validate_schema(obj: Dict[str, Any], schema: Dict[str, Any]) -> Tuple[bool, str]:
    if Draft7Validator is None:
        return True, ""
    v = Draft7Validator(schema)
    errs = sorted(v.iter_errors(obj), key=lambda e: list(e.path))
    if not errs:
        return True, ""
    msgs = []
    for e in errs:
        path = "$" if not e.path else "$." + ".".join(map(str, e.path))
        msgs.append(f"{path}: {e.message}")
    return False, "\n".join(msgs)


class JSONEnforcer:
    def __init__(self, llm: LLM, *, max_retries: int = 2):
        self.llm = llm
        self.max_retries = max_retries

    async def run(
        self,
        phase: str,
        base_prompt: str,
        schema: Dict[str, Any],
        *,
        temperature: float = 0.0,
        timeout: float = 30.0,
    ) -> Dict[str, Any]:
        """
        Build a self-contained prompt with a top-level SYSTEM marker and embed the schema.
        Loop: parse → validate → repair.
        """
        attempts = 0
        last_text = ""
        last_err = ""
        schema_json = json.dumps(schema, ensure_ascii=False, sort_keys=True)
        header = f"SYSTEM: {phase}\n{SYSTEM_CONTRACT}\nSCHEMA:\n{schema_json}\n\nINSTRUCTIONS:\nReturn ONLY the JSON object.\n\n"
        prompt = f"{header}{base_prompt}"
        while attempts <= self.max_retries:
            attempts += 1
            t0 = time.perf_counter()
            text = await self.llm.complete(prompt, temperature=temperature, timeout=timeout)
            dt_ms = int((time.perf_counter() - t0) * 1000)
            last_text = text
            phash = _hash(prompt)
            log.info(
                "json-phase call phase=%s attempt=%d hash=%s len=%d dt_ms=%d",
                phase, attempts, phash, len(prompt), dt_ms
            )

            try:
                obj = parse_json(text, fallback=None)
            except Exception:
                obj = None

            if not isinstance(obj, dict):
                last_err = "Invalid JSON (parse failed)"
                prompt = f"{header}{base_prompt}\n\nREPAIR:\nError: {last_err}. Resend only valid JSON."
                continue

            ok, msg = _validate_schema(obj, schema)
            if ok:
                return obj
            last_err = f"Schema errors:\n{msg}"
            prompt = (
                f"{header}{base_prompt}\n\nREPAIR:\n"
                f"{last_err}\nFix only these issues. Resend the COMPLETE JSON, nothing else."
            )

        raise ValueError(f"JSONEnforcer failed after {self.max_retries} retries: {last_err}\nLast text:\n{last_text}")


@dataclass(slots=True)
class PromptKit:
    guidelines: str
    max_payload_chars: int = 8192
    a_store: Dict[str, Dict[str, Any]] = field(default_factory=lambda: A_TEMPLATES)
    r_store: Dict[str, Dict[str, Any]] = field(default_factory=lambda: R_TEMPLATES)

    def _pack(self, ak: List[str], rk: List[str]) -> str:
        """Pack selected templates; shrink deterministically until within budget."""
        def _dump(a: List[str], r: List[str]) -> str:
            return json.dumps(
                {
                    "A": {k: self.a_store.get(k, {}) for k in sorted(a)},
                    "R": {k: self.r_store.get(k, {}) for k in sorted(r)},
                },
                ensure_ascii=False,
                sort_keys=True,
                # Minify to keep more templates under MAX_PAYLOAD_CHARS
                separators=(",", ":"),
            )

        cur_ak, cur_rk = list(ak), list(rk)
        blob = _dump(cur_ak, cur_rk)
        while len(blob) > self.max_payload_chars and (len(cur_ak) > 1 or len(cur_rk) > 1):
            new_ak = cur_ak[: max(1, len(cur_ak) // 2)]
            new_rk = cur_rk[: max(1, len(cur_rk) // 2)]
            log.warning(
                "Template payload truncated (A:%d→%d, R:%d→%d)",
                len(cur_ak), len(new_ak), len(cur_rk), len(new_rk),
            )
            cur_ak, cur_rk = new_ak, new_rk
            blob = _dump(cur_ak, cur_rk)
        if len(blob) > self.max_payload_chars:
            raise ValueError("template pack exceeds max_payload_chars after truncation")
        return blob

    def meta(self, query: str) -> str:
        return (
            "META\n"
            "Return STRICT JSON with keys: Goal, Priority, PrecisionLevel, response_strategy, Facts.\n"
            f"GUIDELINES: {self.guidelines}\n"
            f"TARGET: {query}\n"
            f"PROTOCOL: {json.dumps(cognitive_query_analysis_protocol, sort_keys=True)}\n"
            f"DEEP: {json.dumps(deep_analysis_protocol, sort_keys=True)}\n"
        )

    def plan(self, query: str, meta: Dict[str, Any]) -> str:
        return (
            "PLAN\nReturn STRICT JSON: "
            '{"frames":[{"objective": str, '
            '"tactics":[{"name": str, "description": str, "dependencies": [str], "expected_artifact_name": str}]}]}\n'
            f"SUBGOALS: {json.dumps(meta.get('Subgoals', []), sort_keys=True)}\n"
            f"META: {json.dumps(meta, sort_keys=True)}\n"
            f"TARGET: {query}\n"
        )

    def _precept_guide(self, meta: MetaProtocol) -> str:
        tone = (meta.get("PrecisionLevel", {}) or {}).get("tone", "neutral")
        return f"Adapt tone: {tone}. Framework: {json.dumps(precepts['decision_framework'], sort_keys=True)}"

    def think(
        self,
        task_desc: str,
        ak: List[str],
        rk: List[str],
        deps: Dict[str, Artifact],
        meta: MetaProtocol,
        bundles: Optional[Dict[str, Any]] = None,
    ) -> str:
        deps_payload = {k: {"content": v.content, "meta": v.meta} for k, v in deps.items()}
        return (
            "THINK\nWrite a concise, implementable candidate (no JSON).\n"
            f"TASK: {task_desc}\n"
            f"TEMPLATES: {self._pack(ak, rk)}\n"
            f"DEPS: {json.dumps(deps_payload, sort_keys=True)}\n"
            f"PRECEPT: {self._precept_guide(meta)}\n"
            f"META: {json.dumps(meta, sort_keys=True)}\n"
            f"BUNDLES: {json.dumps(bundles or {}, sort_keys=True)}\n"
            f"GUIDELINES: {self.guidelines}\n"
        )

    def critic(self, candidate: str, ak: List[str], rk: List[str]) -> str:
        return (
            "CRITIC\nReturn STRICT JSON: {"
            '"score": float (0..10), "summary": str, "missing_insight": str, "misstep": str, "bundles": {"A":{}, "R":{}}}\n'
            "At least one of missing_insight/misstep MUST be non-trivial.\n"
            f"CANDIDATE: {candidate}\n"
            f"TEMPLATES: {self._pack(ak, rk)}\n"
        )

    def improve(self, candidate: str, report: CriticReport, ak: List[str], rk: List[str]) -> str:
        return (
            "IMPROVE\nRefine candidate by addressing CRITIC. Be terse and executable.\n"
            f"CRITIC: {json.dumps(report, sort_keys=True)}\n"
            f"CANDIDATE: {candidate}\n"
            f"TEMPLATES: {self._pack(ak, rk)}\n"
        )

    def synthesize(self, query: str, arts: List[Artifact]) -> str:
        body = "\n\n---\n\n".join(f"## {a.key}\n{a.content}" for a in arts)
        return (
            "SYNTHESIZE\nCombine selected artifacts into a cohesive, actionable answer. No fluff.\n"
            f"TARGET: {query}\n\n{body}\n"
        )

    def final_critic(self, answer: str) -> str:
        return (
            "FINAL_CRITIC\nReturn STRICT JSON: "
            '{"score": float (0..10), "summary": str, "missing_insight": str, "misstep": str, "bundles": {}}\n'
            f"ANSWER: {answer}\n"
        )

    def improve_final(self, answer: str, report: Dict[str, Any]) -> str:
        return (
            "IMPROVE_FINAL\nRefine the answer by addressing the CRITIC report. Ensure cohesion, actionability, "
            "and completeness without fluff.\n"
            f"CRITIC: {json.dumps(report, sort_keys=True)}\n"
            f"ANSWER: {answer}\n"
        )


def _clamp01(x: float) -> float:
    return 0.0 if x < 0.0 else 1.0 if x > 1.0 else x


def validate_meta(meta: Dict[str, Any]) -> MetaProtocol:
    def _lower(x: Any) -> str:
        return str(x or "").strip().lower()

    goal = str(meta.get("Goal") or "Answer")
    pri = _lower(meta.get("Priority") or "medium")
    pri_map = {"low": "Low", "medium": "Medium", "high": "High", "critical": "Critical"}
    priority = pri_map.get(pri, "Medium")
    precision = meta.get("PrecisionLevel") if isinstance(meta.get("PrecisionLevel"), dict) else {"Required precision level": "medium"}
    rs = meta.get("response_strategy") if isinstance(meta.get("response_strategy"), dict) else {}
    if not isinstance(rs.get("recommendation"), str) or not rs["recommendation"].strip():
        rs["recommendation"] = "Deep Analysis"
    facts = meta.get("Facts")
    facts = [str(f) for f in facts] if isinstance(facts, list) else []
    unknowns = meta.get("Unknowns", []) or []
    subgoals = [f"Explore {u}" for u in unknowns if nontrivial(u)]
    return {"Goal": goal, "Priority": priority, "Subgoals": subgoals, "PrecisionLevel": precision, "response_strategy": rs, "Facts": facts}


def get_fallback_plan() -> PlanSpec:
    return {
        "frames": [
            {
                "objective": "Foundations",
                "tactics": [
                    {
                        "name": "t_rules",
                        "description": "Enumerate rules, assumptions, and edge cases.",
                        "dependencies": [],
                        "expected_artifact_name": "rules.md",
                    }
                ],
            },
            {
                "objective": "Solution",
                "tactics": [
                    {
                        "name": "t_algo",
                        "description": "Define algorithm, transitions, complexity, failure modes.",
                        "dependencies": ["t_rules"],
                        "expected_artifact_name": "algorithm.md",
                    },
                    {
                        "name": "t_impl",
                        "description": "Provide implementable outline and core tests.",
                        "dependencies": ["t_algo"],
                        "expected_artifact_name": "impl.md",
                    },
                ],
            },
        ]
    }


def validate_plan(plan: Dict[str, Any], *, fallback: Optional[PlanSpec] = None) -> PlanSpec:
    fb = fallback or get_fallback_plan()
    frames = plan.get("frames")
    if not isinstance(frames, list) or not frames:
        return fb
    for fr in frames:
        all_tactics = set()
        all_artifacts = set()
        for inner_fr in frames:
            inner_tacts = inner_fr.get("tactics", [])
            for inner_t in inner_tacts:
                all_tactics.add(inner_t["name"])
                all_artifacts.add(inner_t["expected_artifact_name"])
        if not isinstance(fr, dict) or not isinstance(fr.get("objective"), str):
            return fb
        tacts = fr.get("tactics")
        if not isinstance(tacts, list) or not tacts:
            return fb
        names = set()
        for t in tacts:
            if not isinstance(t, dict):
                return fb
            for req in ("name", "description", "dependencies", "expected_artifact_name"):
                if req not in t:
                    return fb
            if t["name"] in names:
                return fb
            names.add(t["name"])
            if not isinstance(t["dependencies"], list):
                return fb
    try:
        for fr in frames:
            topo_layers(fr["tactics"])
    except Exception:
        return fb
    return plan


def _sanity_check_registry(name: str, reg: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    ok: Dict[str, Dict[str, Any]] = {}
    for k, v in (reg or {}).items():
        if isinstance(k, str) and isinstance(v, (dict, str)):
            ok[k] = v if isinstance(v, dict) else {"Q": v}
        else:
            log.warning("%s: dropping invalid entry %r", name, k)
    return ok


def _prune_clusters(clusters: Dict[str, List[str]], valid_keys: set, *, label: str) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    for cname, ids in (clusters or {}).items():
        pruned = [k for k in ids if k in valid_keys]
        if pruned:
            out[cname] = pruned
        else:
            log.warning("%s cluster empty after prune: %s", label, cname)
    return out


@dataclass(slots=True)
class AnalyzerPlanner:
    llm: LLM
    kit: PromptKit
    json_enforcer: JSONEnforcer

    async def analyze_and_plan(self, query: str) -> Tuple[MetaProtocol, PlanSpec]:
        meta_prompt = self.kit.meta(query)
        meta_raw = await self.json_enforcer.run("META", meta_prompt, META_SCHEMA, temperature=0.0)
        meta = validate_meta(meta_raw)
        plan_prompt = self.kit.plan(query, meta)
        plan_raw = await self.json_enforcer.run("PLAN", plan_prompt, PLAN_SCHEMA, temperature=0.0)
        plan = validate_plan(plan_raw, fallback=get_fallback_plan())
        return meta, plan


class TemplateSelector(Protocol):
    def select(self, meta: MetaProtocol, *, top_k_a: int, top_k_r: int) -> Tuple[List[str], List[str]]: ...


@dataclass(slots=True)
class DefaultSelector:
    a_keys: List[str]
    r_keys: List[str]

    def select(self, meta: MetaProtocol, *, top_k_a: int, top_k_r: int) -> Tuple[List[str], List[str]]:
        rec = (meta.get("response_strategy", {}) or {}).get("recommendation", "Deep Analysis").lower()
        pri = (meta.get("Priority", "Medium") or "Medium").lower()
        ka = top_k_a + (2 if "deep" in rec else 0)
        kr = top_k_r + (3 if pri in ("high", "critical") else 0)
        return sorted(self.a_keys)[:ka], sorted(self.r_keys)[:kr]


@dataclass(slots=True)
class PolicyRouter(TemplateSelector):
    a_clusters: Dict[str, List[str]]
    r_clusters: Dict[str, List[str]]
    a_fallback: List[str]
    r_fallback: List[str]

    def select(self, meta: MetaProtocol, *, top_k_a: int, top_k_r: int) -> Tuple[List[str], List[str]]:
        pri = (meta.get("Priority", "Medium") or "Medium").lower()
        pl = meta.get("PrecisionLevel", {}) or {}
        prec = (pl.get("level") or pl.get("Required precision level", "medium")).lower()
        rec = (meta.get("response_strategy", {}) or {}).get("recommendation", "Deep Analysis").lower()

        a_cluster_key = DEFAULT_A_CLUSTER if "high" in prec else ("strategic_vision" if "deep" in rec else DEFAULT_A_CLUSTER)
        r_cluster_key = DEFAULT_R_CLUSTER if pri in ("high", "critical") else ("PE" if "exploratory" in rec else DEFAULT_R_CLUSTER)

        base_ak = self.a_clusters.get(a_cluster_key, self.a_fallback)
        base_rk = self.r_clusters.get(r_cluster_key, self.r_fallback)

        ak = sorted(base_ak)[:top_k_a]
        rk = sorted(base_rk)[:top_k_r]
        return ak, rk


@dataclass(slots=True)
class Executor:
    llm: LLM
    kit: PromptKit
    selector: TemplateSelector
    json_enforcer: JSONEnforcer
    min_rounds: int = 2
    max_rounds: int = 6
    high_score_stop: float = 8.8
    low_score_extend: float = 5.5
    concurrent: int = 8

    async def _call_text(self, prompt: str, **kw) -> str:
        phash = _hash(prompt)
        t0 = time.perf_counter()
        text = await self.llm.complete(prompt, **kw)
        dt_ms = int((time.perf_counter() - t0) * 1000)
        log.info("llm-call phase=text hash=%s len=%d dt_ms=%d", phash, len(prompt), dt_ms)
        return sanitize(text)

    def _validate_critic(self, obj: Dict[str, Any]) -> CriticReport:
        try:
            score = float(obj.get("score", 0.0))
        except Exception:
            score = 0.0
        if not (0.0 <= score <= 10.0):
            score = 6.0
        missing = str(obj.get("missing_insight", "") or "")
        misstep = str(obj.get("misstep", "") or "")
        if not (nontrivial(missing) or nontrivial(misstep)):
            if score > 6.0:
                log.warning("Critic lacks feedback; capping score from %.2f to 6.0", score)
            score = min(score, 6.0)
        return CriticReport(
            score=score,
            summary=str(obj.get("summary", "")),
            missing_insight=missing,
            misstep=misstep,
            bundles=dict(obj.get("bundles", {}) or {}),
        )

    async def _run_tactic(
        self,
        frame: FrameSpec,
        tactic: TacticSpec,
        meta: MetaProtocol,
        select: Tuple[List[str], List[str]],
        fetch_deps: Callable[[List[str]], Awaitable[Dict[str, Artifact]]],
    ) -> Artifact:
        ak, rk = select
        deps = await fetch_deps(tactic["dependencies"])

        candidate = await self._call_text(self.kit.think(
            tactic["description"], ak, rk, deps, meta, bundles=None
        ), temperature=0.2)

        rounds = 0
        last_score = 0.0
        last_bundles: Dict[str, Any] = {}
        no_improve_streak = 0

        while rounds < self.max_rounds:
            crit_prompt = self.kit.critic(candidate, ak, rk)
            crit_obj = await self.json_enforcer.run("CRITIC", crit_prompt, CRITIC_SCHEMA, temperature=0.0)
            report = self._validate_critic(crit_obj)

            a_bundles = list(report["bundles"].get("A", {}).keys())
            r_bundles = list(report["bundles"].get("R", {}).keys())
            ak = _stable_union(ak, a_bundles, self.kit.a_store)
            rk = _stable_union(rk, r_bundles, self.kit.r_store)
            ak, rk = sorted(ak), sorted(rk)
            last_bundles = report["bundles"]

            prev_score = last_score
            last_score = report["score"]
            if rounds >= 1 and last_score - prev_score < 0.2:
                no_improve_streak += 1
            else:
                no_improve_streak = 0

            candidate = await self._call_text(self.kit.improve(candidate, report, ak, rk), temperature=0.1)
            rounds += 1

            if rounds >= self.max_rounds:
                break
            if last_score >= 10.0:
                break
            if rounds >= self.min_rounds and last_score >= self.high_score_stop:
                break
            if no_improve_streak >= 2 and rounds >= self.min_rounds:
                break
            if last_score < self.low_score_extend and rounds < self.max_rounds:
                continue
            if rounds >= self.min_rounds:
                break

        key = f"{frame['objective']}/{tactic['expected_artifact_name']}"
        return Artifact(
            key=key,
            content=candidate,
            meta={
                "rounds": rounds,
                "last_score": last_score,
                "tactic": tactic["name"],
                "bundles": last_bundles,
                "parents": tactic["dependencies"],
            },
        )

    async def execute_frame(
        self,
        meta: MetaProtocol,
        frame: FrameSpec,
        fetch_deps: Callable[[List[str]], Awaitable[Dict[str, Artifact]]],
        *,
        top_k_a: int = 5,
        top_k_r: int = 7,
    ) -> List[Artifact]:
        ak, rk = self.selector.select(meta, top_k_a=top_k_a, top_k_r=top_k_r)
        artifacts: List[Artifact] = []
        sem = asyncio.Semaphore(self.concurrent)

        for layer in topo_layers(frame["tactics"]):
            async def run_one(t: TacticSpec) -> Artifact:
                async with sem:
                    return await self._run_tactic(frame, t, meta, (ak, rk), fetch_deps)

            layer_results = await asyncio.gather(*(run_one(t) for t in layer))
            artifacts.extend(layer_results)
        return artifacts


class Judge(Protocol):
    name: str

    async def evaluate(self, artifact: Artifact) -> Tuple[str, float]: ...


@dataclass(slots=True)
class UtilityJudge:
    name: str = "utility"

    async def evaluate(self, artifact: Artifact) -> Tuple[str, float]:
        last = float(artifact.meta.get("last_score", 7.0))
        rounds = int(artifact.meta.get("rounds", 2))
        util = max(0.0, min(1.0, (last / 10.0) * (1.0 - 0.05 * max(0, rounds - 3))))
        vote = "accept" if util >= 0.55 else "reject"
        return (vote, util)


@dataclass(slots=True)
class Evaluator:
    llm: LLM
    kit: PromptKit
    json_enforcer: JSONEnforcer
    judges: List[Judge]
    select_k: int = 3
    final_min_score: float = 8.5

    async def assess(self, arts: List[Artifact]) -> List[Artifact]:
        heap: List[Tuple[float, Artifact]] = []
        for a in arts:
            results = await asyncio.gather(*(j.evaluate(a) for j in self.judges))
            accepts = sum(1 for v, _ in results if v == "accept")
            util = sum(u for _, u in results) / max(1, len(results))
            majority = accepts >= ((len(self.judges) // 2) + 1) if len(self.judges) > 1 else (accepts == 1)
            if majority:
                bonus = 0.02 * float(a.meta.get("last_score", 0.0))
                heap.append((-(util + bonus), a))
        heap.sort(key=lambda x: x[0])
        return [a for _, a in heap[: self.select_k]]

    async def synthesize(self, query: str, selected: List[Artifact]) -> str:
        return await self.llm.complete(self.kit.synthesize(query, selected))

    async def polish(self, answer: str) -> str:
        crit_obj = await self.json_enforcer.run("FINAL_CRITIC", self.kit.final_critic(answer), FINAL_CRITIC_SCHEMA)
        try:
            score = min(10.0, max(0.0, float(crit_obj.get("score", 0.0))))
        except Exception:
            score = 0.0
        if score >= self.final_min_score:
            return answer
        patched = await self.llm.complete(self.kit.improve_final(answer, crit_obj))
        return sanitize(patched)


@dataclass(slots=True)
class OrchestratorConfig:
    min_rounds: int = int(os.getenv("MIN_ROUNDS", "2"))
    max_rounds: int = int(os.getenv("MAX_ROUNDS", "6"))
    high_score_stop: float = float(os.getenv("HIGH_SCORE_STOP", "8.8"))
    low_score_extend: float = float(os.getenv("LOW_SCORE_EXTEND", "5.5"))
    concurrent: int = int(os.getenv("CONCURRENT_PER_LAYER", "8"))
    select_k: int = int(os.getenv("SELECT_TOP_K", "3"))
    final_min_score: float = float(os.getenv("FINAL_MIN_SCORE", "8.5"))
    use_policy_router: bool = os.getenv("USE_POLICY_ROUTER", "true").strip().lower() == "true"
    max_payload_chars: int = int(os.getenv("MAX_PAYLOAD_CHARS", "8192"))


@dataclass(slots=True)
class Orchestrator:
    llm: LLM
    guidelines: str
    judges: List[Judge] = field(default_factory=lambda: [UtilityJudge()])
    selector: Optional[TemplateSelector] = None
    config: OrchestratorConfig = field(default_factory=OrchestratorConfig)
    a_keys: List[str] = field(default_factory=lambda: list(A_TEMPLATES.keys()))
    r_keys: List[str] = field(default_factory=lambda: list(R_TEMPLATES.keys()))

    def _build(self) -> Tuple[AnalyzerPlanner, Executor, Evaluator, PromptKit, Tuple[Dict[str, List[str]], Dict[str, List[str]]]]:
        a_store = _sanity_check_registry("A_TEMPLATES", A_TEMPLATES)
        r_store = _sanity_check_registry("R_TEMPLATES", R_TEMPLATES)

        a_clusters = _prune_clusters(query_clusters, set(a_store.keys()), label="A")
        r_clusters = _prune_clusters(r_query_clusters, set(r_store.keys()), label="R")
        a_clusters = json.loads(json.dumps(a_clusters))
        r_clusters = json.loads(json.dumps(r_clusters))

        kit = PromptKit(self.guidelines, max_payload_chars=self.config.max_payload_chars, a_store=a_store, r_store=r_store)
        json_enforcer = JSONEnforcer(self.llm, max_retries=2)

        anaplanner = AnalyzerPlanner(self.llm, kit, json_enforcer)
        selector = self.selector or (
            PolicyRouter(a_clusters=a_clusters, r_clusters=r_clusters, a_fallback=fallback_queries, r_fallback=r_fallback_queries)
            if self.config.use_policy_router
            else DefaultSelector(sorted(list(a_store.keys())), sorted(list(r_store.keys())))
        )
        executor = Executor(
            llm=self.llm,
            kit=kit,
            selector=selector,
            json_enforcer=json_enforcer,
            min_rounds=self.config.min_rounds,
            max_rounds=self.config.max_rounds,
            high_score_stop=self.config.high_score_stop,
            low_score_extend=self.config.low_score_extend,
            concurrent=self.config.concurrent,
        )
        evaluator = Evaluator(
            llm=self.llm,
            kit=kit,
            json_enforcer=json_enforcer,
            judges=self.judges,
            select_k=self.config.select_k,
            final_min_score=self.config.final_min_score,
        )
        return anaplanner, executor, evaluator, kit, (a_clusters, r_clusters)

    async def run(self, query: str) -> Dict[str, Any]:
        if not query or not query.strip():
            raise ValueError("empty query")

        anaplanner, executor, evaluator, _kit, (a_clusters, r_clusters) = self._build()
        # Extract mission (if present), and plan accordingly
        clean_query, mission = _extract_mission(query)
        # Prefer textual query; if query was only a mission block, fall back to mission.query_context
        target_query = clean_query.strip() if clean_query else ""
        if not target_query and mission:
            qc = str(mission.get("query_context", "")).strip()
            target_query = qc or ""
        # As a last resort, keep original (should rarely happen)
        if not target_query:
            target_query = query.strip()

        meta, auto_plan = await anaplanner.analyze_and_plan(target_query)
        plan = _mission_to_plan(mission) if mission else auto_plan

        produced_by_tactic: Dict[str, Artifact] = {}
        produced_by_key: Dict[str, Artifact] = {}

        async def fetch_deps(dep_names: List[str]) -> Dict[str, Artifact]:
            out: Dict[str, Artifact] = {}
            for d in dep_names:
                # 1) direct tactic name -> artifact
                art = produced_by_tactic.get(d)
                # 2) full key match (objective/filename)
                if not art:
                    art = produced_by_key.get(d)
                # 3) filename-only match as a convenience (e.g., "Problem_Brief.md")
                if not art and d:
                    # prefer most recent match if multiple frames produced same filename
                    for k in reversed(list(produced_by_key.keys())):
                        if k.endswith("/" + d) or k.split("/")[-1] == d:
                            art = produced_by_key[k]
                            break
                if art:
                    out[d] = art
            return out

        all_artifacts: List[Artifact] = []
        for frame in plan["frames"]:
            artifacts = await executor.execute_frame(meta, frame, fetch_deps, top_k_a=6, top_k_r=8)
            for a in artifacts:
                all_artifacts.append(a)
                produced_by_key[a.key] = a
                tname = a.meta.get("tactic")
                if isinstance(tname, str):
                    produced_by_tactic[tname] = a

        all_bundles = {"A": set(), "R": set()}
        for a in all_artifacts:
            bundles = a.meta.get("bundles", {})
            for cat, items in bundles.items():
                if cat == "A":
                    all_bundles["A"].update(items.keys())
                elif cat == "R":
                    all_bundles["R"].update(items.keys())
        for cluster in a_clusters.values():
            cluster.extend([k for k in sorted(all_bundles["A"]) if k not in cluster and k in A_TEMPLATES])
        for cluster in r_clusters.values():
            cluster.extend([k for k in sorted(all_bundles["R"]) if k not in cluster and k in R_TEMPLATES])
        log.info("Clusters evolved: %d added", len(all_bundles["A"]) + len(all_bundles["R"]))

        selected = await evaluator.assess(all_artifacts)
        chosen = selected or all_artifacts[:1]
        final = await evaluator.synthesize(target_query, chosen)
        for _ in range(3):
            new_final = await evaluator.polish(final)
            if new_final == final:
                break
            final = new_final

        return {
            "meta": meta,
            "plan": plan,
            "artifacts": [a.key for a in all_artifacts],
            "selected": [a.key for a in chosen],
            "final": final,
        }

    async def run_stream(self, query: str):
        """Yield milestone dictionaries during :meth:`run` execution.

        Each yielded item describes a milestone: ``meta`` analysis, ``plan``
        selection, every produced ``artifact``, the final ``selected`` set and
        the ultimate ``final`` answer.  Intended for streaming over HTTP as
        newline-delimited JSON.
        """

        if not query or not query.strip():
            raise ValueError("empty query")

        anaplanner, executor, evaluator, _kit, (a_clusters, r_clusters) = self._build()
        clean_query, mission = _extract_mission(query)
        target_query = clean_query.strip() if clean_query else ""
        if not target_query and mission:
            qc = str(mission.get("query_context", "")).strip()
            target_query = qc or ""
        if not target_query:
            target_query = query.strip()

        meta, auto_plan = await anaplanner.analyze_and_plan(target_query)
        plan = _mission_to_plan(mission) if mission else auto_plan
        yield {"type": "meta", "data": meta}
        yield {"type": "plan", "data": plan}

        produced_by_tactic: Dict[str, Artifact] = {}
        produced_by_key: Dict[str, Artifact] = {}

        async def fetch_deps(dep_names: List[str]) -> Dict[str, Artifact]:
            out: Dict[str, Artifact] = {}
            for d in dep_names:
                art = produced_by_tactic.get(d) or produced_by_key.get(d)
                if not art and d:
                    for k in reversed(list(produced_by_key.keys())):
                        if k.endswith("/" + d) or k.split("/")[-1] == d:
                            art = produced_by_key[k]
                            break
                if art:
                    out[d] = art
            return out

        all_artifacts: List[Artifact] = []
        for frame in plan["frames"]:
            artifacts = await executor.execute_frame(meta, frame, fetch_deps, top_k_a=6, top_k_r=8)
            for a in artifacts:
                all_artifacts.append(a)
                produced_by_key[a.key] = a
                tname = a.meta.get("tactic")
                if isinstance(tname, str):
                    produced_by_tactic[tname] = a
                yield {"type": "artifact", "key": a.key, "meta": a.meta}

        selected = await evaluator.assess(all_artifacts)
        yield {"type": "selected", "artifacts": [a.key for a in selected]}
        chosen = selected or all_artifacts[:1]
        final = await evaluator.synthesize(target_query, chosen)
        for _ in range(3):
            new_final = await evaluator.polish(final)
            if new_final == final:
                break
            final = new_final
        yield {"type": "final", "text": final}


async def _demo(query: str) -> None:
    orch = Orchestrator(
        llm=MockLLM(),
        guidelines="Be terse, precise, and fully actionable. Prefer explicit base conditions, tests, and complexity.",
        judges=[UtilityJudge()],
    )
    result = await orch.run(query)
    log.info("=== FINAL ===")
    log.info(result["final"])
    log.info("\n=== SELECTED ARTIFACTS ===")
    for k in result["selected"]:
        log.info("- %s", k)


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


def main() -> None:
    print(_OCTO)
    parser = argparse.ArgumentParser(description="Reasoning pipeline demo (ultra-hardened)")
    parser.add_argument("query", nargs="?", default="Design robust wildcard matcher for '?' and '*'.")
    args = parser.parse_args()
    asyncio.run(_demo(args.query))


if __name__ == "__main__":
    main()
