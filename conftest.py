"""
pytest conftest.py - adds the project root to sys.path so tests can import
project modules without installation.
"""

import sys
from pathlib import Path

# Add the project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))
