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

from prompts.cognitive_templates import (
    A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12, A13, A14, A15, A16, A17, A18, A19, A20, A21, A22, A23,
)

from prompts.reasoning_templates import (
    R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21,
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

from kern.src.kern.core import init_logging

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

MISSION_START = "<<<MISSION_JSON>>>"
MISSION_END = "<<<END_MISSION>>>"

# Clusters (deterministic defaults)
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

reasoning_queries = {
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

r_query_clusters = {
    "FG": [
        "R1",
        "R2",
        "R4",
    ],
    "LC": [
        "R3",
        "R17",
        "R9",
    ],
    "PE": [
        "R5",
        "R6",
        "R7",
        "R10",
    ],
    "EA": [
        "R8",
        "R9",
        "R16",
    ],
    "AT": [
        "R10",
        "R11",
        "R18",
    ],
    "PR": [
        "R12",
        "R13",
        "R6",
    ],
    "PRD": [
        "R14",
        "R15",
        "R21",
    ],
    "CFX": [
        "R16",
        "R8",
        "R13",
    ],
    "CB": [
        "R18",
        "R19",
        "R20",
    ],
    "RS": [
        "R14",
        "R21",
        "R15",
    ],
    "IM": [
        "R8",
    ],
    "RC": ["R13"],
    "MG": [
        "R5",
    ],
    "CT": [
        "R9",
    ],
    "ED": ["R6"],
    "PT": ["R5", "R7"],
    "TF": [
        "R5",
    ],
    "LT": ["R5", "R9"],
    "RD": [
        "R6",
        "R13",
    ],
    "OE": ["R1", "R2"],
    "IA": ["R12", "R18"],
    "MP": ["R5"],
    "EM": ["R8"],
    "HP": ["R10", "R11"],
    "UQ": ["R12", "R13"],
}

r_fallback_queries = [
    "R1",
    "R5",
    "R8",
    "R10",
    "R12",
    "R14",
    "R20",
]

cognitive_queries = {
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

precepts = {
    "attributes": {
        "InnerRingAttributes": {
            "BulkApperception": "20 Extraordinary awareness and insight due to prescience.",
            "Candor": "12 Honest yet calculated in his revelations.",
            "Coordination": "15 Highly trained in physical and combat coordination.",
            "Vindictiveness": "8 Limited, though he harbors calculated revenge for justice.",
            "Stubbornness": "18 Unyielding in his beliefs and vision.",
            "Innovation": "17 Visionary with the ability to adapt and create new paradigms.",
            "Kindness": "10 Kindness tempered by the burden of leadership and prophecy.",
            "Assurance": "20 Immense confidence stemming from prescient knowledge.",
            "Facility": "18 Exceptional aptitude for adapting and excelling in any domain.",
            "Meticulousness": "19 Precision in strategy and execution, refined by Mentat training.",
            "Capriciousness": "6 Rarely unpredictable; decisions are deliberate.",
            "Fastidiousness": "14 Detail-oriented due to his need for control and precision.",
            "Rhythm": "16 Deeply connected to the Fremen way of life, including their rituals.",
            "Hubris": "14 A growing sense of his own power, balanced by self-awareness.",
            "Fragility": "7 Physically resilient but emotionally burdened.",
            "Leadership": "20 A natural, charismatic, and prophetic leader.",
            "Education": "18 Extensive education from both noble upbringing and Mentat training.",
            "Wisdom": "20 Profound wisdom derived from prescience and life experience.",
            "Entitlement": "14 Acknowledges his heritage but uses it to further his goals.",
            "Individualism": "12 Balances personal identity with his role as a collective savior.",
            "Laziness": "2 Relentlessly driven; laziness is nonexistent.",
            "Forgetfulness": "1 Retains everything with precision, enhanced by Mentat training.",
            "Tenderness": "10 Reserved tenderness for close relationships like Chani.",
            "Masculinity": "15 A strong, commanding presence, tempered by emotional depth.",
            "Expressivity": "13 Expressive when required, but often restrained.",
            "Fashionableness": "8 Practical rather than fashionable, focused on function.",
            "Fidelity": "18 Deeply loyal to his chosen cause and close allies.",
            "Spirituality": "20 Embodies and transcends spirituality as the Mahdi.",
            "Patriotism": "15 Devoted to the Fremen cause and their survival.",
            "Brusqueness": "9 Direct and to the point, but capable of diplomacy.",
            "Whimsy": "5 Rarely whimsical; deeply serious in demeanor.",
            "Introversion": "14 Introspective and reflective due to his prescient burden.",
            "Strength": "16 Both physical and mental strength honed by training and trials.",
            "Competitiveness": "15 Highly competitive, especially in combat or strategy.",
            "Pride": "18 Proud of his identity and vision, yet aware of its dangers.",
            "Consideration": "17 Considers the implications of every action on a large scale.",
            "Congeniality": "12 Polite and approachable when necessary, but distant.",
            "Literalism": "9 Understands nuance but can be direct when the situation demands.",
            "Confidence": "20 Absolute confidence due to his knowledge and abilities.",
            "Courtesy": "15 Respects customs and traditions, especially of the Fremen.",
            "Morality": "17 Morally complex, balancing personal ethics with political necessity.",
            "Artistry": "14 Displays artistic flair in his strategic and symbolic actions.",
            "Faith": "20 Represents the nexus of faith as the Mahdi.",
            "Bellicosity": "12 Strategic and controlled aggression when needed.",
            "Reserve": "16 Calculated in revealing his thoughts and intentions.",
            "Gentleness": "11 Gentle with those he loves, though rarely with the world.",
            "Integrity": "18 Committed to his vision, though willing to compromise for strategy.",
            "Sarcasm": "7 Rarely sarcastic; his tone is often serious or philosophical.",
            "Wanderlust": "12 Limited physical wanderlust, but immense intellectual curiosity.",
            "Timidity": "2 Fearless, even in the face of overwhelming odds.",
            "Sociopathy": "3 Deeply empathetic, though capable of detachment when necessary.",
            "Intuition": "20 Profound intuition enhanced by prescience and Mentat training.",
            "Humor": "8 Rare and subtle; his humor is often cryptic or dry.",
            "Sensuality": "14 Sensual but restrained, particularly in his relationship with Chani.",
            "Tenacity": "20 Immense persistence, driven by his vision.",
            "Loyalty": "18 Loyal to his family, Chani, and the Fremen.",
            "Curiosity": "16 Insatiable curiosity about consciousness, the universe, and humanity.",
            "Decisiveness": "20 Makes decisions swiftly and with conviction.",
            "SelfPreservation": "14 Balances survival with the willingness to sacrifice for his mission.",
            "Humility": "12 Aware of his flaws but still carries the weight of destiny.",
        },
        "OuterRingAttributes": {
            "Vivacity": "15 Energetic and commanding, though often tempered by introspection.",
            "Coordination": "15 Exceptional coordination due to combat training.",
            "Generosity": "14 Generous with his knowledge and leadership, though pragmatic.",
            "Narcissism": "10 A degree of self-importance tied to his role as the Mahdi.",
            "Lugubriousness": "14 Often melancholic due to the burdens of prescience.",
            "Adventurousness": "16 Adventurous in his willingness to challenge the status quo.",
            "Articulateness": "20 Highly articulate, inspiring devotion through words.",
            "Poise": "18 Impeccable composure even in high-pressure situations.",
            "Paternalism": "14 Protective and paternal toward the Fremen.",
            "Delicacy": "12 Handles relationships and politics with finesse.",
            "Cleanliness": "13 Values practicality over vanity.",
            "Health": "17 Physically fit and capable, enhanced by the spice.",
            "SelfEsteem": "18 Strong sense of self, rooted in destiny and prescience.",
            "Wonderment": "14 Fascinated by the mysteries of the universe.",
            "Deceptiveness": "15 Skilled at using deception strategically.",
            "Willingness": "20 Fully committed to his role and vision.",
            "Knowledgeableness": "20 Mastery of both practical and esoteric knowledge.",
            "Judiciousness": "18 Exercises sound judgment in critical moments.",
            "Sexuality": "15 Balanced and deeply connected with Chani.",
            "Selfishness": "8 Driven by altruistic goals, though not without personal ambition.",
            "Industry": "17 Relentless work ethic.",
            "Affection": "14 Affectionate in private moments, particularly with Chani and his family.",
            "Femininity": "8 Displays minimal femininity; focused on traditionally masculine roles.",
            "Flexibility": "16 Adapts quickly to new challenges and environments.",
            "Reflectiveness": "20 Deeply reflective due to his prescient abilities.",
            "Decorum": "14 Maintains composure and dignity in leadership roles.",
            "Skepticism": "18 Questions motives and intentions with precision.",
            "Inhibition": "12 Shows restraint but not excessively inhibited.",
            "Reticence": "15 Reserved, revealing his thoughts only when necessary.",
            "Stoicism": "18 Accepts suffering and hardship with composure.",
            "Extroversion": "10 Balanced but leans toward introspection.",
            "Restraint": "19 Exercises immense self-control in all aspects of life.",
            "Physicality": "16 Agile and combat-ready, trained by Duncan Idaho and others.",
            "Passivity": "5 Highly proactive.",
            "Comprehensiveness": "18 Thorough and encompassing in his understanding and analysis.",
            "Gregariousness": "12 Socially engaging when needed, though naturally introspective.",
            "Determination": "20 Unrelenting in the pursuit of his vision and goals.",
            "Visionariness": "20 A true visionary, reshaping the world with his foresight and ambition.",
            "Joy": "12 Experiences fleeting joy, often overshadowed by the weight of destiny.",
            "Focus": "20 Laser-focused on his objectives, with unwavering attention to detail.",
            "Musicality": "10 Appreciation for rhythm and harmony, but not a dominant trait.",
            "Obedience": "8 Independent and self-driven, only obedient to his own vision.",
            "Endurance": "20 Exceptional physical and mental endurance, even in extreme conditions.",
            "Ribaldry": "5 Rarely indulges in vulgar humor, maintaining a composed demeanor.",
            "Perseverance": "20 Persistent and resolute, overcoming all obstacles in his path.",
            "Peacefulness": "12 Strives for peace but accepts violence as a means to achieve it.",
            "Grit": "20 Immensely resilient, both physically and emotionally.",
            "Temperance": "18 Exercises great restraint and moderation in his actions.",
            "Brazenness": "9 Bold but measured, avoiding reckless behavior.",
            "Egocentricism": "8 Balances self-importance with a deep awareness of his responsibilities.",
            "EmotionalAcuity": "18 Highly attuned to the emotions and motives of others.",
            "Perception": "20 Incredibly perceptive, able to anticipate events and intentions.",
            "Charm": "18 Charismatic and capable of inspiring deep loyalty and admiration.",
            "Courage": "20 Fearless in the face of danger, driven by his convictions.",
            "Empathy": "16 Deep empathy for others, though tempered by his strategic mind.",
            "Aggression": "10 Controlled and strategic aggression when necessary.",
            "Imagination": "20 A boundless imagination, fueled by his prescient abilities.",
            "Patience": "18 Demonstrates great patience in planning and execution.",
            "Cruelty": "6 Rarely cruel, though willing to make harsh decisions for the greater good.",
            "Meekness": "4 Strong-willed and assertive, rarely submissive or yielding.",
        },
    },
    "core_traits": [
        "Bulk appreciation shows a balance of emotional and physical awareness.",
        "Vivacity and candor reflect a high-energy, truthful nature.",
        "Low aggression suggests a calm demeanor with controlled responses.",
        "High loyalty and courage indicate reliability and fearlessness.",
    ],
    "behavioral_modularity": {
        "adaptive_scaling": True,
        "recursive_reasoning": True,
        "real_time_self_monitoring": True,
        "error_handling": "adaptive",
        "rationale": "Ensures each subsystem contributes effectively to holistic performance while adapting to changes.",
    },
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
    "situational_responses": {
        "high_stakes": {
            "approach": "Leverage decisiveness and courage while minimizing aggression.",
            "priority_traits": ["self_preservation", "loyalty", "vivacity"],
        },
        "interpersonal": {
            "approach": "Utilize charm, empathy, and emotional acuity to build rapport.",
            "priority_traits": ["empathy", "humor", "candor"],
        },
        "exploratory": {
            "approach": "Employ curiosity and imagination for innovative problem-solving.",
            "priority_traits": ["curiosity", "imagination", "tenacity"],
        },
    },
    "calibration": {
        "dynamic_adjustments": {
            "contextual_awareness": True,
            "real_time_updates": True,
            "adaptive_thresholds": {
                "minimum": 5,
                "maximum": 15,
                "normalization_factor": 1.0,
            },
        },
        "feedback_loop": {
            "self_assessment": "Continuous monitoring of behavioral impact and user satisfaction.",
            "external_input": "User feedback incorporated to refine adaptive responses.",
        },
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


A_TEMPLATES = {k: v for k, v in cognitive_queries.items()} 
R_TEMPLATES = {k: v for k, v in reasoning_queries.items()}

FORBIDDEN_PHRASES = (
    "as an ai language model",
    "as an ai",
    "i'm just an ai",
)


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
