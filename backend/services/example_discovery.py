"""Example discovery system for inspiration-based generation.

When a user enters a prompt like "Phone Stand", this system:
1. Finds relevant examples from templates and providers
2. Returns them for user selection
3. Uses selected example to influence CAD generation
"""

from __future__ import annotations

from typing import Any

from backend.services.design_providers import ExampleDesign, get_provider_registry
from backend.services.product_templates import PRODUCT_TEMPLATES, ProductTemplate


class ExampleDiscovery:
    """Example discovery and matching system."""
    
    @staticmethod
    def discover_examples(prompt: str, include_external: bool = False) -> dict[str, Any]:
        """Discover examples matching a prompt.
        
        Args:
            prompt: User's natural language input (e.g., "Phone Stand")
            include_external: Whether to search external providers (slow)
            
        Returns:
            Dict with template-based and optionally external examples
        """
        result: dict[str, Any] = {
            "template": None,
            "template_examples": [],
            "external_examples": [],
            "matching_templates": [],
            "provider_status": {},
        }
        
        # Find matching template
        matching_template = ExampleDiscovery._find_template(prompt)
        result["template"] = (
            ExampleDiscovery._template_to_dict(matching_template)
            if matching_template
            else None
        )
        
        # Generate template-based examples
        if matching_template:
            result["template_examples"] = ExampleDiscovery._generate_template_examples(
                matching_template
            )
            result["matching_templates"] = [
                t.name for t in PRODUCT_TEMPLATES.values()
                if t.category == matching_template.category
            ]
        
        # Search external providers (optional, slower)
        if include_external:
            registry = get_provider_registry()
            result["provider_status"] = registry.status()
            external = registry.search_all(prompt, limit=4)
            result["external_examples"] = [ex.to_dict() for ex in external]
        
        return result

    @staticmethod
    def _template_to_dict(template: ProductTemplate) -> dict[str, Any]:
        """Serialize a product template without its geometry function."""
        return {
            "name": template.name,
            "category": template.category,
            "description": template.description,
            "default_params": template.default_params,
            "default_features": template.default_features,
        }
    
    @staticmethod
    def _find_template(prompt: str) -> ProductTemplate | None:
        """Find the best matching template for a prompt."""
        prompt_lower = prompt.lower().strip()
        
        # Direct name match
        for template in PRODUCT_TEMPLATES.values():
            if template.name.lower() in prompt_lower:
                return template
        
        # Keyword match
        keywords = {
            "phone": "phone_stand",
            "tablet": "tablet_stand",
            "headphone": "headphone_stand",
            "cable": "cable_organizer",
            "storage": "storage_bin",
            "hook": "wall_hook",
            "shelf": "shelf_bracket",
            "stand": "phone_stand",  # Default
            "organizer": "cable_organizer",
            "bin": "storage_bin",
        }
        
        for keyword, template_key in keywords.items():
            if keyword in prompt_lower:
                return PRODUCT_TEMPLATES.get(template_key)
        
        # No match - return first template as default
        return next(iter(PRODUCT_TEMPLATES.values())) if PRODUCT_TEMPLATES else None
    
    @staticmethod
    def _generate_template_examples(template: ProductTemplate) -> list[dict[str, Any]]:
        """Generate realistic example variations from a template.
        
        These are variations that can be produced from the same template
        with different parameters, representing different styles/sizes.
        """
        examples = []
        
        # Variant 1: Minimal/compact
        examples.append({
            "name": f"Minimal {template.name}",
            "description": f"Compact, space-saving variant",
            "params_override": {
                k: v * 0.7 for k, v in template.default_params.items()
                if k in ["width", "depth", "height"]
            },
            "prompt_hint": f"compact {template.name.lower()}",
        })
        
        # Variant 2: Deluxe/larger
        examples.append({
            "name": f"Deluxe {template.name}",
            "description": f"Premium, larger variant with more features",
            "params_override": {
                k: v * 1.3 for k, v in template.default_params.items()
                if k in ["width", "depth", "height"]
            },
            "prompt_hint": f"large {template.name.lower()}",
        })
        
        # Variant 3: Adjustable
        examples.append({
            "name": f"Adjustable {template.name}",
            "description": f"Flexible variant with multiple angle options",
            "params_override": {"angle": template.default_params.get("angle", 45) + 10},
            "prompt_hint": f"adjustable {template.name.lower()}",
        })
        
        # Variant 4: Heavy-duty
        examples.append({
            "name": f"Heavy-Duty {template.name}",
            "description": f"Reinforced variant for heavy loads",
            "params_override": {
                "thickness": template.default_params.get("thickness", 4) * 1.5
            },
            "prompt_hint": f"strong {template.name.lower()}",
        })
        
        return examples
    
    @staticmethod
    def get_next_examples(
        category: str,
        current_index: int = 0,
    ) -> list[dict[str, Any]]:
        """Get next set of examples in a category (pagination)."""
        matching = [t for t in PRODUCT_TEMPLATES.values() if t.category == category]
        if not matching:
            return []
        
        # Cycle through examples
        template = matching[current_index % len(matching)]
        return ExampleDiscovery._generate_template_examples(template)
    
    @staticmethod
    def evaluate_prompt_relevance(prompt: str, threshold: float = 0.5) -> float:
        """Rate how well we can match a prompt (0.0-1.0)."""
        prompt_lower = prompt.lower()
        
        # Perfect match (1.0)
        for template in PRODUCT_TEMPLATES.values():
            if template.name.lower() == prompt_lower:
                return 1.0
        
        # Strong match (0.8-0.9)
        for template in PRODUCT_TEMPLATES.values():
            if template.name.lower() in prompt_lower:
                return 0.9
        
        # Keyword match (0.6-0.8)
        keywords = {
            "phone", "tablet", "headphone", "cable", "storage",
            "hook", "shelf", "stand", "organizer", "bin"
        }
        for keyword in keywords:
            if keyword in prompt_lower:
                return 0.7
        
        # Weak match - probably generic CAD request
        return threshold
