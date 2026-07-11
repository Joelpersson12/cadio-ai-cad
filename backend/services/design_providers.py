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
import os
import re
import time
from typing import Any
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from backend.services.licensing import classify_license, license_to_fields
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
    author: str = ""
    # Normalized license record (see licensing.classify_license). Defaults to an
    # unconfirmed/not-editable record when the source did not expose a license.
    license: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        license_record = self.license if isinstance(self.license, dict) else classify_license(None)
        data = {
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
            "author": self.author,
            "license": license_record,
        }
        data.update(license_to_fields(license_record))
        return data


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
    model_id: str = ""
    model_url: str = ""

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
            "model_id": self.model_id,
            "model_url": self.model_url,
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


def _fetch_text(url: str, timeout: float = 2.5) -> str:
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
    """Derive a CDN download URL for a Printables STL file.

    filePreviewPath is typically the STL's own path on the CDN:
      /media/prints/{id}/{hash}/stls/{filename}
    We take the parent directory and append the display name (lowercased).
    """
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
            "Accept": "application/json",
            "Origin": "https://www.printables.com",
            "Referer": "https://www.printables.com/",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
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


def printables_fresh_download_url(model_id: str, file_id: str) -> str | None:
    """Public: resolve a fresh, signed Printables STL download link.

    Printables generates short-lived signed CDN links at click time via its
    GraphQL API.  This returns one so callers can fetch the real file instead
    of guessing the CDN path (which Printables blocks for hot-linking).
    """
    return _printables_graphql_download_url(str(model_id or ""), str(file_id or ""), "stl")


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


def _printtype_to_example(item: dict[str, Any]) -> ExampleDesign | None:
    """Build an ExampleDesign from a Printables `PrintType` node.

    Works for both GraphQL `searchPrints2` items and PrintType nodes embedded
    in legacy search HTML — they share the same field shape.
    """
    model_id = item.get("id")
    slug = item.get("slug")
    name = item.get("name")
    if not model_id or not slug or not name:
        return None
    model_id = str(model_id)
    slug = str(slug)
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

    license_record = None
    lic = item.get("license")
    if isinstance(lic, dict):
        license_record = classify_license(lic, source="printables")

    author = ""
    user = item.get("user")
    if isinstance(user, dict):
        author = str(user.get("publicUsername") or user.get("handle") or user.get("slug") or "").strip()

    url = f"https://www.printables.com/model/{model_id}-{slug}"
    return ExampleDesign(
        id=_stable_id("printables", url),
        title=str(name),
        source="printables",
        url=url,
        image_url=image_url,
        category=category,
        tags=_title_tags(str(name)),
        popularity=_popularity(likes, downloads, rating),
        description=None,
        created_at=_parse_date(item.get("datePublished")),
        downloads=downloads,
        likes=likes,
        author=author,
        license=license_record,
    )


# --- Thingiverse official REST API -----------------------------------------
# The public Thingiverse website is Cloudflare-protected and rate-limits
# datacenter IPs (HTTP 429). Their REST API at api.thingiverse.com is the
# reliable path but requires a free app token (register at
# thingiverse.com/apps/create). Set THINGIVERSE_TOKEN in the environment.

def _thingiverse_token() -> str:
    return os.environ.get("THINGIVERSE_TOKEN", "").strip()


def _makerworld_token() -> str:
    """Optional Bearer token for MakerWorld's API (no public app-token scheme).

    MakerWorld sits behind Cloudflare + Bambu account auth. A token taken from a
    logged-in session (Authorization header) can be supplied via MAKERWORLD_TOKEN
    to authenticate API calls; many list endpoints also work unauthenticated.
    """
    return os.environ.get("MAKERWORLD_TOKEN", "").strip()


def _makerworld_api_get(url: str, timeout: float = 6.0) -> Any:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Origin": "https://makerworld.com",
        "Referer": "https://makerworld.com/",
    }
    token = _makerworld_token()
    if token:
        headers["Authorization"] = token if token.lower().startswith("bearer") else f"Bearer {token}"
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8", errors="replace"))
    except Exception:
        return None


def _thingiverse_api_get(path: str, params: dict[str, Any] | None = None, timeout: float = 6.0) -> Any:
    token = _thingiverse_token()
    if not token:
        return None
    merged = dict(params or {})
    merged["access_token"] = token
    qs = "&".join(f"{key}={quote_plus(str(value))}" for key, value in merged.items())
    url = f"https://api.thingiverse.com{path}?{qs}"
    req = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8", errors="replace"))
    except Exception:
        return None


def resolve_thingiverse_model_files(model_url: str, limit: int = 20) -> list[SourceModelFile]:
    """List a Thingiverse thing's files (STL download URLs) via the REST API."""
    token = _thingiverse_token()
    if not token:
        return []
    match = re.search(r"thing:(\d+)", model_url or "")
    if not match:
        return []
    thing_id = match.group(1)
    cache_key = f"thingiverse:{thing_id}"
    cached = _FILE_CACHE.get(cache_key)
    if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
        return list(cached[1])

    data = _thingiverse_api_get(f"/things/{thing_id}/files")
    files: list[SourceModelFile] = []
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            file_id = str(item.get("id") or "").strip()
            if not name or not file_id:
                continue
            suffix = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            download_url = str(item.get("download_url") or item.get("public_url") or "")
            if download_url.startswith("http") and "access_token=" not in download_url:
                sep = "&" if "?" in download_url else "?"
                download_url = f"{download_url}{sep}access_token={token}"
            files.append(
                SourceModelFile(
                    id=file_id,
                    name=name,
                    source="thingiverse",
                    file_type=suffix,
                    file_size=int(item.get("size") or 0),
                    preview_url=item.get("thumbnail") if isinstance(item.get("thumbnail"), str) else None,
                    download_url=download_url or None,
                    model_id=thing_id,
                    model_url=model_url,
                )
            )
    result = files[:limit]
    _FILE_CACHE[cache_key] = (time.time(), result)
    return list(result)


_MESH_FILE_EXTS = ("stl", "obj", "3mf", "zip")


def resolve_makerworld_model_files(model_url: str, limit: int = 20) -> list[SourceModelFile]:
    """Best-effort file resolver for a MakerWorld model.

    MakerWorld serves model packages (usually .3mf) through Bambu's CDN and
    typically gates downloads behind a logged-in session, so this may legitimately
    return no importable files. It probes the public design-service endpoints and
    extracts any directly downloadable mesh URLs it can find; when nothing is
    available the import pipeline falls back to other sources.
    """
    match = re.search(r"/models/(\d+)", model_url or "")
    if not match:
        return []
    design_id = match.group(1)
    cache_key = f"makerworld:{design_id}"
    cached = _FILE_CACHE.get(cache_key)
    if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
        return list(cached[1])

    endpoints = [
        f"https://makerworld.com/api/v1/design-service/design/{design_id}",
        f"https://makerworld.com/api/v1/design-service/instance/{design_id}",
        f"https://makerworld.com/api/v1/design-service/design/{design_id}/instance",
    ]
    files: list[SourceModelFile] = []
    seen: set[str] = set()
    for url in endpoints:
        data = _makerworld_api_get(url, timeout=6.0)
        if data is None:
            continue
        for node in _walk_json(data):
            if not isinstance(node, dict):
                continue
            name = str(node.get("name") or node.get("fileName") or node.get("title") or "").strip()
            download = ""
            for field in ("url", "downloadUrl", "modelUrl", "fileUrl", "cdnUrl"):
                val = node.get(field)
                if isinstance(val, str) and val.startswith("http"):
                    download = val
                    break
            target = download or name
            suffix = target.lower().split("?", 1)[0].rsplit(".", 1)[-1] if "." in target else ""
            if suffix not in _MESH_FILE_EXTS:
                continue
            if not download or download in seen:
                continue
            seen.add(download)
            if not name:
                name = download.split("?", 1)[0].rsplit("/", 1)[-1] or f"part_{len(files) + 1}.{suffix}"
            files.append(
                SourceModelFile(
                    id=str(node.get("id") or node.get("fileId") or len(files) + 1),
                    name=name,
                    source="makerworld",
                    file_type=suffix,
                    file_size=int(node.get("size") or node.get("fileSize") or 0),
                    preview_url=None,
                    download_url=download,
                    model_id=design_id,
                    model_url=model_url,
                )
            )
        if files:
            break
    result = files[:limit]
    _FILE_CACHE[cache_key] = (time.time(), result)
    return list(result)


_RESOLVE_CACHE: dict[str, tuple[float, list[SourceModelFile]]] = {}
_RESOLVE_CACHE_TTL = 600.0  # seconds; file lists on these platforms rarely change


def resolve_source_model_files(model_url: str, source: str, limit: int = 20) -> list[SourceModelFile]:
    """Resolve a model's importable files, dispatching by source platform.

    Results are cached for a few minutes so regenerating the same prompt or
    cycling model variants doesn't re-pay the network round-trip per model.
    Only non-empty results are cached, so a transient provider failure is
    retried on the next call.
    """
    src = (source or "").strip().lower()
    cache_key = f"{src}|{model_url}"
    now = time.monotonic()
    cached = _RESOLVE_CACHE.get(cache_key)
    if cached is not None:
        ts, files = cached
        if now - ts < _RESOLVE_CACHE_TTL:
            return files[:limit]
        _RESOLVE_CACHE.pop(cache_key, None)

    if src == "printables":
        files = resolve_printables_model_files(model_url, limit)
    elif src == "thingiverse":
        files = resolve_thingiverse_model_files(model_url, limit)
    elif src == "makerworld":
        files = resolve_makerworld_model_files(model_url, limit)
    else:
        return []
    if files:
        if len(_RESOLVE_CACHE) > 256:
            _RESOLVE_CACHE.clear()
        _RESOLVE_CACHE[cache_key] = (now, files)
    return files


_SOURCE_WEIGHTS = {
    "printables": 22,
    "cults3d": 15,
    "myminifactory": 14,
    "thingiverse": 16,
    "stlfinder": 10,
    "yeggi": 9,
    "makerworld": 18,
    "thangs": 14,
    "cgtrader": 12,
    "grabcad": 12,
    "pinshape": 13,
    "youmagine": 12,
    "crealitycloud": 12,
    "nih3d": 13,
    "stlrepo": 8,
    "3dprintsearch": 8,
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
    if source == "cgtrader":
        return "/3d-print-models/" in lower_url or "/3d-models/" in lower_url
    if source == "grabcad":
        return "/library/" in lower_url
    if source == "pinshape":
        return "/items/" in lower_url or "/3d-printing/" in lower_url
    if source == "youmagine":
        return "/designs/" in lower_url
    if source == "crealitycloud":
        return "/model-detail/" in lower_url or "/model/" in lower_url
    if source == "nih3d":
        return "/3d-print/" in lower_url or "/discover/" in lower_url or "/model/" in lower_url
    if source == "stlrepo":
        return any(fragment in lower_url for fragment in ("/models/", "/model/", "/3d-model/"))
    if source == "3dprintsearch":
        return any(fragment in lower_url for fragment in ("/model/", "/models/"))
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
        "tool": ["tools", "workshop"],
        "tools": ["tool", "workshop"],
        "drill": ["bit", "tool"],
        "screwdriver": ["tool", "bit"],
        "wrench": ["spanner", "tool"],
        "pliers": ["tool"],
        "desk": ["clamp"],
        "table": ["desk"],
        "wall": ["mount"],
        "dewalt": ["power", "tool"],
        "stand": ["holder", "dock"],
        "clip": ["clamp", "holder"],
        "organizer": ["holder", "storage"],
        "case": ["box", "cover"],
        "box": ["case", "enclosure"],
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

    # Printables (and most model sites) search AND-style: every word in the
    # query must match. A specific multi-word prompt like "pressure washer hose
    # guide" therefore returns nothing even though "pressure washer hose" or
    # "hose guide" match real models. Add contiguous sub-phrases (longest
    # first) so specific prompts still surface the right model.
    if len(core_words) >= 3:
        for window in range(len(core_words) - 1, 1, -1):  # n-1 down to 2 words
            for start in range(0, len(core_words) - window + 1):
                add(" ".join(core_words[start:start + window]))

    if {"battery", "batteries", "dewalt", "makita", "milwaukee", "ryobi", "bosch"} & words:
        brand = next((word for word in ("dewalt", "makita", "milwaukee", "ryobi", "bosch") if word in words), "power tool")
        add(f"{brand} battery holder wall mount")
        add(f"{brand} battery holder slide rail")
        add("power tool battery holder printable")
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
    if "tool" in words or "tools" in words or {"drill", "screwdriver", "wrench", "pliers", "bit"} & words:
        add("tool holder wall mount")
        add("tool rack wall mount 3d print")
        add("pegboard tool holder 3d print")
        add("workshop tool organizer stl")
        add("gridfinity tool holder")
        if "drill" in words or "bit" in words:
            add("drill bit holder stl")
            add("hex bit holder 3d print")
        if "screwdriver" in words:
            add("screwdriver holder wall mount")
        if "wrench" in words:
            add("wrench holder wall mount")
        if "pliers" in words:
            add("pliers holder wall mount")
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

    return variants[:16]


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
        "tool": {"tool", "tools", "workshop"},
        "tools": {"tool", "tools", "workshop"},
        "drill": {"drill", "bit", "bits"},
        "screwdriver": {"screwdriver", "driver", "drivers"},
        "wrench": {"wrench", "spanner"},
        "pliers": {"pliers", "plier"},
        "pegboard": {"pegboard", "skadis", "wall"},
        "gridfinity": {"gridfinity", "grid", "bin"},
        "desk": {"desk", "table", "desktop", "clamp"},
        "case": {"case", "box", "enclosure", "cover"},
        "box": {"box", "case", "enclosure"},
        "organizer": {"organizer", "holder", "storage", "rack"},
        "clip": {"clip", "clamp", "holder"},
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
        page = _fetch_text(files_url, timeout=8.0)
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
                    # Try direct URL fields first, then derive from preview path, then GraphQL
                    download_url: str | None = None
                    for url_field in ("downloadUrl", "fileUrl", "url", "sourceUrl", "cdnUrl"):
                        val = item.get(url_field)
                        if isinstance(val, str) and val.startswith("http"):
                            download_url = val
                            break
                    if download_url is None:
                        download_url = _printables_download_url(item.get("filePreviewPath"), name)
                    # Note: don't resolve a signed GraphQL link here (one POST
                    # per file × many models is slow). The importer resolves a
                    # fresh signed link lazily, only for the file it actually
                    # imports, using model_id + file id stored below.
                    source_file = SourceModelFile(
                        id=file_id,
                        name=name,
                        source="printables",
                        file_type=suffix,
                        file_size=int(item.get("fileSize") or 0),
                        preview_url=_media_url(item.get("filePreviewPath")),
                        download_url=download_url,
                        order=int(item.get("order") or 0),
                        model_id=model_id,
                        model_url=normalized,
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
        page = _fetch_text(normalized, timeout=8.0)
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


def _makerworld_search_endpoints(query: str, limit: int) -> list[str]:
    q = quote_plus(query)
    n = max(limit, 20)
    return [
        f"https://makerworld.com/api/v1/search-service/select/instance?keyword={q}&limit={n}&offset=0&type=models",
        f"https://makerworld.com/api/v1/search-service/select/design?searchText={q}&limit={n}&offset=0",
        f"https://makerworld.com/api/v1/design-service/instance/search?keyword={q}&limit={n}&offset=0",
        f"https://makerworld.com/api/v1/design-service/design?handle=&keyword={q}&limit={n}&offset=0",
        f"https://makerworld.com/api/v1/design/page?keyword={q}&page=1&page_size={n}&order=likes",
    ]


class MakerworldProvider(DesignProvider):
    """MakerWorld design provider.

    MakerWorld is behind Cloudflare + Bambu account auth and exposes no public
    app-token scheme, so this tries several known API endpoints (optionally
    authenticated with MAKERWORLD_TOKEN). Returns [] when none respond.
    """

    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        cache_key = ("makerworld", query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return list(cached[1])

        results: list[ExampleDesign] = []
        for url in _makerworld_search_endpoints(query, limit):
            data = _makerworld_api_get(url, timeout=5.0)
            if data is None:
                continue
            results = self._parse_results(data, limit)
            if results:
                break

        _SEARCH_CACHE[cache_key] = (time.time(), results)
        return list(results)

    def _parse_results(self, data: Any, limit: int) -> list[ExampleDesign]:
        items: list[Any] = []
        # Find the first list of design-like dicts anywhere in the response
        # (endpoints nest results under data/hits/list/records in varied ways).
        for node in _walk_json(data):
            if (
                isinstance(node, list)
                and node
                and isinstance(node[0], dict)
                and any(k in node[0] for k in ("id", "designId", "title", "name"))
            ):
                items = node
                break
        results: list[ExampleDesign] = []
        for item in items[:limit]:
            item_id = str(item.get("id") or item.get("designId") or "").strip()
            name = str(item.get("name") or item.get("title") or "").strip()
            if not item_id or not name:
                continue
            handle = str(item.get("handle") or item.get("slug") or "").strip()
            if handle:
                url = f"https://makerworld.com/en/models/{item_id}-{handle}"
            else:
                url = f"https://makerworld.com/en/models/{item_id}"
            image_url: str | None = None
            cover = item.get("cover") or item.get("thumbnail") or item.get("image")
            if isinstance(cover, dict):
                mkey = str(cover.get("mediaKey") or cover.get("url") or "").strip()
                if mkey.startswith("http"):
                    image_url = mkey
                elif mkey:
                    image_url = f"https://makerworld-data.makerworld.com/{mkey}"
            elif isinstance(cover, str) and cover.startswith("http"):
                image_url = cover
            likes = int(item.get("likes") or item.get("likeCount") or item.get("like_count") or 0)
            downloads = int(item.get("downloads") or item.get("downloadCount") or item.get("download_count") or 0)
            license_record = None
            lic = item.get("license") or item.get("licenseType") or item.get("license_type")
            if lic:
                license_record = classify_license(lic, source="makerworld")
            author = ""
            designer = item.get("designer") or item.get("author") or item.get("user")
            if isinstance(designer, dict):
                author = str(designer.get("name") or designer.get("handle") or designer.get("uid") or "").strip()
            elif isinstance(designer, str):
                author = designer.strip()
            results.append(
                ExampleDesign(
                    id=_stable_id("makerworld", url),
                    title=name,
                    source="makerworld",
                    url=url,
                    image_url=image_url,
                    category="3D Model",
                    tags=_title_tags(name),
                    popularity=_popularity(likes, downloads, 0.0),
                    description=None,
                    created_at=None,
                    downloads=downloads,
                    likes=likes,
                    author=author,
                    license=license_record,
                )
            )
        return results

    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        return self.search(category, limit)

    def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "Makerworld"


class PrintablesProvider(DesignProvider):
    """Printables design provider (Prusa's printable designs)."""
    
    def __init__(self):
        self._available = True
    
    # GraphQL query for Printables' public search API. Printables stopped
    # embedding search results in their HTML (app v4.7.10+), so the API is the
    # only reliable source. `ordering` and `printType` are enums and are
    # inlined as literals (the API rejects them as quoted strings, and inlining
    # avoids any variable-coercion ambiguity).
    _SEARCH_QUERY = (
        "query SearchModels($q: String!, $limit: Int!, $offset: Int!) {"
        "  searchPrints2(query: $q, limit: $limit, offset: $offset, ordering: rating, printType: print) {"
        "    items { ... on PrintType {"
        "      id name slug likesCount downloadCount ratingAvg datePublished"
        "      image { filePath }"
        "      category { path { nameEn name } }"
        "      license { id name disallowRemixing }"
        "      user { publicUsername }"
        "    } }"
        "  }"
        "}"
    )

    # Same query without the license/user fields, used as a fallback if the
    # primary query is ever rejected (so search never breaks over license data).
    _SEARCH_QUERY_BASIC = (
        "query SearchModels($q: String!, $limit: Int!, $offset: Int!) {"
        "  searchPrints2(query: $q, limit: $limit, offset: $offset, ordering: rating, printType: print) {"
        "    items { ... on PrintType {"
        "      id name slug likesCount downloadCount ratingAvg datePublished"
        "      image { filePath }"
        "      category { path { nameEn name } }"
        "    } }"
        "  }"
        "}"
    )

    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search Printables for designs via their public GraphQL API."""
        cache_key = ("printables", query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return list(cached[1])

        results = self._search_api(query, limit)
        if not results:
            # Fallback to legacy HTML scraping (kept in case the API changes).
            try:
                page = _fetch_text(
                    f"https://www.printables.com/search/models?q={quote_plus(query)}",
                    timeout=6.0,
                )
                results = self._parse_search_page(page, limit)
            except Exception:
                results = []
        _SEARCH_CACHE[cache_key] = (time.time(), results)
        return list(results)

    def _search_api(self, query: str, limit: int) -> list[ExampleDesign]:
        data = self._post_search(query, limit, self._SEARCH_QUERY)
        items = self._extract_items(data)
        if items is None:
            # Primary query (with license/user fields) failed — retry with the
            # lean query so search keeps working even if those fields change.
            data = self._post_search(query, limit, self._SEARCH_QUERY_BASIC)
            items = self._extract_items(data)
        if items is None:
            return []
        results: list[ExampleDesign] = []
        for item in items:
            if isinstance(item, dict) and item.get("id") and item.get("slug") and item.get("name"):
                design = _printtype_to_example(item)
                if design is not None:
                    results.append(design)
        results.sort(key=lambda d: (d.popularity, d.likes, d.downloads), reverse=True)
        return results[:limit]

    @staticmethod
    def _post_search(query: str, limit: int, gql: str) -> Any:
        payload = json.dumps(
            {
                "query": gql,
                "variables": {"q": query, "limit": max(limit, 20), "offset": 0},
            }
        ).encode("utf-8")
        req = Request(
            "https://api.printables.com/graphql/",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": "https://www.printables.com",
                "Referer": "https://www.printables.com/",
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
            },
            method="POST",
        )
        try:
            with urlopen(req, timeout=6.0) as res:
                return json.loads(res.read().decode("utf-8", errors="replace"))
        except Exception:
            return None

    @staticmethod
    def _extract_items(data: Any) -> list[Any] | None:
        """Return the search items list, or None if the query errored."""
        if not isinstance(data, dict) or data.get("errors"):
            return None
        items = data.get("data", {}).get("searchPrints2", {}).get("items")
        return items if isinstance(items, list) else None

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
            design = _printtype_to_example(item)
            if design is not None:
                results.append(design)

        results.sort(key=lambda d: (d.popularity, d.likes, d.downloads), reverse=True)
        return results[:limit]


class ThingiverseProvider(DesignProvider):
    """Thingiverse design provider (official REST API).

    Uses api.thingiverse.com with a free app token (THINGIVERSE_TOKEN). The
    public website is Cloudflare-protected and rate-limits server IPs, so the
    API is the only reliable path. Reports unavailable until a token is set.
    """

    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        if not _thingiverse_token():
            return []
        cache_key = ("thingiverse", query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return list(cached[1])

        data = _thingiverse_api_get(
            f"/search/{quote_plus(query)}/",
            {"type": "things", "per_page": max(limit, 20), "sort": "popular"},
        )
        hits = data.get("hits") if isinstance(data, dict) else None
        results: list[ExampleDesign] = []
        if isinstance(hits, list):
            for hit in hits:
                if not isinstance(hit, dict):
                    continue
                thing_id = str(hit.get("id") or "").strip()
                name = str(hit.get("name") or "").strip()
                if not thing_id or not name:
                    continue
                url = str(hit.get("public_url") or "").strip()
                if "thingiverse.com" not in url:
                    url = f"https://www.thingiverse.com/thing:{thing_id}"
                likes = int(hit.get("like_count") or 0)
                downloads = int(hit.get("download_count") or hit.get("collect_count") or 0)
                image = hit.get("thumbnail")
                license_record = None
                if hit.get("license"):
                    license_record = classify_license(hit.get("license"), source="thingiverse")
                creator = hit.get("creator")
                author = ""
                if isinstance(creator, dict):
                    author = str(creator.get("name") or creator.get("first_name") or "").strip()
                results.append(
                    ExampleDesign(
                        id=_stable_id("thingiverse", url),
                        title=name,
                        source="thingiverse",
                        url=url,
                        image_url=image if isinstance(image, str) else None,
                        category="3D Model",
                        tags=_title_tags(name),
                        popularity=_popularity(likes, downloads, 0.0),
                        description=None,
                        created_at=None,
                        downloads=downloads,
                        likes=likes,
                        author=author,
                        license=license_record,
                    )
                )
        results.sort(key=lambda d: (d.popularity, d.likes, d.downloads), reverse=True)
        results = results[:limit]
        _SEARCH_CACHE[cache_key] = (time.time(), results)
        return list(results)

    def get_popular(self, category: str, limit: int = 5) -> list[ExampleDesign]:
        return self.search(category, limit)

    def is_available(self) -> bool:
        return bool(_thingiverse_token())

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


class GenericSearchProvider(DesignProvider):
    """Defensive HTML search provider for model platforms without stable public APIs."""

    def __init__(self, key: str, name: str, search_url: str, base_url: str):
        self.key = key
        self.name = name
        self.search_url = search_url
        self.base_url = base_url

    def search(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        cache_key = (self.key, query.strip().lower(), limit)
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
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
            "cgtrader": GenericSearchProvider(
                "cgtrader",
                "CGTrader",
                "https://www.cgtrader.com/3d-print-models?keywords={query}",
                "https://www.cgtrader.com",
            ),
            "grabcad": GenericSearchProvider(
                "grabcad",
                "GrabCAD",
                "https://grabcad.com/library?query={query}",
                "https://grabcad.com",
            ),
            "pinshape": GenericSearchProvider(
                "pinshape",
                "Pinshape",
                "https://pinshape.com/search/designs?q={query}",
                "https://pinshape.com",
            ),
            "youmagine": GenericSearchProvider(
                "youmagine",
                "YouMagine",
                "https://www.youmagine.com/search?q={query}",
                "https://www.youmagine.com",
            ),
            "crealitycloud": GenericSearchProvider(
                "crealitycloud",
                "Creality Cloud",
                "https://www.crealitycloud.com/search/model?keyword={query}",
                "https://www.crealitycloud.com",
            ),
            "nih3d": GenericSearchProvider(
                "nih3d",
                "NIH 3D",
                "https://3d.nih.gov/search?search={query}",
                "https://3d.nih.gov",
            ),
            "stlrepo": GenericSearchProvider(
                "stlrepo",
                "STLRepo",
                "https://stlrepo.com/search?q={query}",
                "https://stlrepo.com",
            ),
            "3dprintsearch": GenericSearchProvider(
                "3dprintsearch",
                "3DPrintSearch",
                "https://www.3dprintsearch.com/search?q={query}",
                "https://www.3dprintsearch.com",
            ),
        }
    
    # Module-level cache: normalized_query → (monotonic_timestamp, sorted_results)
    _search_cache: dict[str, tuple[float, list]] = {}
    _SEARCH_CACHE_TTL = 45.0

    def _fan_out_search(self, search_query: str, deadline_s: float, per_query_limit: int) -> dict[str, tuple[float, ExampleDesign]]:
        """Query every available provider in parallel and rank the hits.

        Two latency rules make this fast without hurting cold-start reliability:
        - EARLY EXIT: once we have plenty of ranked results and at least a couple
          of seconds have passed, stop waiting for stragglers — the slowest
          provider no longer gates every generation.
        - NON-BLOCKING SHUTDOWN: the executor is shut down with wait=False.
          The old `with ThreadPoolExecutor(...)` form blocked on exit until every
          in-flight provider call finished, which silently defeated the deadline.
        """
        from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait as _wait

        variants = _query_variants(search_query) or [search_query]
        tasks = [
            (provider, variant)
            for provider in self.providers.values()
            if provider.is_available()
            for variant in variants
        ]

        def _search_one(args: tuple) -> list[ExampleDesign]:
            provider, variant = args
            try:
                return provider.search(variant, per_query_limit)
            except Exception:
                return []

        ranked: dict[str, tuple[float, ExampleDesign]] = {}
        started = time.monotonic()
        deadline = started + deadline_s
        # The fast path only needs the single best match — exit as soon as a
        # decent handful of ranked results is in. Cold start (zero results)
        # still waits the full deadline.
        min_wait_s = 1.0
        enough_results = 4

        executor = ThreadPoolExecutor(max_workers=16)
        try:
            pending = {executor.submit(_search_one, task) for task in tasks}
            while pending:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                done, pending = _wait(pending, timeout=min(remaining, 0.25), return_when=FIRST_COMPLETED)
                for future in done:
                    try:
                        for design in future.result(timeout=0):
                            score = _design_score(search_query, design)
                            if score <= 0:
                                continue
                            existing = ranked.get(design.url)
                            if existing is None or score > existing[0]:
                                ranked[design.url] = (score, design)
                    except Exception:
                        pass
                elapsed = time.monotonic() - started
                if elapsed >= min_wait_s and len(ranked) >= enough_results:
                    break
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
        return ranked

    def search_all(self, query: str, limit: int = 5) -> list[ExampleDesign]:
        """Search all available providers in parallel within a deadline.

        Handles any input language: non-Latin scripts are translated to an
        English query up front (the model sites are English-only), and if a
        Latin-script query finds nothing, one LLM-translated retry runs so
        free-form prompts in e.g. German, Polish or Spanish still hit."""
        from backend.services.prompt_translation import (
            llm_translate_search_query,
            query_needs_llm_translation,
        )

        search_query = normalize_source_query(query) or query
        cache_key = search_query.lower().strip()
        now = time.monotonic()

        cached = self._search_cache.get(cache_key)
        if cached is not None:
            ts, cached_results = cached
            if now - ts < self._SEARCH_CACHE_TTL:
                return cached_results[:limit]

        # Non-Latin scripts (Cyrillic, CJK, Arabic, ...) can never match the
        # English-only providers — translate before the first fan-out.
        if query_needs_llm_translation(search_query):
            translated = llm_translate_search_query(query)
            if translated:
                search_query = normalize_source_query(translated) or translated

        per_query_limit = max(limit * 2, 12)
        # Cross-provider fan-out deadline. A too-tight budget silently drops all
        # results on a cold container (first request after a deploy pays DNS+TLS
        # setup to every provider), which makes generation fall back to a
        # source-less procedural model — i.e. the "Source/Files are gone" bug.
        # The early-exit in _fan_out_search means warm requests rarely wait this
        # long. Override with SOURCE_SEARCH_DEADLINE if needed.
        try:
            search_deadline = float(os.environ.get("SOURCE_SEARCH_DEADLINE", "9.0"))
        except ValueError:
            search_deadline = 9.0

        ranked = self._fan_out_search(search_query, search_deadline, per_query_limit)

        # Latin-script prompt that found nothing — probably a language (or very
        # loose phrasing) the deterministic dictionary doesn't cover. One
        # LLM-translated retry with a shorter deadline.
        if not ranked:
            translated = llm_translate_search_query(query)
            if translated:
                retry_query = normalize_source_query(translated) or translated
                if retry_query.lower().strip() != search_query.lower().strip():
                    ranked = self._fan_out_search(retry_query, min(6.0, search_deadline), per_query_limit)

        results = list(ranked.values())
        results.sort(key=lambda item: item[0], reverse=True)
        all_results = [design for _, design in results]
        self._search_cache[cache_key] = (time.monotonic(), all_results)
        return all_results[:limit]
    
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
        _warm_provider_registry(_provider_registry)
    return _provider_registry


def _warm_provider_registry(registry: ProviderRegistry) -> None:
    """Prime DNS/TLS connections and the search cache in the background.

    The first real generation after a deploy would otherwise pay the full
    cold-start cost to every provider at once and risk timing out the search
    (dropping source attribution). A throwaway warm-up search makes the first
    user request hit warm connections. Best-effort: never block or raise.
    """
    import threading

    def _warm() -> None:
        try:
            registry.search_all("phone stand", limit=5)
        except Exception:
            pass

    try:
        threading.Thread(target=_warm, name="provider-warmup", daemon=True).start()
    except Exception:
        pass


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
