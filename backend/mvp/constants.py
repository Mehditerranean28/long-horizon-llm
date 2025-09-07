# -*- coding: utf-8 -*-
"""Minimal prompt constants for the orchestrator modules."""

# Planning prompt
PLANNER_PROMPT = "PLAN: {q}\n{hints}"

# Node-related prompts
ANALYSIS_NODE_PROMPT = "Analyze the query: {query}"
ANSWER_NODE_PROMPT = "Provide the final answer referencing analysis"
EXAMPLES_NODE_PROMPT = "Give examples"

NODE_RECOMMEND_PROMPT = "Recommend improvements for section {section}:\n{content}"
NODE_APPLY_PROMPT = "Apply recommendations:\n{recs}\n---\n{content}"

# Cohesion and finalization prompts
COHESION_PROMPT = "Ensure cohesion for query {query}: {document}"
COHESION_APPLY_PROMPT = "Apply cohesion recommendations:\n{recs}\n---\n{document}"
DENSE_FINAL_ANSWER_PROMPT = "Enrich the document:\n{document}"

# Claim extraction
CLAIMS_EXTRACT_PROMPT = "Extract claims from: {content}"

# Template registry
TEMPLATE_REGISTRY = {
    "GENERIC": "## {section}\n\n{deps_bullets}\n\n{query}\n"
}

KNOWN_TEMPLATES = set(TEMPLATE_REGISTRY.keys())
TEMPLATE_CONTRACTS = {}

# LLM judge prompt placeholder
LLM_JUDGE_PROMPT = "Judge the text:\n{text}\nContract: {contract}"
