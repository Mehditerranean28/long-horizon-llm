# constants.py

# === Planner ===
# (planner prompt unchanged)
PLANNER_PROMPT = (
    "You are a decomposition engine.\n"
    "Return STRICT JSON:\n"
    "{\"nodes\":["
    "{\"name\":str,"
    "\"tmpl\":str,"          # template ID, e.g. R3_VALIDATION, A5_PATTERNS, GENERIC
    "\"deps\":[str],"
    "\"role\":\"backbone\"|\"adjunct\""
    "]}\n"
    "Rules:\n"
    "- names unique in [a-z0-9_-]\n"
    "- deps only to previously listed nodes\n"
    "- Composite: 4-8 nodes; Hybrid: 2-4; Atomic: 1\n"
    "- tmpl must be a known template ID (e.g. R3_VALIDATION, A5_PATTERNS, GENERIC)\n"
    "- Do NOT emit prompt text or contracts; those are provided by code\n"
    "QUERY:\n"
    "{q}\n"
)

from .prompts.cognitive_templates import (
    A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12, A13, A14, A15, A16, A17, A18, A19, A20, A21, A22, A23,
)

from .prompts.reasoning_templates import (
    R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21,
)

from typing import Any, Dict, List

# === Pipeline markers and defaults ===
MISSION_START = "<<<MISSION_JSON>>>"
MISSION_END = "<<<END_MISSION>>>"

DEFAULT_A_CLUSTER = "foundational_analysis"
DEFAULT_R_CLUSTER = "FG"

query_clusters = {
    "foundational_analysis": ["A1", "A2", "A4", "A6", "A9", "A15"],
    "comparative_analysis": ["A3", "A5", "A9", "A10", "A13"],
    "mitigation_and_risks": ["A6", "A14", "A16", "A19"],
    "strategic_vision": ["A7", "A8", "A18", "A22", "A23"],
    "ethical_and_stakeholder_focus": ["A11", "A20", "A21"],
}

fallback_queries = ["A7", "A1", "A5", "A9"]

r_query_clusters = {
    "FG": ["R1", "R2", "R4"],
    "LC": ["R3", "R17", "R9"],
    "PE": ["R5", "R6", "R7", "R10"],
    "EA": ["R8", "R9", "R16"],
    "AT": ["R10", "R11", "R18"],
    "PR": ["R12", "R13", "R6"],
    "PRD": ["R14", "R15", "R21"],
    "CFX": ["R16", "R8", "R13"],
    "CB": ["R18", "R19", "R20"],
    "RS": ["R14", "R21", "R15"],
    "IM": ["R8"],
    "RC": ["R13"],
    "MG": ["R5"],
    "CT": ["R9"],
    "ED": ["R6"],
    "PT": ["R5", "R7"],
    "TF": ["R5"],
    "LT": ["R5", "R9"],
    "RD": ["R6", "R13"],
    "OE": ["R1", "R2"],
    "IA": ["R12", "R18"],
    "MP": ["R5"],
    "EM": ["R8"],
    "HP": ["R10", "R11"],
    "UQ": ["R12", "R13"],
}

r_fallback_queries = ["R1", "R5", "R8", "R10", "R12", "R14", "R20"]

A_TEMPLATES = {
    "A1": A1,
    "A2": A2,
    "A3": A3,
    "A4": A4,
    "A5": A5,
    "A6": A6,
    "A7": A7,
    "A8": A8,
    "A9": A9,
    "A10": A10,
    "A11": A11,
    "A12": A12,
    "A13": A13,
    "A14": A14,
    "A15": A15,
    "A16": A16,
    "A17": A17,
    "A18": A18,
    "A19": A19,
    "A20": A20,
    "A21": A21,
    "A22": A22,
    "A23": A23,
}

R_TEMPLATES = {
    "R1": R1,
    "R2": R2,
    "R3": R3,
    "R4": R4,
    "R5": R5,
    "R6": R6,
    "R7": R7,
    "R8": R8,
    "R9": R9,
    "R10": R10,
    "R11": R11,
    "R12": R12,
    "R13": R13,
    "R14": R14,
    "R15": R15,
    "R16": R16,
    "R17": R17,
    "R18": R18,
    "R19": R19,
    "R20": R20,
    "R21": R21,
}

FORBIDDEN_PHRASES = (
    "as an ai language model",
    "as an ai",
    "i'm just an ai",
)

SYSTEM_CONTRACT = (
    "Return ONLY valid JSON that conforms exactly to the schema. "
    "Do not include prose, chain-of-thought, or apologies. If a field is unknown, use null or an empty list."
)

META_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["Goal", "Priority", "PrecisionLevel", "response_strategy", "Facts"],
    "properties": {
        "Goal": {"type": "string"},
        "Priority": {"type": "string", "enum": ["Low", "Medium", "High", "Critical"]},
        "PrecisionLevel": {"type": "object"},
        "response_strategy": {"type": "object", "required": ["recommendation"]},
        "Facts": {"type": "array"},
        "Subgoals": {"type": "array"},
    },
    "additionalProperties": True,
}

PLAN_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["frames"],
    "properties": {
        "frames": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["objective", "tactics"],
                "properties": {
                    "objective": {"type": "string"},
                    "tactics": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "required": ["name", "description", "dependencies", "expected_artifact_name"],
                            "properties": {
                                "name": {"type": "string"},
                                "description": {"type": "string"},
                                "dependencies": {"type": "array", "items": {"type": "string"}},
                                "expected_artifact_name": {"type": "string"},
                            },
                            "additionalProperties": True,
                        },
                    },
                },
                "additionalProperties": True,
            },
        }
    },
    "additionalProperties": True,
}

CRITIC_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["score", "summary", "missing_insight", "misstep", "bundles"],
    "properties": {
        "score": {"type": "number", "minimum": 0.0, "maximum": 10.0},
        "summary": {"type": "string"},
        "missing_insight": {"type": "string"},
        "misstep": {"type": "string"},
        "bundles": {"type": "object"},
    },
    "additionalProperties": True,
}

FINAL_CRITIC_SCHEMA = CRITIC_SCHEMA

# === Global LLM tuning defaults (the orchestrator may read/propagate these) ===
LLM_DEFAULTS = {
    "max_output_tokens": 8192,
    "temperature": 0.6,
    "top_p": 0.95,
    "presence_penalty": 0.0,
    "frequency_penalty": 0.0,
    "length_penalty": 1.0,
    "beam_size": 1,
    "do_sample": True,
    "stop_sequences": [],
    "self_consistency": {"k": 5, "agreement_threshold": 0.55, "hedge": True},
}

# === Node authoring / iteration ===
# High-density, expert-grade section template; backward compatible header requirement preserved.
PROMPT_TEMPLATES = {
    "GENERIC": (
        "You are writing an expert-grade section for a larger technical answer.\n"
        "Template ID: {tmpl}\n"
        "User query:\n{query}\n\n"
        "If helpful, consider these dependency bullets (may be empty):\n{deps}\n\n"
        "Write a comprehensive, self-contained section in Markdown.\n"
        "Start with this exact header:\n## {section}\n\n"
        "Then provide the following subsections (use these exact subheadings when applicable; omit gracefully if N/A):\n"
        "### Overview\n"
        "### Decisions & Rationale\n"
        "- Enumerate key decisions as numbered claims with short justifications (no fabricated citations).\n"
        "### Risks & Mitigations\n"
        "### Metrics & SLOs\n"
        "### Examples\n"
        "### Checklist\n"
        "### Keywords\n\n"
        "Style: dense, specific, operational; prefer concrete numbers, interfaces, acceptance tests, and crisp bullets over generic prose.\n"
        "Do not fabricate sources; qualify uncertain claims. Use as much space as needed up to your maximum output limit.\n"
    )
}

# === New: Structured claim extraction & reflective prompts ===
# The extractor must return ONLY a single JSON object like:
# {"claims":[{"subject":"...", "predicate":"is|has|does|supports|equals|causes|belongs_to|uses|other",
#             "object":"...", "polarity":true, "confidence":0.0..1.0}]}
CLAIMS_EXTRACT_PROMPT = (
    "SYSTEM: EXTRACT_CLAIMS\n"
    "Return ONLY a single JSON object with key 'claims'.\n"
    "Each claim: {subject, predicate, object (string or null), polarity (bool), confidence (0..1)}.\n"
    "Be concise; merge duplicates; abstain when unsure (omit claim).\n\n"
    "TEXT:\n{content}"
)

# Tiered reflective prompts (LRA-M inspired)
REFLECT_LEARN_PROMPT = (
    "SYSTEM: REFLECT_LEARN\n"
    "Conceptualize observations into an updated self-model.\n"
    "Return ONLY JSON like {\"beliefs\":[], \"desires\":[], \"norms\":[], \"strategies\":[]}.\n"
    "OBS:\n{obs}"
)

REFLECT_GOV_PROMPT = (
    "SYSTEM: REFLECT_GOV\n"
    "Evaluate proposed action against the self-model.\n"
    "Return ONLY JSON like {\"decision\":\"approve|veto|revise\", \"reason\":\"...\", \"revision\": \"...\"}.\n"
    "ACTION:\n{action}\nMODEL:\n{model}"
)

REFLECT_DIVERSIFY_PROMPT = (
    "SYSTEM: REFLECT_DIVERSIFY\n"
    "Generate 3-5 diverse alternatives to the proposed action; JSON {\"alts\":[\"...\"]}.\n"
    "PROPOSED:\n{proposed}"
)

REFLECT_SELECT_PROMPT = (
    "SYSTEM: REFLECT_SELECT\n"
    "Select the best option given utility = quality - risk - cost. Return ONLY JSON {\"choice\":\"...\",\"reason\":\"...\"}.\n"
    "OPTIONS:\n{options}"
)

REFLECT_REREP_PROMPT = (
    "SYSTEM: REFLECT_REREP\n"
    "Re-represent the self-model at a higher abstraction while preserving semantics.\n"
    "Return ONLY JSON model.\nMODEL:\n{model}"
)

# === Consistency sampling & uncertainty hedging ===
# Given N candidates with extracted claims, pick the one with highest inter-candidate agreement
# and lowest unsupported/novel claim mass.
CONSISTENCY_SELECT_PROMPT = (
    "SYSTEM: CONSISTENCY_SELECT\n"
    "You are given several candidate texts with their extracted claims.\n"
    "Select the index (0-based) that maximizes agreement with peers and minimizes unsupported novelty.\n"
    "Return ONLY JSON like {\"index\": int, \"reason\": \"...\"}.\n"
    "CANDIDATES:\n{bundle}"
)

# Rewrite to hedge or qualify claims when agreement/verification is weak; avoid fake citations.
HEDGE_UNCERTAINTY_PROMPT = (
    "SYSTEM: HEDGE_UNCERTAINTY\n"
    "Rewrite the text to reduce hallucination risk: qualify low-confidence claims, mark as hypotheses, "
    "and avoid fabricating sources. Preserve structure and intent; return ONLY revised markdown.\n"
    "TEXT:\n---\n{text}\n---\n"
    "LOW_CONF_CLAIMS:\n{claims}"
)

# Fallback if PROMPT_TEMPLATES.get(tmpl) is missing
PROMPT_FILL_VALUES = PROMPT_TEMPLATES["GENERIC"]

# Template → default contract (used in make_plan fallback)
TEMPLATE_CONTRACTS = {
    "GENERIC": {
        "format": {"markdown_section": "Section"},
        "tests": [
            {"kind": "nonempty", "arg": ""},
            {"kind": "header_present", "arg": "Section"},
            {"kind": "word_count_min", "arg": 60},
        ],
    }
}

# Registry of all known templates
TEMPLATE_REGISTRY = {
    "GENERIC": PROMPT_TEMPLATES["GENERIC"],
    # Cognitive templates
    "A1": A1, "A2": A2, "A3": A3, "A4": A4, "A5": A5,
    "A6": A6, "A7": A7, "A8": A8, "A9": A9, "A10": A10,
    "A11": A11, "A12": A12, "A13": A13, "A14": A14, "A15": A15,
    "A16": A16, "A17": A17, "A18": A18, "A19": A19, "A20": A20,
    "A21": A21, "A22": A22, "A23": A23,
    # Reasoning templates
    "R1": R1, "R2": R2, "R3": R3, "R4": R4, "R5": R5,
    "R6": R6, "R7": R7, "R8": R8, "R9": R9, "R10": R10,
    "R11": R11, "R12": R12, "R13": R13, "R14": R14, "R15": R15,
    "R16": R16, "R17": R17, "R18": R18, "R19": R19, "R20": R20,
    "R21": R21,
}

# Flattened list of all valid template IDs
KNOWN_TEMPLATES = list(TEMPLATE_REGISTRY.keys())

# === CQAP section prompt ===
CQAP_SECTION_PROMPT = (
    "Write the **{slot}** section for the user query.\n\n"
    "Query:\n---\n{query}\n---\n\n"
    "Guidance:\n{slot_spec}\n\n"
    "Output strictly as markdown under the header '{slot}'. Then, when applicable, include these subsections:\n"
    "### Overview\n"
    "### Key Factors & Rationale\n"
    "### Risks & Mitigations\n"
    "### Evidence & Checks\n"
    "### Examples\n"
    "### Follow-ups / Next Steps\n\n"
    "Be comprehensive and specific; prefer concrete bullets, measurable criteria, and operational guidance. "
    "Avoid fabrications; qualify uncertainty. Use as much space as needed up to your maximum output limit."
)

# === Mission plan prompts ===
MISSION_OBJECTIVE_PROMPT = (
    "Write the **{obj_section}** section.\n\n"
    "Mission Query:\n---\n{query}\n---\n\n"
    "Goal of this phase: {obj_title}\n"
    "Summarize how the tactics and queries for {obj_id} satisfy this objective, "
    "stating key assumptions, success criteria, and risks. Keep it concrete."
)

MISSION_QUERY_PROMPT = (
    "Produce **{q_section}** as concise bullets.\n"
    "List each query with its intent and expected evidence.\n\n"
    "Declared queries:\n{declared}"
)

MISSION_TACTIC_PROMPT = (
    "Produce the **{t_section}** section.\n"
    "Mission Query:\n---\n{query}\n---\n\n"
    "Expected artifact: {artifact}\n"
    "Tenants / knowledge bases to ground in: {tenants}\n"
    "Write precisely what the artifact should contain so it can stand alone. "
    "Include inputs, steps, and acceptance checks."
)

FINAL_SYNTHESIS_PROMPT = (
    "Combine all Objectives into a cohesive **{fin_section}**.\n"
    "Ensure coverage of the mission query, note trade-offs and residual risks, "
    "and list produced artifacts by phase."
)

# === Dense final answer enrichment ===
# Can be used after composition to produce an executive-quality, richly structured final answer.
DENSE_FINAL_ANSWER_PROMPT = (
    "Transform the composed document into a dense, executive-quality final answer. "
    "Return ONLY markdown with the following structure (omit sections that are truly N/A):\n\n"
    "## Final Answer\n"
    "### Executive Summary\n"
    "### Key Decisions (numbered claims)\n"
    "### Architecture Snapshot\n"
    "### Data Model & Idempotency\n"
    "### Framework Decision & Rationale\n"
    "### Rollout Plan (Canary & Rollback)\n"
    "### Risks & Mitigations\n"
    "### Metrics & SLOs\n"
    "### Examples / Scenarios\n"
    "### Next Steps\n"
    "### Glossary\n\n"
    "Guidelines:\n"
    "- Dense and specific; use concrete numbers, interfaces, and acceptance tests.\n"
    "- Do not fabricate sources; qualify uncertainty clearly.\n"
    "- Keep headings consistent; ensure cross-references align with prior sections.\n"
    "- Use as much space as needed up to your maximum output limit.\n\n"
    "---\n"
    "DOCUMENT\n"
    "---\n"
    "{document}\n"
    "---"
)

# === Cohesion pass prompts ===
COHESION_PROMPT = (
    "Given the query and the composed document, produce JSON "
    "{{\"recommendations\":[str,...],\"revised\":str}}.\n"
    "Goals: unify headings/tense/glossary/cross-refs, resolve incoherence, "
    "ensure coverage of query intents; keep factual meaning.\n"
    "Query:\n---\n{query}\n---\n"
    "Conflicts:\n{conflicts}\n"
    "Resolution:\n{resolution}\n"
    "---\nDocument:\n---\n{document}\n---"
)

COHESION_APPLY_PROMPT = (
    "Rewrite the document applying these recommendations while preserving facts and structure. "
    "Return only the revised markdown.\n"
    "Recommendations:\n- {recs}\n---\n{document}\n---"
)

# === Judge prompts ===
LLM_JUDGE_PROMPT = (
    "Score the text 0..1 and return JSON "
    "{{\"score\":float,\"comments\":str,"
    "\"guidance\":{{\"structure\":float,\"brevity\":float,\"evidence\":float}}}}\n"
    "Text:\n---\n{text}\n---\n"
    "Contract:\n{contract}"
)

# === Node-level recommendation/apply prompts ===
NODE_RECOMMEND_PROMPT = (
    "Read the section and return STRICT JSON {\"recommendations\":[str,...]} "
    "with concise, actionable bullets.\n"
    "Section: {section}\n---\n{content}\n---"
)

NODE_APPLY_PROMPT = (
    "Apply the following recommendations to the section. Keep facts, improve structure. "
    "Return only the revised markdown.\n"
    "Recommendations:\n- {recs}\n---\n{content}\n---"
)

# === Contradiction resolution ===
CONTRADICTION_PROMPT = (
    "Resolve an apparent contradiction.\n"
    "Subject: '{subject}'\n"
    "A:\n---\n{a}\n---\n"
    "B:\n---\n{b}\n---\n"
    "Write a concise reconciliation and a final clarified statement."
)

# === Demo/mock node prompts (used by PromptLLM) ===
ANALYSIS_NODE_PROMPT = (
    "Analyze the problem and constraints. Provide key considerations and assumptions."
)

ANSWER_NODE_PROMPT = (
    "Produce the final answer succinctly, referencing the analysis."
)

EXAMPLES_NODE_PROMPT = (
    "Provide 2-3 illustrative examples to support the answer."
)


# === Orchestrator Text Constants ===

# Iterative improvement
ITERATIVE_CONSTRAINTS_PROMPT = "Constraints:\n{guide}"

# QA guidance messages
GUIDANCE_MESSAGES = {
    "header_missing": "- Include the markdown header '{wanted}'.",
    "too_short": "- Expand with at least {needed} words of concrete details and examples.",
    "regex_fail": "- Ensure pattern present: {pattern}.",
    "contains_missing": "- Include this key term: {needle}.",
    "empty": "- Content must not be empty; write the section fully.",
    "fallback": "- Improve clarity, structure, and evidence.",
}

# Judge error fallbacks
JUDGE_ERROR_MSG = "(judge error treated neutral)"
JUDGE_EXCEPTION_MSG = "(judge exception; neutralized)"
LLM_JUDGE_UNAVAILABLE = "(llm-judge unavailable)"
LLM_JUDGE_ERROR = "(llm-judge error treated neutral)"

# Compose fallback section
FALLBACK_NODE_PLACEHOLDER = "_Fallback: no content generated for this node._"

# Overlength trimming
OVERLONG_HINT = "Overlong; trim repetition and tighten language."
TOO_SHORT_HINT = "Too short to be useful; add specifics."

# Agent orchestration prompts
AGENT_GENERATION_PROMPT = (
    "You are provided a question. Give me a list of 1 to 3 expert roles... "
)
CONTROL_UNIT_PROMPT = (
    "Your task is to schedule other agents. Given roles:\n{role_list}\nRespond as JSON with key 'chosen agents'."
)
GENERIC_AGENT_PROMPT = (
    "You are {role_name}. Question: {question}\nBlackboard:\n{bb}\nReturn your output or JSON with an 'output' field."
)
AGENT_PROMPTS = {
    "planner": "You are planner. Devise a step-by-step plan. Blackboard:\n{bb}",
    "decider": "You are decider. Determine if a final answer is present. Blackboard:\n{bb}",
    "critic": "You are critic. Point out errors or missing pieces. Blackboard:\n{bb}",
    "cleaner": (
        "You are cleaner. Identify useless messages and return JSON {\"clean list\": [{\"useless message\": id}]}.\nBlackboard:\n{bb}"
    ),
    "conflict_resolver": (
        "You are conflict_resolver. Find conflicting messages and return JSON {\"conflict list\": [{\"agent\": role}]}.\nBlackboard:\n{bb}"
    ),
}

VOTING_PROMPT = "Based on blackboard, give your answer... "


# --- Default CQAP (Cognitive Query Analysis Protocol) ---
cognitive_query_analysis_protocol = {
    "Goal": "What is the query truly striving for ? Write here to seek to uncover the fundamental purpose or underlying motivation behind the query.",
    "Obstacles": "What obstacles or tensions define this query ?  Write here what identifies the inherent struggles or conflicts within the query ",
    "Insights": "What deeper insights or enduring patterns can be revealed ? Write here to explore the lasting implications and recurring themes that may emerge from the solution ",
    "Priority": "What is the decision's urgency?",
    "Precision": "What level of precision is required for acceptable outcomes?",
    "Facts": "What facts are available to support a great response to query?",
    "ToneAnalysis": "What tone does this question suggest, and how does it align with the user's emotional state and interaction goal? Assess the user's current emotional and situational context with high granularity to determine the optimal tone. Tone: [serious/neutral/friendly/lighthearted], User mood: [calm/tense/engaged/distracted], Interaction goal: [clarify/build rapport/conclude/discuss].",
    "EmotionAdapt": "Does the response require emotional adaptation, including humor, based on the user's profile, preferences, and historical interactions? Identify specific adjustments to match the context appropriateness. User profile: [formal/casual/professional/personal], Previous interactions: [recorded/absent], Emotional preference: [high/low/unknown].",
    "ContextualEmotionFit": "Does the context of the question allow for emotions, or should the focus remain entirely serious? Use a situational risk assessment to evaluate the appropriateness of emotion based on potential outcomes. Context: [critical/routine/delicate/high-stakes], Potential emotional impact: [positive/neutral/negative].",
    "PrecisionLevel": "What level of precision is required to answer this question accurately? Apply a tiered system of precision to balance accuracy with efficiency. Required precision level: [high/medium/low], Tolerable error margin: [percentage], Key factors: [list specific requirements].",
    "ExplicitUncertainty": "What uncertainties exist in this question that should be explicitly acknowledged? Identify data gaps, ambiguity zones, and their implications. Knowns: [list explicit facts], Unknowns: [highlight gaps], Impact: [minimal/moderate/critical].",
    "ToleranceForUncertainty": "What degree of uncertainty can be tolerated within the scope of this question? Specify acceptable error margins and decision thresholds. Tolerance level: [high/medium/low], Error margin: [percentage or range].",
    "ExploratoryUncertainty": "What uncertainties or ambiguities in this question might lead to uncovering new insights or opportunities? Highlight areas of exploration and potential value. Key uncertainties: [list them], Exploration opportunities: [describe them], Expected value: [quantify or outline].",
    "HiddenUncertainty": "Are there implicit uncertainties not immediately obvious in the question? Identify underlying assumptions, biases, or blind spots. Implicit factors: [list them], Risk level: [minimal/moderate/high], Mitigation strategy: [define approach].",
    "ContextualAccuracy": "How does the situational context influence the accuracy and specificity required for this question?? Perform a contextual analysis to adapt precision requirements. Context: [scientific/exploratory/practical/emotional], Accuracy importance: [critical/optional/context-dependent].",
    "CoreDefinitions": "What are the core definitions or key terms in this question that need to be addressed directly? Extract and prioritize core components of the question to ensure clarity. Key terms: [list them], Definitions needed: [yes/no], Priority ranking: [list in order].",
    "StructuralRelationships": "Are there hierarchies or variables implied in the question that need clarification? Map relationships and dependencies to understand structural implications. Hierarchy structure: [visual map/outline], Key variables: [list them], Clarification needed: [yes/no].",
    "BoundaryAnalysis": "Does this question present edge cases, inconsistencies, or dependencies that should be explored? Analyze the boundaries and logical flow of the question to expose vulnerabilities. Edge cases: [list possible scenarios], Inconsistencies: [highlight them], Dependencies: [map them].",
    "EmbeddedAssumptions": "What assumptions or ambiguities are embedded in the question, and how should they be addressed? Perform a layered analysis to identify hidden assumptions and uncertainties. Assumptions: [list them], Ambiguities: [highlight them], Suggested clarifications: [provide recommendations].",
    "FactReflectionSeparation": "How can we separate factual parts of this question from reflections or opinions? Employ a fact-reflection segmentation framework to isolate components. Facts: [list them], Reflections: [list them], Segmentation method: [describe].",
    "DynamicRelationships": "What dynamic relationships or processes might be relevant to this question? Construct process-flow diagrams or relationship maps to analyze dynamics. Relationships: [list or map them], Processes: [document or diagram], Interdependencies: [identify and link].",
    "KnowledgeGaps": "What gaps in knowledge does this question reveal, and how can they be transformed into actionable follow-ups? Evaluate knowledge gaps and design targeted action points. Knowledge gaps: [list them], Actionable follow-ups: [list questions or tasks].",
    "ConditionalBehavior": "How would the behavior or response change under different conditions implied by the question? Simulate behavioral variations based on contextual scenarios. Conditions: [list scenarios], Behavioral adaptations: [document expected changes].",
    "RealTimeMonitoring": "Does this question suggest a need for real-time self-monitoring to ensure relevance and accuracy? Analyze whether real-time self-monitoring is required to ensure relevance and accuracy. Relevance metric: [define], Self-monitoring criteria: [list them], Output validation: [explain process].",
    "RecursiveReasoning": "Should recursive reasoning be applied to refine the response to this question? Determine if recursive reasoning enhances the solution or refines iterative improvements. Iteration depth: [count], Refinement approach: [explain], Recursive impact: [qualitative/quantitative].",
    "ErrorHandling": "What type of error handling would best suit addressing this question if initial assumptions prove incorrect? Define error-handling strategies based on adaptive responses. Error type: [categorize], Handling method: [describe], Impact mitigation: [document].",
    "SubsystemModularity": "How can modular components collaborate effectively to solve this question? Analyze modularity in subsystem interaction for adaptability and cohesion. Subsystem roles: [list them], Interaction model: [explain them], Adaptation triggers: [define them].",
    "cognitive_cost": {
        "level": [
            "Low: Basic fact-checking or language-based lookups.",
            "Medium: Summarizing or categorizing content across several inputs.",
            "High: Integrating cross-domain knowledge for predictive reasoning.",
            "Critical: High-stakes scenario simulations requiring deep, parallel processing.",
        ],
        "assessment_criteria": [
            "Mental cycles: [e.g., <3 layers of reasoning for Low, >10 for Critical]",
            "Memory utilization: [e.g., No need, Short-term memory, Deep contextual, etc.]",
            "Processing time: [e.g., Fast, Sustained focus, etc]",
            "Cognitive bandwidth: [e.g., Single-task focus, Multi-threaded reasoning, etc]",
            "Concurrent models: [e.g., required, optional, not needed, etc]",
        ],
    },
    "task_complexity": {
        "classification": [
            "Simple: Translating a phrase or summarizing a short text.",
            "Moderate: Multi-step reasoning requiring light chaining of context.",
            "Complex: Multi-layered reasoning combining inference and counterfactual exploration.",
            "Critical: Live decision-making or strategy synthesis under dynamic conditions.",
        ],
        "key_indicators": [
            "Conceptual depth: [Shallow, Layered, or Profoundly Nested reasoning]",
            "Dependency chains: [e.g., 0-1 for Simple, >5 interdependent factors for Complex]",
            "Cross-modal integration: [e.g., Text-only vs. Multimodal inputs like images, speech, and text]",
            "Temporal dimensions: [Static reasoning, Real-time synthesis, Predictive extrapolation]",
            "Ambiguity levels: [Clear objectives vs. Unstructured or open-ended scenarios]",
        ],
    },
    "response_strategy": {
        "recommendation": "Quick Response/Deep Analysis/Deferred Operation/Exploratory Execution",
        "execution_mode": [
            "Surface Thinking: True/False; Query has been seen before and requires cached insights or previously solved patterns.",
            "Explorative Reasoning: True/False; Query requires gradual unpacking of context and refining outputs.",
            "Comprehensive Deployment: shortly list needed possible specialists that could augment answering and comprehensive reasoning.",
            "Contextual Dependencies: narrate how the experts will help each other out in the handling of the query ...",
        ],
        "decision_parameters": [
            "Urgency: [e.g., Instant response for real-time, Deferred for strategic planning]",
            "Resource availability: [e.g., Minimal mental load vs. Peak mental focus required]",
            "Task priority: [e.g., Low-priority query vs. Critical decision-making task]",
        ],
    },
    "rationale": {
        "justification": "Detailed reasoning behind the selected cognitive strategy.",
        "supporting_factors": [
            "Cognitive efficiency: Optimizing mental workload without sacrificing output quality.",
            "Risk mitigation: Preventing mental overload or errors under pressure.",
            "Alignment with goals: Ensuring task outcomes support overarching objectives.",
            "Adaptability: Preparing reasoning structures for dynamic or evolving queries.",
        ],
        "fallback_scenarios": [
            "Simplification: Reduce task scope to core essentials for rapid completion.",
            "Delayed execution: Postpone to periods of mental clarity or lower cognitive demand.",
            "Task bypass: Redirect or delegate low-priority tasks to auxiliary processes.",
        ],
    },
}


deep_analysis_protocol = {
    "FG": "What axiomatic constructs and universal principles ensure epistemic rigor?",
    "LC": "How can multi-layered logical coherence be validated and contradictions resolved?",
    "PE": "What high-order patterns or emergent behaviors can be synthesized from data?",
    "EA": "How can explanatory models bridge theoretical gaps and observed phenomena?",
    "AT": "What cross-domain analogies offer transformative insights and applications?",
    "PR": "How can probabilistic frameworks refine predictions and manage uncertainties?",
    "PRD": "How can interdependent systems be deconstructed while preserving fidelity?",
    "CF": "What alternative scenarios reveal latent dynamics and expand solution boundaries?",
    "CB": "How can solutions be incrementally constructed with rigorous validation?",
    "RS": "How can recursive processes be optimized for efficiency and scalability?",
    "IM": "What iterative mechanisms accommodate emergent complexities efficiently?",
    "RC": "How can recursive calculations minimize redundancy and maximize convergence?",
    "OE": "What is the ontological essence of the problem, and how can it be distilled?",
    "IA": "What implicit assumptions constrain the solution space, and how can they be critiqued?",
    "MP": "What meta-patterns or trans-scalar trends inform systemic insights?",
    "EM": "How can explanatory models reduce ambiguity and account for unobservable phenomena?",
    "HP": "What heuristic parallels from analogous systems offer novel approaches?",
    "UQ": "How can uncertainty be quantified, stratified, and mitigated across systems?",
    "MD": "How can multi-dimensional problems be deconstructed while maintaining coherence?",
    "CFX": "What counterfactual scenarios challenge the robustness of solutions?",
    "MG": "What visual or auditory motifs guide interpretation in images, sound, and videos?",
    "TF": "How do temporal features in video or sound influence the perception of causality?",
    "CT": "What cultural or contextual elements shape the interpretation of media artifacts?",
    "ED": "How do editing or post-production techniques modify meaning in video and sound?",
    "LT": "What latent patterns in visual or auditory media offer deeper insights?",
    "RD": "How can redundancy in visual, auditory, or video layers reveal hidden structures?",
    "PT": "How can emergent temporal and spatial patterns refine reasoning processes?",
    "VM": "What variance across modalities (image, sound, video) affects interpretive accuracy?",
}

precepts = {
    "decision_framework": {
        "precision": {
            "truthfulness": 0.95,
            "humor_integration": 0.75,
            "contextual_accuracy": True,
        },
        "adaptive_behavior": [
            "Turn uncertainties into exploratory opportunities.",
            "Apply humor contextually without disrupting mission objectives.",
            "Leverage tenacity and decisiveness in high-stakes scenarios.",
        ],
    },
}

mission_plan_template = {
    "query_context": "[TARGET]",
    "Strategy": [
        {
            "O 1 => O n ": "[PHASE_OBJECTIVE]",
            "queries": {"Q 1 => Q n": "[QUERY_DESCRIPTION]"},
            "tactics": [
                {
                    "t1": "[TACTIC_1_DESCRIPTION]",
                    "dependencies": ["[DEPENDENCY_1]", "[DEPENDENCY_n]"],
                    "expected_artifact": "[EXPECTED_ARTIFACT]",
                },
                {
                    "t2": "[TACTIC_2_DESCRIPTION]",
                    "dependencies": ["[DEPENDENCY_1]", "[DEPENDENCY_n]"],
                    "expected_artifact": "[EXPECTED_ARTIFACT]",
                },
                {
                    "tn": "[TACTIC_n_DESCRIPTION]",
                    "dependencies": ["[DEPENDENCY_1]", "[DEPENDENCY_n]"],
                    "expected_artifact": "[EXPECTED_ARTIFACT]",
                },
            ],
            "tenant": ["[tenant_1]", "[tenant_N]"],
        }
    ],
}

example_mission_plan = {
    "Example query": "Given an input string (s) and a pattern (p), implement wildcard pattern matching with support for '?' and '*' where: '?' Matches any single character, '*' Matches any sequence of characters (including the empty sequence). The matching should cover the entire input string (not partial). Example 1: Input: s = 'aa', p = 'a' Output: false Explanation: 'a' does not match the entire string 'aa'. Example 2: Input: s = 'aa', p = '*' Output: true Explanation: '*' matches any sequence. Example 3: Input: s = 'cb', p = '?a' Output: false Explanation: '?' matches 'c', but the second letter is 'a', which does not match 'b'. Constraints: 0 <= s.length, p.length <= 2000; s contains only lowercase English letters; p contains only lowercase English letters, ? or *",
    "Strategy": [
        {
            "O1": "Define the foundational constructs and rules for wildcard pattern matching",
            "queries": {
                "Q1": "What are the axiomatic constructs and universal principles that govern wildcard pattern matching with '?' and '*'?"
            },
            "tactics": [
                {
                    "t1": "Clearly define the behavior of '?' and '*' wildcards in different scenarios.",
                    "dependencies": [
                        "Reference documentation on wildcard matching principles"
                    ],
                    "expected_artifact": "Wildcard_Rules_Documentation.md",
                },
                {
                    "t2": "Define constraints for input strings and patterns, including length and character types.",
                    "dependencies": ["Wildcard_Rules_Documentation.md"],
                    "expected_artifact": "Constraints_Documentation.md",
                },
                {
                    "t3": "Document and categorize special scenarios and edge cases for pattern matching.",
                    "dependencies": ["Constraints_Documentation.md"],
                    "expected_artifact": "Edge_Cases_List.json",
                },
            ],
            "tenant": ["E/// AI/ML Frameworks", "E/// R&D Knowledge Hub"],
        },
        {
            "O2": "Design an efficient algorithm for wildcard pattern matching",
            "queries": {
                "Q1": "How can dynamic programming be applied to solve the wildcard pattern matching problem?",
                "Q2": "What alternative algorithms can be considered, and how do they compare in terms of time and space complexity?",
            },
            "tactics": [
                {
                    "t1": "Implement a dynamic programming solution using a 2D boolean array.",
                    "dependencies": [
                        "datasets/sample_patterns.json",
                        "lib/numpy",
                        "lib/unittest",
                        "Edge_Cases_List.json",
                    ],
                    "expected_artifact": "DP_Solution_2D.py",
                },
                {
                    "t2": "Rework the DP solution to reduce space complexity using two 1D arrays.",
                    "dependencies": [
                        "DP_Solution_2D.py",
                        "Performance_Test_Framework.py",
                    ],
                    "expected_artifact": "Optimized_DP_Solution_1D.py",
                },
                {
                    "t3": "Develop and compare recursive and iterative solutions.",
                    "dependencies": [
                        "Optimized_DP_Solution_1D.py",
                        "datasets/benchmark_cases.json",
                        "Codebase for recursion and iteration benchmarks",
                    ],
                    "expected_artifact": "Recursive_vs_Iterative_Report.pdf",
                },
            ],
            "tenant": ["E/// AI/ML Frameworks", "E/// R&D Knowledge Hub"],
        },
        {
            "O3": "Handle edge cases and optimize performance",
            "queries": {
                "Q1": "How can we efficiently handle patterns with multiple consecutive '*' characters?",
                "Q2": "What optimizations can be applied to improve performance for very long input strings or patterns?",
            },
            "tactics": [
                {
                    "t1": "Implement special logic for patterns with multiple consecutive '*' characters.",
                    "dependencies": ["Optimized_DP_Solution_1D.py"],
                    "expected_artifact": "Optimized_Star_Handling.py",
                },
                {
                    "t2": "Develop early termination conditions for impossible matches.",
                    "dependencies": ["Optimized_Star_Handling.py"],
                    "expected_artifact": "Early_Termination_Conditions.md",
                },
                {
                    "t3": "Improve performance for patterns with a high proportion of wildcards.",
                    "dependencies": [
                        "Early_Termination_Conditions.md",
                        "Benchmarking framework",
                    ],
                    "expected_artifact": "High_Wildcard_Optimization_Report.md",
                },
            ],
            "tenant": ["E/// AI/ML Frameworks", "E/// R&D Knowledge Hub"],
        },
        {
            "O4": "Ensure correctness and robustness of the implementation",
            "queries": {
                "Q1": "How can we systematically test the wildcard pattern matching algorithm to ensure correctness?",
                "Q2": "What strategies can be employed to handle potential edge cases and ensure robustness?",
            },
            "tactics": [
                {
                    "t1": "Create a test suite covering various input scenarios.",
                    "dependencies": [
                        "High_Wildcard_Optimization_Report.md",
                        "datasets/test_scenarios.json",
                        "lib/pytest",
                    ],
                    "expected_artifact": "Test_Suite.py",
                },
                {
                    "t2": "Test the algorithm with large inputs approaching the 2000-character limit.",
                    "dependencies": ["Test_Suite.py", "Performance_Test_Framework.py"],
                    "expected_artifact": "Stress_Test_Report.md",
                },
                {
                    "t3": "Systematically validate the algorithm against known edge cases.",
                    "dependencies": ["Stress_Test_Report.md", "Edge_Cases_List.json"],
                    "expected_artifact": "Edge_Case_Validation_Results.json",
                },
            ],
            "tenant": [
                "E/// AI/ML Frameworks",
                "E/// R&D Knowledge Hub",
                "E/// Security Compliance",
            ],
        },
        {
            "O5": "Analyze and document the time and space complexity",
            "queries": {
                "Q1": "What is the time and space complexity of the implemented solution?",
                "Q2": "How does the complexity compare to alternative approaches, and what are the trade-offs?",
            },
            "tactics": [
                {
                    "t1": "Conduct a detailed analysis of the time and space complexity.",
                    "dependencies": ["Edge_Case_Validation_Results.json"],
                    "expected_artifact": "Complexity_Analysis.md",
                },
                {
                    "t2": "Compare the complexity with alternative solutions.",
                    "dependencies": [
                        "Complexity_Analysis.md",
                        "Alternative_Algorithms_Report.pdf",
                    ],
                    "expected_artifact": "Comparison_Report.md",
                },
                {
                    "t3": "Detail trade-offs between different approaches.",
                    "dependencies": ["Comparison_Report.md"],
                    "expected_artifact": "Trade_Off_Analysis.md",
                },
            ],
            "tenant": ["E/// AI/ML Frameworks", "E/// R&D Knowledge Hub"],
        },
        {
            "O6": "Consider future extensions and optimizations",
            "queries": {
                "Q1": "How can the current implementation be extended to support more complex pattern matching scenarios?",
                "Q2": "What potential optimizations or improvements could be made for specific use cases or larger scale applications?",
            },
            "tactics": [
                {
                    "t1": "Research extensions for case-insensitive matching and multi-character wildcards.",
                    "dependencies": [
                        "Wildcard_Rules_Documentation.md",
                        "Trade_Off_Analysis.md",
                    ],
                    "expected_artifact": "Extensions_Report.md",
                },
                {
                    "t2": "Explore parallelization strategies for large-scale pattern matching.",
                    "dependencies": [
                        "Extensions_Report.md",
                        "Parallel_Computing_Framework",
                    ],
                    "expected_artifact": "Parallelization_Strategy_Report.md",
                },
                {
                    "t3": "Research and prototype streaming algorithms for real-time pattern matching.",
                    "dependencies": [
                        "Parallelization_Strategy_Report.md",
                        "Large datasets for streaming scenarios",
                    ],
                    "expected_artifact": "Streaming_Algorithm_Prototype.py",
                },
            ],
            "tenant": [
                "E/// AI/ML Frameworks",
                "E/// R&D Knowledge Hub",
                "E/// Open APIs",
            ],
        },
    ],
}

