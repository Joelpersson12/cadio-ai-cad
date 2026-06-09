"""Design provider interfaces for external design sources.

Providers return titles, source URLs, images, popularity signals, and when a
site exposes public model files, file manifests that can seed Cadio with a
real source mesh before falling back to generated CAD.
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

from backend.services.prompt_translation import normalize_source_query


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


@dataclass
class SourceModelFile:
    """A real file listed by an external source model page."""

    id: str
    name: str
    source: str
    file_type: str
    file_size: int
    preview_url: str | None
    download_url: str | None
    order: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "source": self.source,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "preview_url": self.preview_url,
            "download_url": self.download_url,
            "order": self.order,
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
_FILE_CACHE: dict[str, tuple[float, list[SourceModelFile]]] = {}
_MODEL_META_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
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


def _media_url(path: Any) -> str | None:
    if not isinstance(path, str) or not path:
        return None
    if path.startswith("http"):
        return path
    return f"https://media.printables.com/{path.lstrip('/')}"


def _plain_text(value: Any) -> str:
    if not isinstance(value, str) or not value:
        return ""
    text = html.unescape(value)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s+", "\n", text)
    return text.strip()


def _numeric_values(value: Any) -> list[float]:
    values: list[float] = []
    if value is None:
        return values
    if isinstance(value, (int, float)):
        return [float(value)]
    if isinstance(value, str):
        for match in re.finditer(r"\d+(?:[.,]\d+)?", value):
            values.append(float(match.group(0).replace(",", ".")))
        return values
    if isinstance(value, dict):
        for key in ("value", "height", "diameter", "mm", "amount", "name"):
            values.extend(_numeric_values(value.get(key)))
        return values
    if isinstance(value, list):
        for item in value:
            values.extend(_numeric_values(item))
    return values


def _name_values(value: Any) -> list[str]:
    names: list[str] = []
    if value is None:
        return names
    if isinstance(value, str):
        clean = _plain_text(value)
        return [clean] if clean else []
    if isinstance(value, dict):
        for key in ("name", "label", "value", "material", "title", "publicUsername", "handle"):
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                names.append(_plain_text(item))
        return names
    if isinstance(value, list):
        for item in value:
            names.extend(_name_values(item))
    seen: set[str] = set()
    unique: list[str] = []
    for name in names:
        key = name.lower()
        if key and key not in seen:
            seen.add(key)
            unique.append(name)
    return unique


def _duration_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    if isinstance(value, dict):
        for key in ("text", "display", "formatted", "name"):
            text = value.get(key)
            if isinstance(text, str) and text.strip():
                return text.strip()
        for key in ("seconds", "duration", "value"):
            text = _duration_text(value.get(key))
            if text:
                return text
        return None
    if isinstance(value, (int, float)):
        seconds = int(value)
        if seconds <= 0:
            return None
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        if hours and minutes:
            return f"{hours}h {minutes}m"
        if hours:
            return f"{hours}h"
        return f"{minutes}m"
    return None


def _extract_text_print_settings(text: str) -> dict[str, Any]:
    lower = text.lower()
    fields: dict[str, Any] = {}
    notes: list[str] = []

    material_hits = []
    for material in ("PLA", "PETG", "ABS", "ASA", "TPU", "NYLON"):
        if re.search(rf"\b{material.lower()}\b", lower):
            material_hits.append(material)
    if material_hits:
        fields["material"] = ", ".join(material_hits)

    patterns: list[tuple[str, str]] = [
        ("layer_height_mm", r"(?:layer\s*height|layer|resolution)[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*mm"),
        ("infill_percent", r"(?:infill|fill)[^\d]{0,20}(\d{1,3})\s*%"),
        ("infill_percent", r"(\d{1,3})\s*%\s*(?:infill|fill)"),
        ("nozzle_temp_c", r"(?:nozzle|hotend|extruder)[^\d]{0,24}(\d{3})\s*(?:c|°c)?"),
        ("bed_temp_c", r"(?:bed|build\s*plate)[^\d]{0,24}(\d{2,3})\s*(?:c|°c)?"),
        ("scale_percent", r"(?:scale|skal)[^\d]{0,24}(\d{2,3})\s*%"),
        ("wall_count", r"(?:walls?|perimeters?)[^\d]{0,24}(\d{1,2})"),
    ]
    for key, pattern in patterns:
        if key in fields:
            continue
        match = re.search(pattern, lower, re.I)
        if match:
            number = float(match.group(1).replace(",", "."))
            fields[key] = int(number) if number.is_integer() else number

    if re.search(r"\b(no|without|support[- ]?free)\s+supports?\b|\bno support\b", lower):
        fields["supports"] = "No supports"
    elif re.search(r"\b(supports?\s+(required|needed|recommended)|needs?\s+supports?)\b", lower):
        fields["supports"] = "Supports recommended"
    elif "support" in lower:
        fields["supports"] = "Check model notes"

    if "brim" in lower:
        fields["adhesion"] = "Brim"
    elif "raft" in lower:
        fields["adhesion"] = "Raft"

    for sentence in re.split(r"(?<=[.!?])\s+", text):
        clean = sentence.strip()
        if len(clean) < 8:
            continue
        if any(word in clean.lower() for word in ("print", "support", "infill", "layer", "material", "scale", "brim", "raft")):
            notes.append(clean[:220])
        if len(notes) >= 3:
            break

    return {"fields": fields, "notes": notes}


def _printables_download_url(preview_path: Any, name: str) -> str | None:
    if not isinstance(preview_path, str) or "/stls/" not in preview_path or not name:
        return None
    folder = preview_path.rsplit("/", 1)[0]
    filename = re.sub(r"\s+", "-", name.strip()).lower()
    return f"https://files.printables.com/{folder.lstrip('/')}/{filename}"


def _printables_graphql_download_url(model_id: str, file_id: str, file_type: str) -> str | None:
    if not model_id or not file_id or file_type != "stl":
        return None
    payload = json.dumps(
        {
            "query": (
                "mutation GetDownloadLink($id: ID!, $modelId: ID!, $fileType: DownloadFileTypeEnum!, "
                "$source: DownloadSourceEnum!) { getDownloadLink(id: $id, printId: $modelId, "
                "fileType: $fileType, source: $source) { ok output { link ttl count } errors { field messages } } }"
            ),
            "variables": {
                "id": str(file_id),
                "modelId": str(model_id),
                "fileType": "stl",
                "source": "model_detail",
            },
        }
    ).encode("utf-8")
    req = Request(
        "https://api.printables.com/graphql/",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (compatible; CadioBot/1.0; "
                "+https://cadio-ai-cad-production.up.railway.app)"
            ),
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=8.0) as res:
            data = json.loads(res.read().decode("utf-8", errors="replace"))
    except Exception:
        return None
    link = (
        data.get("data", {})
        .get("getDownloadLink", {})
        .get("output", {})
        .get("link")
    )
    return str(link) if isinstance(link, str) and link.startswith("http") else None


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


_SOURCE_WEIGHTS = {
    "printables": 22,
    "cults3d": 15,
    "myminifactory": 14,
    "thingiverse": 16,
    "stlfinder": 10,
    "yeggi": 9,
    "makerworld": 18,
    "thangs": 14,
}

_BAD_TITLE_WORDS = {
    "login",
    "sign up",
    "privacy",
    "terms",
    "advertise",
    "cookie",
    "settings",
    "next",
    "previous",
}

_BAD_URL_FRAGMENTS = (
    "/login",
    "/signup",
    "/privacy",
    "/terms",
    "/about",
    "/contact",
    "/search?",
    "/tags/",
    "/collections/",
    "/users/",
    "/makes/",
)

_QUERY_STOP_WORDS = {
    "with",
    "and",
    "the",
    "for",
    "from",
    "that",
    "this",
    "into",
    "onto",
    "under",
    "over",
    "med",
    "och",
    "till",
    "att",
    "som",
    "det",
    "den",
}

_VEHICLE_BRANDS = {
    "honda",
    "yamaha",
    "kawasaki",
    "suzuki",
    "ktm",
    "husqvarna",
    "gasgas",
    "beta",
    "sherco",
    "bmw",
    "toyota",
    "volvo",
    "ford",
    "tesla",
    "audi",
    "vw",
    "volkswagen",
}

_POWER_TOOL_BRANDS = {
    "dewalt",
    "makita",
    "milwaukee",
    "ryobi",
    "bosch",
    "metabo",
    "festool",
    "hilti",
    "ridgid",
}

_VEHICLE_WORDS = {
    "dirtbike",
    "motocross",
    "motorcycle",
    "bike",
    "atv",
    "quad",
    "scooter",
    "moped",
    "car",
    "truck",
}

_PART_WORDS = {
    "chain",
    "guide",
    "fork",
    "seal",
    "swingarm",
    "brake",
    "caliper",
    "axle",
    "wheel",
    "bearing",
    "spacer",
    "bushing",
    "guard",
    "cover",
    "bracket",
    "mount",
    "adapter",
    "holder",
    "clip",
    "tool",
    "tools",
    "jig",
    "fixture",
    "accessory",
    "accessories",
}

_MODEL_TOKEN_RE = re.compile(r"^[a-z]{1,5}\d{2,4}[a-z0-9]*$")


def _vehicle_context_words(core_words: list[str]) -> list[str]:
    contextual: list[str] = []
    for word in core_words:
        if (
            word in _VEHICLE_BRANDS
            or word in _VEHICLE_WORDS
            or word in _PART_WORDS
            or _MODEL_TOKEN_RE.match(word)
            or re.fullmatch(r"(?:19|20)\d{2}", word)
        ):
            contextual.append(word)
    return contextual


def _clean_title(text: str) -> str:
    title = re.sub(r"<[^>]+>", " ", html.unescape(text))
    title = re.sub(r"\s+", " ", title).strip()
    title = re.sub(r"^(free|download|3d model)\s+", "", title, flags=re.I).strip()
    return title


def _looks_like_model_url(source: str, url: str, title: str) -> bool:
    lower_url = url.lower()
    lower_title = title.lower()
    if len(title) < 4 or any(word in lower_title for word in _BAD_TITLE_WORDS):
        return False
    if any(fragment in lower_url for fragment in _BAD_URL_FRAGMENTS):
        return False
    if source == "thingiverse":
        return "/thing:" in lower_url or "/thing/" in lower_url
    if source == "printables":
        return "/model/" in lower_url
    if source == "cults3d":
        return "/3d-model/" in lower_url or "/en/model/" in lower_url
    if source == "myminifactory":
        return "/object/3d-print-" in lower_url or "/objects/3d-print-" in lower_url
    if source == "stlfinder":
        return any(fragment in lower_url for fragment in ("/3dmodels/", "/model/", "/thing:", "/thing/"))
    if source == "yeggi":
        return any(fragment in lower_url for fragment in ("/q/", "/3d-model/", "/models/", "/thing:", "/model/"))
    return True


def _query_words(query: str) -> list[str]:
    query = normalize_source_query(query)
    base = [
        w
        for w in re.findall(r"[a-z0-9]+", query.lower())
        if len(w) > 2 and w not in _QUERY_STOP_WORDS
    ]
    aliases = {
        "phone": ["mobile", "smartphone"],
        "mobile": ["phone", "smartphone"],
        "cup": ["mug"],
        "mug": ["cup"],
        "headset": ["headphone", "headphones"],
        "headphone": ["headset", "headphones"],
        "battery": ["batteries", "pack"],
        "batteries": ["battery", "pack"],
        "holder": ["mount", "bracket", "rack"],
        "mount": ["holder", "bracket"],
        "desk": ["clamp"],
        "table": ["desk"],
        "wall": ["mount"],
        "dewalt": ["power", "tool"],
        "stand": ["holder", "dock"],
        "clip": ["clamp", "holder"],
        "organizer": ["holder", "storage"],
        "case": ["box", "cover"],
        "box": ["case", "enclosure"],
        "dirtbike": ["motocross", "motorcycle"],
        "motocross": ["dirtbike", "motorcycle"],
        "motorcycle": ["dirtbike", "motocross"],
        "fork": ["suspension"],
        "chain": ["chainguide", "guide"],
        "guide": ["guard", "slider"],
        "powerwasher": ["pressure", "washer"],
        "pressure": ["powerwasher"],
        "washer": ["powerwasher"],
        "accessory": ["adapter", "nozzle", "holder"],
        "accessories": ["adapter", "nozzle", "holders"],
        "tool": ["jig", "fixture", "wrench"],
        "tools": ["jig", "fixture", "wrench"],
    }
    words: list[str] = []
    for word in base:
        if word not in words:
            words.append(word)
        for alias in aliases.get(word, []):
            if alias not in words:
                words.append(alias)
    return words


def _query_variants(query: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", normalize_source_query(query).strip().lower())
    variants = [normalized] if normalized else []
    core_words = [
        word
        for word in re.findall(r"[a-z0-9]+", normalized)
        if len(word) > 2 and word not in _QUERY_STOP_WORDS
    ]
    cleaned = " ".join(core_words)
    words = set(_query_words(normalized))

    def add(value: str) -> None:
        value = re.sub(r"\s+", " ", value.strip().lower())
        if value and value not in variants:
            variants.append(value)

    add(cleaned)
    vehicle_context = _vehicle_context_words(core_words)
    vehicle_phrase = " ".join(vehicle_context)
    brand_words = [word for word in core_words if word in _VEHICLE_BRANDS]
    model_words = [word for word in core_words if _MODEL_TOKEN_RE.match(word)]
    year_words = [word for word in core_words if re.fullmatch(r"(?:19|20)\d{2}", word)]
    part_words = [word for word in core_words if word in _PART_WORDS]
    identity_words = brand_words + model_words + year_words
    product_phrase = " ".join(identity_words + part_words).strip() if identity_words else ""

    if _POWER_TOOL_BRANDS & words or {"battery", "batteries"} & words:
        brand = next((word for word in core_words if word in _POWER_TOOL_BRANDS), "power tool")
        add(f"{brand} battery holder wall mount")
        add(f"{brand} battery holder slide rail")
        add("power tool battery holder printable")
    if {"dirtbike", "motocross", "motorcycle", "bike"} & words or brand_words or model_words:
        seed = product_phrase or vehicle_phrase or cleaned or "dirtbike tool"
        add(f"{seed} 3d print")
        add(f"{seed} stl")
        add(f"{seed} printable")
        add(f"{seed} holder")
        add(f"{seed} bracket")
        if {"tool", "tools", "jig", "fixture"} & words:
            tool_seed = seed if re.search(r"\btools?\b", seed) else f"{seed} tool"
            add(tool_seed)
            if not re.search(r"\b(?:dirtbike|dirt bike|motocross|motorcycle)\b", tool_seed):
                add(f"dirt bike {tool_seed}")
                add(f"motorcycle {tool_seed} 3d print")
            else:
                add(f"{tool_seed} 3d print")
        if "fork" in words:
            add(seed if "fork" in seed and "tool" in seed else f"{seed} fork tool")
            add("dirt bike fork seal driver")
            add("motorcycle fork cap tool 3d print")
            add("fork seal bullet tool stl")
        if "chain" in words or "guide" in words or "guard" in words:
            model_seed = " ".join(brand_words + model_words + year_words).strip()
            add(f"{model_seed} chain guide" if model_seed else "dirt bike chain guide")
            add(f"{model_seed} chain guide stl" if model_seed else "motocross chain guide stl")
            add("dirt bike chain slider guide 3d print")
    if {"pressure", "powerwasher", "washer"} & words and {"accessory", "accessories", "adapter", "nozzle", "holder", "mount"} & words:
        add("pressure washer accessories 3d print")
        add("pressure washer nozzle holder stl")
        add("pressure washer adapter 3d print")
        add("power washer hose holder printable")
        add("pressure washer wand holder wall mount")
    if "desk" in words and {"holder", "mount", "bracket", "rack", "clamp"} & words:
        object_words = [
            word
            for word in core_words
            if word not in {"desk", "holder", "mount", "bracket", "rack", "clamp"}
        ]
        object_phrase = " ".join(object_words)
        if object_phrase:
            add(f"{object_phrase} holder desk mount")
            add(f"desk {object_phrase} holder")
            add(f"desk mount {object_phrase} holder")
            add(f"clamp on desk {object_phrase} holder")
    if {"phone", "mobile", "smartphone", "tablet"} & words and {"stand", "holder", "dock", "mount"} & words:
        add("foldable phone stand 3d print")
        add("phone tablet stand flat fold")
        add("popular phone stand printable")
        if "magsafe" in words or "charger" in words or "charging" in words:
            add("magsafe phone charger stand")
            add("iphone magsafe dock stand")
        if "rotating" in words or "rotatable" in words:
            add("rotating phone stand 3d print")
        if "vertical" in words:
            add("vertical phone stand printable")
        if "horizontal" in words:
            add("horizontal phone stand printable")
    if {"headset", "headphone", "headphones"} & words:
        add("headphone stand 3d print")
        add("headset holder printable")
    if {"cdi", "ecu", "ecm", "ignition", "module"} & words:
        add("electronics module bracket 3d print")
        add("cdi box holder bracket")
    if {"holder", "mount", "bracket", "rack", "stand", "clip", "organizer", "case", "box", "enclosure"} & words:
        object_words = [
            word
            for word in core_words
            if word not in {"holder", "mount", "bracket", "rack", "stand", "clip", "organizer", "case", "box", "enclosure", "wall", "mounted", "gridfinity", "pegboard", "magnetic"}
        ]
        object_phrase = " ".join(object_words) or normalized
        if "gridfinity" in words:
            add(f"gridfinity {object_phrase} holder")
            add(f"{object_phrase} gridfinity bin")
        if "pegboard" in words:
            add(f"pegboard {object_phrase} holder")
            add(f"{object_phrase} pegboard mount")
        if "magnetic" in words:
            add(f"magnetic {object_phrase} holder")
        if "wall" in words or "mounted" in words:
            add(f"wall mounted {object_phrase} holder")
            add(f"{object_phrase} wall mount")
        add(f"{normalized} 3d print")
        add(f"{normalized} 3d printable")
        add(f"{normalized} printable")
        add(f"{normalized} stl")
        add(f"popular {normalized} stl")
    elif normalized:
        add(f"{normalized} 3d print")
        add(f"{normalized} 3d printable")
        add(f"{normalized} 3d model")
        add(f"{normalized} stl")
        add(f"{normalized} printable")

    return variants[:18]


def _design_score(query: str, design: ExampleDesign) -> float:
    query = normalize_source_query(query)
    relevance = _query_relevance(query, design.title, design.tags)
    title = design.title.lower()
    words = [w for w in _query_words(query) if len(w) > 2]
    core_words = [
        w
        for w in re.findall(r"[a-z0-9]+", query.lower())
        if len(w) > 2 and w not in _QUERY_STOP_WORDS
    ]
    cleaned_phrase = " ".join(core_words)
    exact_phrase_bonus = 18.0 if query.strip().lower() in title else 0.0
    if cleaned_phrase and cleaned_phrase in title:
        exact_phrase_bonus += 56.0
    coverage = 0.0
    if words:
        hits = sum(1 for word in words if word in title or word in design.tags)
        coverage = hits / len(words)
    exact_coverage = 0.0
    missing_core = 0
    if core_words:
        exact_hits = sum(1 for word in core_words if _query_token_matches_title(word, title, design.tags))
        exact_coverage = exact_hits / len(core_words)
        missing_core = len(core_words) - exact_hits
    quality_penalty = 18.0 if any(word in title for word in _BAD_TITLE_WORDS) else 0.0
    required_penalty = missing_core * 18.0
    if "mount" in core_words and not _query_token_matches_title("mount", title, design.tags):
        required_penalty += 36.0
    if "desk" in core_words and not _query_token_matches_title("desk", title, design.tags):
        required_penalty += 24.0
    source_weight = _SOURCE_WEIGHTS.get(design.source, 6)
    popularity = min(100, design.popularity) * 0.85 + min(1000, design.likes) * 0.02 + min(10000, design.downloads) * 0.004
    return (
        relevance * 28.0
        + coverage * 22.0
        + exact_coverage * 42.0
        + exact_phrase_bonus
        + source_weight
        + popularity
        - quality_penalty
        - required_penalty
    )


def _query_token_matches_title(word: str, title: str, tags: list[str]) -> bool:
    haystack = set(re.findall(r"[a-z0-9]+", title.lower()) + tags)
    equivalents = {
        "phone": {"phone", "mobile", "smartphone", "iphone"},
        "cup": {"cup", "mug", "tumbler"},
        "mug": {"mug", "cup", "tumbler"},
        "holder": {"holder", "hold", "mount", "stand", "dock", "rack"},
        "stand": {"stand", "holder", "dock", "mount"},
        "mount": {"mount", "mounted", "clamp", "clip", "bracket", "holder"},
        "desk": {"desk", "table", "desktop", "clamp"},
        "case": {"case", "box", "enclosure", "cover"},
        "box": {"box", "case", "enclosure"},
        "organizer": {"organizer", "holder", "storage", "rack"},
        "clip": {"clip", "clamp", "holder"},
        "dirtbike": {"dirtbike", "dirt", "bike", "motorcycle", "motocross", "mx"},
        "motocross": {"dirtbike", "dirt", "bike", "motorcycle", "motocross", "mx"},
        "motorcycle": {"dirtbike", "dirt", "bike", "motorcycle", "motocross", "mx"},
        "fork": {"fork", "suspension", "seal", "driver", "cap"},
        "chain": {"chain", "chainguide", "guide", "slider"},
        "guide": {"guide", "guard", "slider", "chainguide"},
        "tool": {"tool", "tools", "jig", "fixture", "wrench", "driver"},
        "tools": {"tool", "tools", "jig", "fixture", "wrench", "driver"},
        "pressure": {"pressure", "powerwasher", "washer", "wash", "nozzle", "wand"},
        "washer": {"pressure", "powerwasher", "washer", "wash"},
        "powerwasher": {"pressure", "powerwasher", "washer", "wash"},
        "accessory": {"accessory", "accessories", "adapter", "mount", "holder", "nozzle"},
        "accessories": {"accessory", "accessories", "adapter", "mount", "holder", "nozzle"},
    }
    return bool((equivalents.get(word, {word}) & haystack) or any(term in title for term in equivalents.get(word, {word})))




def _generic_link_results(
    page: str,
    source: str,
    base_url: str,
    limit: int,
) -> list[ExampleDesign]:
    seen: set[str] = set()
    results: list[ExampleDesign] = []
    for href, text in re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', page, re.DOTALL | re.I):
        title = _clean_title(text)
        if href.startswith("/"):
            url = base_url.rstrip("/") + href
        elif href.startswith("//"):
            url = "https:" + href
        elif href.startswith("http"):
            url = href
        else:
            continue
        if not _looks_like_model_url(source, url, title):
            continue
        if url in seen:
            continue
        seen.add(url)
        results.append(
            ExampleDesign(
                id=_stable_id(source, url),
                title=title[:120],
                source=source,
                url=url,
                image_url=None,
                category="3D Model",
                tags=_title_tags(title),
                popularity=max(10, 80 - len(results) * 8),
                description=None,
                created_at=None,
            )
        )
        if len(results) >= limit:
            break
    return results


def resolve_printables_model_files(model_url: str, limit: int = 20) -> list[SourceModelFile]:
    """Read the public files tab for a Printables model.

    This resolves the file manifest only. Download links are generated by
    Printables at click time, so Cadio uses this as real source-file evidence
    and keeps geometry generation parametric unless a stable file URL is later
    available.
    """
    if "printables.com/model/" not in (model_url or ""):
        return []

    normalized = model_url.split("?")[0].rstrip("/")
    files_url = normalized if normalized.endswith("/files") else f"{normalized}/files"
    model_id_match = re.search(r"/model/(\d+)", normalized)
    model_id = model_id_match.group(1) if model_id_match else ""
    cache_key = files_url.lower()
    cached = _FILE_CACHE.get(cache_key)
    if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
        return list(cached[1])

    try:
        page = _fetch_text(files_url)
    except Exception:
        return []

    files: dict[str, SourceModelFile] = {}
    for match in re.finditer(
        r'<script[^>]+data-sveltekit-fetched[^>]*>(.*?)</script>',
        page,
        re.DOTALL,
    ):
        try:
            wrapper = json.loads(html.unescape(match.group(1)))
            body = wrapper.get("body")
            if not isinstance(body, str):
                continue
            payload = json.loads(body)
        except Exception:
            continue

        for node in _walk_json(payload):
            if not isinstance(node, dict):
                continue
            for list_key in ("stls", "slas", "otherFiles"):
                values = node.get(list_key)
                if not isinstance(values, list):
                    continue
                for item in values:
                    if not isinstance(item, dict):
                        continue
                    name = str(item.get("name") or "").strip()
                    file_id = str(item.get("id") or name)
                    if not name or not file_id:
                        continue
                    suffix = name.rsplit(".", 1)[-1].lower() if "." in name else list_key.rstrip("s")
                    download_url = _printables_download_url(item.get("filePreviewPath"), name)
                    if download_url is None and suffix == "stl":
                        download_url = _printables_graphql_download_url(model_id, file_id, suffix)
                    source_file = SourceModelFile(
                        id=file_id,
                        name=name,
                        source="printables",
                        file_type=suffix,
                        file_size=int(item.get("fileSize") or 0),
                        preview_url=_media_url(item.get("filePreviewPath")),
                        download_url=download_url,
                        order=int(item.get("order") or 0),
                    )
                    files[file_id] = source_file

    result = sorted(files.values(), key=lambda item: (item.order, item.name.lower()))[:limit]
    _FILE_CACHE[cache_key] = (time.time(), result)
    return list(result)


def resolve_printables_model_metadata(model_url: str) -> dict[str, Any]:
    """Read public Printables model metadata and creator print settings.

    Printables exposes structured fields for some models (material, layer
    heights, nozzle diameters, printer, duration) and many creators instead
    write settings in the description.  This returns both, with a clear source
    marker so Cadio can show them separately from its own slicer fallback.
    """
    if "printables.com/model/" not in (model_url or ""):
        return {}

    normalized = model_url.split("?")[0].rstrip("/")
    normalized = normalized.removesuffix("/files")
    cache_key = normalized.lower()
    cached = _MODEL_META_CACHE.get(cache_key)
    if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
        return dict(cached[1])

    try:
        page = _fetch_text(normalized)
    except Exception:
        return {}

    model: dict[str, Any] | None = None
    for match in re.finditer(
        r'<script[^>]+data-sveltekit-fetched[^>]*>(.*?)</script>',
        page,
        re.DOTALL,
    ):
        try:
            wrapper = json.loads(html.unescape(match.group(1)))
            body = wrapper.get("body")
            if not isinstance(body, str):
                continue
            payload = json.loads(body)
        except Exception:
            continue

        for node in _walk_json(payload):
            if not isinstance(node, dict):
                continue
            if node.get("__typename") == "PrintType" and node.get("name"):
                model = node
                break
        if model is not None:
            break

    if model is None:
        _MODEL_META_CACHE[cache_key] = (time.time(), {})
        return {}

    description = _plain_text(model.get("description"))
    summary = _plain_text(model.get("summary"))
    combined_text = "\n".join(part for part in (summary, description) if part)
    text_settings = _extract_text_print_settings(combined_text)

    fields: dict[str, Any] = dict(text_settings.get("fields", {}))
    materials = _name_values(model.get("usedMaterial")) or _name_values(model.get("materials"))
    if materials and "material" not in fields:
        fields["material"] = ", ".join(materials[:3])

    layer_values = _numeric_values(model.get("layerHeights"))
    if layer_values and "layer_height_mm" not in fields:
        fields["layer_height_mm"] = round(layer_values[0], 3)

    nozzle_values = _numeric_values(model.get("nozzleDiameters"))
    if nozzle_values and "nozzle_diameter_mm" not in fields:
        fields["nozzle_diameter_mm"] = round(nozzle_values[0], 3)

    printer_names = _name_values(model.get("printer"))
    if printer_names:
        fields["printer"] = printer_names[0]

    duration = _duration_text(model.get("printDuration"))
    if duration:
        fields["print_duration"] = duration

    if model.get("weight") is not None:
        weights = _numeric_values(model.get("weight"))
        if weights:
            fields["weight_g"] = round(weights[0], 1)

    if model.get("numPieces"):
        fields["pieces"] = int(model.get("numPieces") or 0)

    user = model.get("user") if isinstance(model.get("user"), dict) else {}
    author = (
        str(user.get("publicUsername") or user.get("handle") or "").strip()
        if isinstance(user, dict)
        else ""
    )

    notes = list(text_settings.get("notes", []))
    if summary and summary not in notes:
        notes.insert(0, summary[:220])
    notes = notes[:4]

    metadata = {
        "source": "printables",
        "source_url": normalized,
        "title": str(model.get("name") or "").strip(),
        "author": author,
        "fields": fields,
        "notes": notes,
        "has_creator_settings": bool(fields or notes),
    }
    _MODEL_META_CACHE[cache_key] = (time.time(), metadata)
    return dict(metadata)


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
        self._available = True
    
    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search Thingiverse for designs."""
        cache_key = ("thingiverse", query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return list(cached[1])
        try:
            page = _fetch_text(f"https://www.thingiverse.com/search?q={quote_plus(query)}&type=things")
        except Exception:
            return []
        results = _generic_link_results(page, "thingiverse", "https://www.thingiverse.com", limit)
        _SEARCH_CACHE[cache_key] = (time.time(), results)
        return list(results)
    
    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        """Get popular Thingiverse designs."""
        return self.search(category, limit)
    
    def is_available(self) -> bool:
        """Check Thingiverse availability."""
        return self._available
    
    @property
    def provider_name(self) -> str:
        return "Thingiverse"


class Cults3DProvider(DesignProvider):
    """Cults3D broad search provider for additional model matches."""

    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        cache_key = ("cults3d", query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return list(cached[1])
        try:
            page = _fetch_text(f"https://cults3d.com/en/search?q={quote_plus(query)}")
        except Exception:
            return []
        results = _generic_link_results(page, "cults3d", "https://cults3d.com", limit)
        _SEARCH_CACHE[cache_key] = (time.time(), results)
        return list(results)

    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        return self.search(category, limit)

    def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "Cults3D"


class MyMiniFactoryProvider(DesignProvider):
    """MyMiniFactory search provider for additional real model signals."""

    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        cache_key = ("myminifactory", query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return list(cached[1])
        try:
            page = _fetch_text(f"https://www.myminifactory.com/search/?query={quote_plus(query)}")
        except Exception:
            return []
        results = _generic_link_results(page, "myminifactory", "https://www.myminifactory.com", limit)
        _SEARCH_CACHE[cache_key] = (time.time(), results)
        return list(results)

    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        return self.search(category, limit)

    def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "MyMiniFactory"


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


class StlFinderProvider(DesignProvider):
    """STLFinder meta-search provider for broad 3D model discovery."""

    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        cache_key = ("stlfinder", query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return list(cached[1])
        try:
            page = _fetch_text(f"https://www.stlfinder.com/search/?query={quote_plus(query)}")
        except Exception:
            return []
        results = _generic_link_results(page, "stlfinder", "https://www.stlfinder.com", limit)
        _SEARCH_CACHE[cache_key] = (time.time(), results)
        return list(results)

    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        return self.search(category, limit)

    def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "STLFinder"


class YeggiProvider(DesignProvider):
    """Yeggi meta-search provider for additional printable model signals."""

    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        cache_key = ("yeggi", query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return list(cached[1])
        try:
            page = _fetch_text(f"https://www.yeggi.com/q/{quote_plus(query).replace('+', '+')}/")
        except Exception:
            return []
        results = _generic_link_results(page, "yeggi", "https://www.yeggi.com", limit)
        _SEARCH_CACHE[cache_key] = (time.time(), results)
        return list(results)

    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        return self.search(category, limit)

    def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "Yeggi"


class ProviderRegistry:
    """Central registry for design providers."""
    
    def __init__(self):
        self.providers: dict[str, DesignProvider] = {
            "makerworld": MakerworldProvider(),
            "printables": PrintablesProvider(),
            "cults3d": Cults3DProvider(),
            "myminifactory": MyMiniFactoryProvider(),
            "thingiverse": ThingiverseProvider(),
            "thangs": ThangsProvider(),
            "stlfinder": StlFinderProvider(),
            "yeggi": YeggiProvider(),
        }
    
    def search_all(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search all available providers with source-aware query expansion."""
        ranked: dict[str, tuple[float, ExampleDesign]] = {}
        search_query = normalize_source_query(query) or query
        variants = _query_variants(search_query) or [search_query]
        per_query_limit = max(limit * 2, 10)
        for provider in self.providers.values():
            if not provider.is_available():
                continue
            for variant in variants:
                for design in provider.search(variant, per_query_limit):
                    score = _design_score(search_query, design)
                    if score <= 0:
                        continue
                    existing = ranked.get(design.url)
                    if existing is None or score > existing[0]:
                        ranked[design.url] = (score, design)

        results = list(ranked.values())
        results.sort(key=lambda item: item[0], reverse=True)
        return [design for _, design in results[:limit]]
    
    def get_popular_all(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        """Get popular designs from all available providers."""
        results: list[ExampleDesign] = []
        for provider in self.providers.values():
            if provider.is_available():
                results.extend(provider.get_popular(category, limit))
        
        results.sort(key=lambda d: _design_score(category, d), reverse=True)
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


def _query_relevance(query: str, title: str, tags: list[str]) -> int:
    words = _query_words(query)
    haystack = set(re.findall(r"[a-z0-9]+", title.lower()) + tags)
    if not words:
        return 0
    return sum(1 for word in words if word in haystack)
