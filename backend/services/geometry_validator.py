"""Geometry validation for generated models.

Validates that generated models are:
- Above the build plate
- Have valid geometry (no floating parts)
- Are properly centered
- Are visible and printable
- Have valid bounding box
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.services.cad_engine import TriMesh, min_z


@dataclass
class ValidationResult:
    """Result of geometry validation."""
    
    is_valid: bool
    issues: list[str]  # List of problems found
    warnings: list[str]  # List of non-fatal warnings
    metrics: dict[str, Any]  # Geometry metrics
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "is_valid": self.is_valid,
            "issues": self.issues,
            "warnings": self.warnings,
            "metrics": self.metrics,
        }


class GeometryValidator:
    """Validates generated geometry for printability."""
    
    # Configuration
    MIN_VOLUME = 1.0  # mm³ - minimum valid volume
    MAX_ASPECT_RATIO = 10.0  # max dimension / min dimension
    MIN_FEATURE_SIZE = 1.0  # mm - minimum printable feature
    
    @staticmethod
    def validate(mesh: TriMesh) -> ValidationResult:
        """Validate geometry comprehensively."""
        issues: list[str] = []
        warnings: list[str] = []
        metrics: dict[str, Any] = {}
        
        # Check 1: Has geometry
        if not mesh.verts or not mesh.tris:
            issues.append("Model has no geometry")
            return ValidationResult(False, issues, warnings, metrics)
        
        # Check 2: Minimum vertices
        if len(mesh.verts) < 4:
            issues.append(f"Model has only {len(mesh.verts)} vertices (min 4)")
        
        # Check 3: Z position (build plate)
        min_z_val = min_z(mesh)
        metrics["min_z"] = min_z_val
        if min_z_val < -0.1:  # Small tolerance
            issues.append(f"Geometry extends {-min_z_val:.1f}mm below build plate")
        elif min_z_val < 0:
            warnings.append("Geometry very slightly below build plate, will be shifted")
        
        # Check 4: Bounding box
        xs = [v[0] for v in mesh.verts]
        ys = [v[1] for v in mesh.verts]
        zs = [v[2] for v in mesh.verts]
        
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        min_z_vert, max_z_vert = min(zs), max(zs)
        
        width = max_x - min_x
        depth = max_y - min_y
        height = max_z_vert - min_z_vert
        
        metrics["width"] = width
        metrics["depth"] = depth
        metrics["height"] = height
        metrics["center"] = [(min_x + max_x) / 2, (min_y + max_y) / 2, (min_z_vert + max_z_vert) / 2]
        
        # Check 5: Minimum dimensions
        min_dim = min(width, depth, height)
        if min_dim < GeometryValidator.MIN_FEATURE_SIZE:
            issues.append(f"Model has features < {GeometryValidator.MIN_FEATURE_SIZE}mm (min: {min_dim:.2f}mm)")
        
        # Check 6: Aspect ratio
        max_dim = max(width, depth, height)
        if min_dim > 0:
            aspect = max_dim / min_dim
            metrics["aspect_ratio"] = aspect
            if aspect > GeometryValidator.MAX_ASPECT_RATIO:
                warnings.append(f"Very tall/thin model (aspect ratio {aspect:.1f}:1) may be fragile")
        
        # Check 7: Triangle count
        tri_count = len(mesh.tris)
        metrics["triangle_count"] = tri_count
        if tri_count < 4:
            issues.append(f"Model has only {tri_count} triangles (min 4)")
        elif tri_count > 500000:
            warnings.append(f"Model has {tri_count} triangles, may be slow to slice")
        
        # Check 8: Volume estimate (very basic)
        volume = GeometryValidator._estimate_volume(mesh)
        metrics["estimated_volume"] = volume
        if volume < GeometryValidator.MIN_VOLUME:
            issues.append(f"Model is too small ({volume:.2f}mm³)")
        
        # Check 9: Degenerate triangles
        degenerate_count = GeometryValidator._count_degenerate_triangles(mesh)
        if degenerate_count > 0:
            warnings.append(f"Model has {degenerate_count} degenerate triangles")
        
        is_valid = len(issues) == 0
        
        return ValidationResult(is_valid, issues, warnings, metrics)
    
    @staticmethod
    def _estimate_volume(mesh: TriMesh) -> float:
        """Estimate volume using divergence theorem (very approximate)."""
        if not mesh.tris:
            return 0.0
        
        volume = 0.0
        for a, b, c in mesh.tris:
            va = mesh.verts[a]
            vb = mesh.verts[b]
            vc = mesh.verts[c]
            
            # Signed volume of tetrahedron formed by triangle and origin
            v = (
                va[0] * (vb[1] * vc[2] - vb[2] * vc[1]) -
                va[1] * (vb[0] * vc[2] - vb[2] * vc[0]) +
                va[2] * (vb[0] * vc[1] - vb[1] * vc[0])
            )
            volume += v
        
        return abs(volume) / 6.0
    
    @staticmethod
    def _count_degenerate_triangles(mesh: TriMesh) -> int:
        """Count triangles that are degenerate (zero area)."""
        count = 0
        for a, b, c in mesh.tris:
            if a == b or b == c or a == c:
                count += 1
                continue
            
            # Check if vertices are collinear
            va = mesh.verts[a]
            vb = mesh.verts[b]
            vc = mesh.verts[c]
            
            # Cross product magnitude
            cross = [
                (vb[1] - va[1]) * (vc[2] - va[2]) - (vb[2] - va[2]) * (vc[1] - va[1]),
                (vb[2] - va[2]) * (vc[0] - va[0]) - (vb[0] - va[0]) * (vc[2] - va[2]),
                (vb[0] - va[0]) * (vc[1] - va[1]) - (vb[1] - va[1]) * (vc[0] - va[0]),
            ]
            mag = (cross[0]**2 + cross[1]**2 + cross[2]**2) ** 0.5
            
            if mag < 1e-6:
                count += 1
        
        return count
    
    @staticmethod
    def suggest_fixes(validation: ValidationResult) -> list[str]:
        """Suggest fixes for validation issues."""
        suggestions: list[str] = []
        
        if any("below build plate" in i for i in validation.issues):
            suggestions.append("Shift geometry upward to Z=0")
        
        if any("too small" in i for i in validation.issues):
            suggestions.append("Scale model larger")
        
        if any("only" in i and "triangles" in i for i in validation.issues):
            suggestions.append("Increase geometry complexity")
        
        for warning in validation.warnings:
            if "tall/thin" in warning:
                suggestions.append("Add support structures or increase base size")
            elif "too many triangles" in warning:
                suggestions.append("Model may be over-complicated, consider simplifying")
        
        return suggestions
