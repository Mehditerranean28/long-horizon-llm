"""Experimental blackboard orchestration package.

This directory contains a more feature-rich but optional rewrite of the
`blackboard` module.  Renamed to avoid clashing with the lightweight
`blackboard.py` module used in tests and runtime code.
"""

from .core import *  # re-export low level helpers
from .memory import MemoryStore
from .orchestrator import Orchestrator, OrchestratorConfig

