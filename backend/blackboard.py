# -*- coding: utf-8 -*-
"""Compatibility wrapper for tests importing blackboard from the backend package."""

from .mvp.utils import sanitize_text as _sanitize_text
from .mvp.planning import classify_query, classify_query_llm

__all__ = ["_sanitize_text", "classify_query", "classify_query_llm"]
