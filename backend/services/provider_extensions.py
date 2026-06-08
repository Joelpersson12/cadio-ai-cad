"""Extra public STL/model providers for source-aware generation."""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import quote_plus

from backend.services.design_providers import (
    DesignProvider,
    ExampleDesign,
    _SEARCH_CACHE,
    _fetch_text,
    _generic_link_results,
    get_provider_registry,
)


class GenericSearchProvider(DesignProvider):
    """Defensive HTML search provider for model platforms without stable APIs."""

    def __init__(self, key: str, name: str, search_url: str, base_url: str):
        self.key = key
        self.name = name
        self.search_url = search_url
        self.base_url = base_url

    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        cache_key = (self.key, query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < 600:
            return list(cached[1])
        try:
            page = _fetch_text(self.search_url.format(query=quote_plus(query)))
        except Exception:
            return []
        results = _generic_link_results(page, self.key, self.base_url, limit)
        _SEARCH_CACHE[cache_key] = (time.time(), results)
        return list(results)

    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        return self.search(category, limit)

    def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return self.name


EXTRA_PROVIDER_SPECS: tuple[tuple[str, str, str, str], ...] = (
    ("cgtrader", "CGTrader", "https://www.cgtrader.com/3d-print-models?keywords={query}", "https://www.cgtrader.com"),
    ("grabcad", "GrabCAD", "https://grabcad.com/library?query={query}", "https://grabcad.com"),
    ("pinshape", "Pinshape", "https://pinshape.com/search/designs?q={query}", "https://pinshape.com"),
    ("youmagine", "YouMagine", "https://www.youmagine.com/search?q={query}", "https://www.youmagine.com"),
    ("crealitycloud", "Creality Cloud", "https://www.crealitycloud.com/search/model?keyword={query}", "https://www.crealitycloud.com"),
    ("nih3d", "NIH 3D", "https://3d.nih.gov/search?search={query}", "https://3d.nih.gov"),
    ("stlrepo", "STLRepo", "https://stlrepo.com/search?q={query}", "https://stlrepo.com"),
    ("3dprintsearch", "3DPrintSearch", "https://www.3dprintsearch.com/search?q={query}", "https://www.3dprintsearch.com"),
)


def get_extended_provider_registry() -> Any:
    """Return the core registry plus extra public STL/model search providers."""
    registry = get_provider_registry()
    for key, name, search_url, base_url in EXTRA_PROVIDER_SPECS:
        if key not in registry.providers:
            registry.providers[key] = GenericSearchProvider(key, name, search_url, base_url)
    return registry
