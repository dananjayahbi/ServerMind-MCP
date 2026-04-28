"""Configuration migration functions."""

from typing import Callable

# Registry: maps (from_version, to_version) -> migration function
_MIGRATIONS: dict[tuple[int, int], Callable[[dict], dict]] = {}


def register(from_v: int, to_v: int) -> Callable:
    def decorator(fn: Callable) -> Callable:
        _MIGRATIONS[(from_v, to_v)] = fn
        return fn
    return decorator


def migrate(config: dict, target_version: int) -> dict:
    """Apply sequential migrations until config reaches target_version."""
    current = config.get("schema_version", 1)
    while current < target_version:
        key = (current, current + 1)
        if key not in _MIGRATIONS:
            break
        config = _MIGRATIONS[key](config)
        current += 1
        config["schema_version"] = current
    return config
