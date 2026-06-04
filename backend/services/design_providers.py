"""Design provider interfaces for external design sources.

Providers return metadata only: titles, source URLs, images, and popularity
signals. Cadio uses these as inspiration signals for its own parametric CAD
generation; it does not copy or download model files.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
import hashlib
import html
import json
import re
import time
from typing import Any
from urllib.parse import quote_plus
from urllib.request import Request, urlopen


@dataclass
class ExampleDesign:
    """A design available from an external source."""
    
    id: str
    title: str
    source: str  # "makerworld", "printables", "thingiverse", "thangs"
    url: str
    image_url: str | None
    category: str
    tags: list[str]
    popularity: int  # 0-100 score
    description: str | None
    created_at: datetime | None
    downloads: int = 0
    likes: int = 0
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "title": self.title,
            "source": self.source,
            "url": self.url,
            "image_url": self.image_url,
            "category": self.category,
            "tags": self.tags,
            "popularity": self.popularity,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "downloads": self.downloads,
            "likes": self.likes,
        }


class DesignProvider(ABC):
    """Abstract base class for design providers."""
    
    @abstractmethod
    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search for designs matching the query.
        
        Args:
            query: Search string (e.g., "phone stand")
            limit: Maximum number of results
            
        Returns:
            List of matching designs, ordered by relevance/popularity
        """
        pass
    
    @abstractmethod
    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        """Get popular designs in a category.
        
        Args:
            category: Design category
            limit: Maximum number of results
            
        Returns:
            List of popular designs
        """
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if provider is available (API accessible, etc.)."""
        pass
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of this provider."""
        pass


_SEARCH_CACHE: dict[tuple[str, str, int], tuple[float, list[ExampleDesign]]] = {}
_CACHE_TTL_SECONDS = 600.0


def _fetch_text(url: str, timeout: float = 8.0) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; CadioBot/1.0; "
                "+https://cadio-ai-cad-production.up.railway.app)"
            )
        },
    )
    with urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8", errors="replace")


def _stable_id(source: str, url: str) -> str:
    digest = hashlib.sha1(f"{source}:{url}".encode("utf-8")).hexdigest()[:12]
    return f"{source}-{digest}"


def _walk_json(value: Any):
    yield value
    if isinstance(value, dict):
        for child in value.values():
            yield from _walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_json(child)


def _popularity(likes: int, downloads: int, rating: float) -> int:
    score = min(100.0, likes / 15.0 + downloads / 120.0 + rating * 8.0)
    return int(round(score))


class MakerworldProvider(DesignProvider):
    """MakerWorld design provider.

    MakerWorld currently presents a Cloudflare challenge to server-side
    requests in Railway-like environments, so this provider reports
    unavailable instead of returning guessed data.
    """
    
    def __init__(self):
        self._available = False
        # Future: Initialize API client
    
    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search Makerworld for designs."""
        return []
    
    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        """Get popular Makerworld designs."""
        # TODO: Implement Makerworld API integration
        return []
    
    def is_available(self) -> bool:
        """Check Makerworld availability."""
        return self._available
    
    @property
    def provider_name(self) -> str:
        return "Makerworld"


class PrintablesProvider(DesignProvider):
    """Printables design provider (Prusa's printable designs)."""
    
    def __init__(self):
        self._available = True
    
    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search Printables for designs."""
        cache_key = ("printables", query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return list(cached[1])

        url = f"https://www.printables.com/search/models?q={quote_plus(query)}"
        try:
            page = _fetch_text(url)
        except Exception:
            return []
        results = self._parse_search_page(page, limit)
        _SEARCH_CACHE[cache_key] = (time.time(), results)
        return list(results)
    
    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        """Get popular Printables designs."""
        return self.search(category, limit)
    
    def is_available(self) -> bool:
        """Check Printables availability."""
        return self._available
    
    @property
    def provider_name(self) -> str:
        return "Printables"

    def _parse_search_page(self, page: str, limit: int) -> list[ExampleDesign]:
        body_values: list[Any] = []
        for match in re.finditer(
            r'<script[^>]+data-sveltekit-fetched[^>]*>(.*?)</script>',
            page,
            re.DOTALL,
        ):
            try:
                wrapper = json.loads(html.unescape(match.group(1)))
                body = wrapper.get("body")
                if isinstance(body, str):
                    body_values.append(json.loads(body))
            except Exception:
                continue

        raw_items: dict[str, dict[str, Any]] = {}
        for body in body_values:
            for node in _walk_json(body):
                if not isinstance(node, dict):
                    continue
                if node.get("__typename") != "PrintType":
                    continue
                name = node.get("name")
                slug = node.get("slug")
                model_id = node.get("id")
                if not name or not slug or not model_id:
                    continue
                raw_items[str(model_id)] = node

        results: list[ExampleDesign] = []
        for item in raw_items.values():
            model_id = str(item["id"])
            slug = str(item["slug"])
            likes = int(item.get("likesCount") or 0)
            downloads = int(item.get("downloadCount") or 0)
            try:
                rating = float(item.get("ratingAvg") or 0.0)
            except (TypeError, ValueError):
                rating = 0.0
            category = "3D Model"
            cat = item.get("category")
            if isinstance(cat, dict):
                path = cat.get("path")
                if isinstance(path, list) and path:
                    last = path[-1]
                    if isinstance(last, dict):
                        category = str(last.get("nameEn") or last.get("name") or category)

            image_url = None
            image = item.get("image")
            if isinstance(image, dict) and image.get("filePath"):
                image_url = f"https://media.printables.com/{image['filePath']}"

            url = f"https://www.printables.com/model/{model_id}-{slug}"
            results.append(
                ExampleDesign(
                    id=_stable_id("printables", url),
                    title=str(item["name"]),
                    source="printables",
                    url=url,
                    image_url=image_url,
                    category=category,
                    tags=_title_tags(str(item["name"])),
                    popularity=_popularity(likes, downloads, rating),
                    description=None,
                    created_at=_parse_date(item.get("datePublished")),
                    downloads=downloads,
                    likes=likes,
                )
            )

        results.sort(key=lambda d: (d.popularity, d.likes, d.downloads), reverse=True)
        return results[:limit]


class ThingiverseProvider(DesignProvider):
    """Thingiverse design provider."""
    
    def __init__(self):
        self._available = False
        # Future: Initialize API client
    
    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search Thingiverse for designs."""
        # TODO: Implement Thingiverse API integration
        return []
    
    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        """Get popular Thingiverse designs."""
        # TODO: Implement Thingiverse API integration
        return []
    
    def is_available(self) -> bool:
        """Check Thingiverse availability."""
        return self._available
    
    @property
    def provider_name(self) -> str:
        return "Thingiverse"


class ThangsProvider(DesignProvider):
    """Thangs design provider."""
    
    def __init__(self):
        self._available = False
        # Future: Initialize API client
    
    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search Thangs for designs."""
        # TODO: Implement Thangs API integration
        return []
    
    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        """Get popular Thangs designs."""
        # TODO: Implement Thangs API integration
        return []
    
    def is_available(self) -> bool:
        """Check Thangs availability."""
        return self._available
    
    @property
    def provider_name(self) -> str:
        return "Thangs"


class ProviderRegistry:
    """Central registry for design providers."""
    
    def __init__(self):
        self.providers: dict[str, DesignProvider] = {
            "makerworld": MakerworldProvider(),
            "printables": PrintablesProvider(),
            "thingiverse": ThingiverseProvider(),
            "thangs": ThangsProvider(),
        }
    
    def search_all(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search all available providers."""
        results: list[ExampleDesign] = []
        for provider in self.providers.values():
            if provider.is_available():
                results.extend(provider.search(query, limit))
        
        # Sort by popularity descending
        results.sort(key=lambda d: d.popularity, reverse=True)
        return results[:limit]
    
    def get_popular_all(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        """Get popular designs from all available providers."""
        results: list[ExampleDesign] = []
        for provider in self.providers.values():
            if provider.is_available():
                results.extend(provider.get_popular(category, limit))
        
        results.sort(key=lambda d: d.popularity, reverse=True)
        return results[:limit]
    
    def get_provider(self, name: str) -> DesignProvider | None:
        """Get a specific provider by name."""
        return self.providers.get(name.lower())

    def status(self) -> dict[str, dict[str, Any]]:
        """Return provider availability for API/debug surfaces."""
        return {
            name: {
                "name": provider.provider_name,
                "available": provider.is_available(),
            }
            for name, provider in self.providers.items()
        }


# Global provider registry instance
_provider_registry: ProviderRegistry | None = None


def get_provider_registry() -> ProviderRegistry:
    """Get or create the global provider registry."""
    global _provider_registry
    if _provider_registry is None:
        _provider_registry = ProviderRegistry()
    return _provider_registry


def _parse_date(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _title_tags(title: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", title.lower())
    useful = [
        word
        for word in words
        if len(word) > 2 and word not in {"the", "and", "for", "with", "stand"}
    ]
    return useful[:12]
