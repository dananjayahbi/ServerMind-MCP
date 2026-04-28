"""Placeholder migration from schema v1 to v2 (not yet needed)."""

from config.migrations import register


@register(1, 2)
def migrate_v1_to_v2(config: dict) -> dict:
    """Example migration: add any new fields introduced in v2."""
    # No-op placeholder — extend when schema v2 is introduced.
    return config
