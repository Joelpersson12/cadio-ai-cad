"""Shared source-search context for model generation.

The generation route, source importer, and research brief all need the same
view of public model search results.  Keeping that context in one place makes
the pipeline faster and prevents one layer from choosing a different intent
than the next layer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from backend.services.design_providers import ExampleDesign
from backend.services.prompt_translation import normalize_source_query


@dataclass
class ModelSourceContext:
    prompt: str
    normalized_query: str
    examples: list[ExampleDesign] = field(default_factory=list)
    research_brief: dict[str, Any] = field(default_factory=dict)

    @property
    def printables_examples(self) -> list[ExampleDesign]:
        return [example for example in self.examples if example.source == "printables"]

    @property
    def has_external_signal(self) -> bool:
        return bool(self.examples)


def build_model_source_context(prompt: str, *, limit: int = 12) -> ModelSourceContext:
    """Search public model sources once and build a source-informed brief."""
    normalized_query = normalize_source_query(prompt)
    examples: list[ExampleDesign] = []

    try:
        from backend.services.provider_extensions import get_extended_provider_registry

        examples = get_extended_provider_registry().search_all(prompt, limit=limit)
    except Exception:
        examples = []

    try:
        from backend.services.design_brief import build_design_brief

        brief = build_design_brief(prompt, limit=min(limit, 6), examples=examples)
    except Exception:
        brief = {}

    return ModelSourceContext(
        prompt=prompt,
        normalized_query=normalized_query,
        examples=examples,
        research_brief=brief,
    )
