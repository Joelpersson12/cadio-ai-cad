"""Design provider interfaces for external design sources.

This module defines the architecture for integrating with external design
repositories like Makerworld, Printables, Thingiverse, and Thangs.

Current implementation: No actual scraping - structure only.
Future implementation: Call provider APIs to fetch popular designs.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any


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


class MakerworldProvider(DesignProvider):
    """Makerworld design provider (Prusa's platform)."""
    
    def __init__(self):
        self._available = False
        # Future: Initialize API client
    
    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search Makerworld for designs."""
        # TODO: Implement Makerworld API integration
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
        self._available = False
        # Future: Initialize API client
    
    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search Printables for designs."""
        # TODO: Implement Printables API integration
        return []
    
    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        """Get popular Printables designs."""
        # TODO: Implement Printables API integration
        return []
    
    def is_available(self) -> bool:
        """Check Printables availability."""
        return self._available
    
    @property
    def provider_name(self) -> str:
        return "Printables"


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


# Global provider registry instance
_provider_registry: ProviderRegistry | None = None


def get_provider_registry() -> ProviderRegistry:
    """Get or create the global provider registry."""
    global _provider_registry
    if _provider_registry is None:
        _provider_registry = ProviderRegistry()
    return _provider_registry
