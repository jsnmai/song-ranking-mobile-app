"""Similarity algorithm dispatcher.

Add new algorithm modules under this package and register them in _ALGORITHMS.
The dispatcher uses a dict so callers contain no if/else branches for version
selection — adding a v2 is a one-line change here.
"""
from types import ModuleType

from src.services.similarity import v1_cosine

_ALGORITHMS: dict[str, ModuleType] = {
    "v1_cosine": v1_cosine,
}


def get_algorithm(version: str) -> ModuleType:
    """Return the algorithm module for the requested version string.

    Raises ValueError for unknown versions so callers fail loudly rather
    than silently producing wrong results.
    """
    if version not in _ALGORITHMS:
        raise ValueError(f"Unknown similarity algorithm version: {version!r}")
    return _ALGORITHMS[version]
