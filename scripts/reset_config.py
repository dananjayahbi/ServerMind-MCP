#!/usr/bin/env python3
"""
Reset the ServerMind MCP configuration to factory defaults.

WARNING: This will delete all server profiles and reset app settings.

Usage:
    python scripts/reset_config.py [--confirm]
"""

import argparse
import shutil
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reset ServerMind MCP configuration to defaults"
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Skip confirmation prompt and proceed with reset",
    )
    args = parser.parse_args()

    # Import after argparse so --help works without full import chain
    try:
        from config.paths import get_config_path, get_app_data_dir
    except ImportError:
        print("ERROR: Cannot import config.paths. Make sure servermind-mcp is installed.")
        sys.exit(1)

    config_path = get_config_path()
    app_data_dir = get_app_data_dir()

    print("ServerMind MCP - Configuration Reset")
    print("=" * 40)
    print(f"Config file:  {config_path}")
    print(f"Data dir:     {app_data_dir}")
    print()

    if not args.confirm:
        answer = input("This will delete ALL profiles and settings. Continue? [y/N] ").strip().lower()
        if answer != "y":
            print("Aborted.")
            sys.exit(0)

    if config_path.exists():
        backup_path = config_path.with_suffix(".json.bak")
        shutil.copy2(config_path, backup_path)
        print(f"Backup created: {backup_path}")
        config_path.unlink()
        print(f"Deleted: {config_path}")
    else:
        print("No config file found - nothing to reset.")

    # Remove runtime state if present
    try:
        from config.paths import get_runtime_state_path
        runtime = get_runtime_state_path()
        if runtime.exists():
            runtime.unlink()
            print(f"Deleted runtime state: {runtime}")
    except Exception:
        pass

    print()
    print("Reset complete. Run servermind-mcp to regenerate defaults.")


if __name__ == "__main__":
    main()
