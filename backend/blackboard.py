# -*- coding: utf-8 -*-
"""Compatibility wrapper for tests importing blackboard from the backend package."""

from pathlib import Path
import sys

# Ensure repository root is on path to import shared modules
sys.path.append(str(Path(__file__).resolve().parent.parent))

from utils import sanitize_text as _sanitize_text
from planning import classify_query, classify_query_llm

__all__ = ["_sanitize_text", "classify_query", "classify_query_llm"]
