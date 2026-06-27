"""License classification for imported third-party models.

Cadio imports real STL/OBJ geometry from public model sites (Printables,
Thingiverse, MakerWorld, ...). Every such site attaches a license to each
model. We must (a) always show the user where the model came from and what they
may/may not do with it, and (b) automatically refuse to *edit* (create a
derivative of) a model whose license forbids derivatives.

This module turns the many different license strings/objects returned by those
sites into one normalized record with explicit permission flags so the rest of
the app never has to parse license text again.

The classifier is deliberately conservative: when a license cannot be
identified it is marked ``verified=False`` and treated as "all rights reserved"
for the purposes of editing — better to under-promise rights than to expose
Cadio to a claim that it enabled an infringing derivative.
"""

from __future__ import annotations

import re
from typing import Any

# Canonical Creative Commons deeds. Each entry: code -> (name, url, attribution,
# commercial, remix/derivatives, share-alike).
_CC_VERSION = "4.0"


def _cc_url(slug: str) -> str:
    if slug in ("cc0", "zero"):
        return "https://creativecommons.org/publicdomain/zero/1.0/"
    if slug in ("publicdomain", "pd", "mark"):
        return "https://creativecommons.org/publicdomain/mark/1.0/"
    return f"https://creativecommons.org/licenses/{slug}/{_CC_VERSION}/"


# Normalized license records keyed by canonical code.
#   requires_attribution, allow_commercial, allow_remix(derivatives), share_alike
_LICENSES: dict[str, dict[str, Any]] = {
    "CC0": {
        "name": "CC0 1.0 (Public Domain)",
        "url": _cc_url("cc0"),
        "requires_attribution": False,
        "allow_commercial": True,
        "allow_remix": True,
        "share_alike": False,
    },
    "PUBLICDOMAIN": {
        "name": "Public Domain",
        "url": _cc_url("publicdomain"),
        "requires_attribution": False,
        "allow_commercial": True,
        "allow_remix": True,
        "share_alike": False,
    },
    "CC-BY": {
        "name": "CC BY 4.0",
        "url": _cc_url("by"),
        "requires_attribution": True,
        "allow_commercial": True,
        "allow_remix": True,
        "share_alike": False,
    },
    "CC-BY-SA": {
        "name": "CC BY-SA 4.0",
        "url": _cc_url("by-sa"),
        "requires_attribution": True,
        "allow_commercial": True,
        "allow_remix": True,
        "share_alike": True,
    },
    "CC-BY-ND": {
        "name": "CC BY-ND 4.0",
        "url": _cc_url("by-nd"),
        "requires_attribution": True,
        "allow_commercial": True,
        "allow_remix": False,
        "share_alike": False,
    },
    "CC-BY-NC": {
        "name": "CC BY-NC 4.0",
        "url": _cc_url("by-nc"),
        "requires_attribution": True,
        "allow_commercial": False,
        "allow_remix": True,
        "share_alike": False,
    },
    "CC-BY-NC-SA": {
        "name": "CC BY-NC-SA 4.0",
        "url": _cc_url("by-nc-sa"),
        "requires_attribution": True,
        "allow_commercial": False,
        "allow_remix": True,
        "share_alike": True,
    },
    "CC-BY-NC-ND": {
        "name": "CC BY-NC-ND 4.0",
        "url": _cc_url("by-nc-nd"),
        "requires_attribution": True,
        "allow_commercial": False,
        "allow_remix": False,
        "share_alike": False,
    },
    "GPL": {
        "name": "GNU GPL",
        "url": "https://www.gnu.org/licenses/gpl-3.0.html",
        "requires_attribution": True,
        "allow_commercial": True,
        "allow_remix": True,
        "share_alike": True,
    },
    "LGPL": {
        "name": "GNU LGPL",
        "url": "https://www.gnu.org/licenses/lgpl-3.0.html",
        "requires_attribution": True,
        "allow_commercial": True,
        "allow_remix": True,
        "share_alike": True,
    },
    "BSD": {
        "name": "BSD License",
        "url": "https://opensource.org/license/bsd-3-clause",
        "requires_attribution": True,
        "allow_commercial": True,
        "allow_remix": True,
        "share_alike": False,
    },
    "MIT": {
        "name": "MIT License",
        "url": "https://opensource.org/license/mit",
        "requires_attribution": True,
        "allow_commercial": True,
        "allow_remix": True,
        "share_alike": False,
    },
    # Proprietary / closed: derivatives and (usually) redistribution not allowed.
    "STANDARD": {
        "name": "Standard Digital File License",
        "url": "",
        "requires_attribution": True,
        "allow_commercial": False,
        "allow_remix": False,
        "share_alike": False,
    },
    "ALL_RIGHTS_RESERVED": {
        "name": "All Rights Reserved",
        "url": "",
        "requires_attribution": True,
        "allow_commercial": False,
        "allow_remix": False,
        "share_alike": False,
    },
}

# Thingiverse REST API license codes -> canonical code.
_THINGIVERSE_CODES = {
    "cc": "CC-BY",
    "cc-sa": "CC-BY-SA",
    "cc-nd": "CC-BY-ND",
    "cc-nc": "CC-BY-NC",
    "cc-nc-sa": "CC-BY-NC-SA",
    "cc-nc-nd": "CC-BY-NC-ND",
    "pd0": "CC0",
    "public": "PUBLICDOMAIN",
    "publicdomain": "PUBLICDOMAIN",
    "gpl": "GPL",
    "lgpl": "LGPL",
    "bsd": "BSD",
    "mit": "MIT",
    "none": "ALL_RIGHTS_RESERVED",
    "all rights reserved": "ALL_RIGHTS_RESERVED",
}


def _unverified() -> dict[str, Any]:
    """Conservative record for an unidentified/missing license.

    Treated as not-editable so Cadio never silently enables a derivative of a
    model whose terms it could not confirm.
    """
    return {
        "code": "UNKNOWN",
        "name": "License not confirmed",
        "url": "",
        "requires_attribution": True,
        "allow_commercial": False,
        "allow_remix": False,
        "share_alike": False,
        "editable": False,
        "verified": False,
    }


def _finalize(code: str) -> dict[str, Any]:
    base = _LICENSES[code]
    record = {"code": code, "verified": True, **base}
    # A model is editable in Cadio only if its license permits derivatives.
    record["editable"] = bool(base["allow_remix"])
    return record


def _match_text(text: str) -> str | None:
    """Map a free-text license name to a canonical code."""
    t = re.sub(r"\s+", " ", text.strip().lower())
    if not t:
        return None

    # Direct provider codes (Thingiverse and similar) first.
    if t in _THINGIVERSE_CODES:
        return _THINGIVERSE_CODES[t]

    if "all rights reserved" in t or t in ("none", "proprietary", "copyright"):
        return "ALL_RIGHTS_RESERVED"
    if "standard digital file" in t or "standard license" in t:
        return "STANDARD"
    if "cc0" in t or "public domain dedication" in t or "zero" in t:
        return "CC0"
    if "public domain" in t:
        return "PUBLICDOMAIN"

    if "creative commons" in t or t.startswith("cc") or "attribution" in t:
        attribution = "attribution" in t or re.search(r"\bby\b", t) is not None
        noncommercial = "noncommercial" in t or "non-commercial" in t or "non commercial" in t or re.search(r"\bnc\b", t) is not None
        noderiv = (
            "noderiv" in t
            or "no deriv" in t
            or "noderivatives" in t
            or "no derivatives" in t
            or re.search(r"\bnd\b", t) is not None
        )
        sharealike = "sharealike" in t or "share-alike" in t or "share alike" in t or re.search(r"\bsa\b", t) is not None
        if attribution or noncommercial or noderiv or sharealike or "creative commons" in t:
            if noncommercial and noderiv:
                return "CC-BY-NC-ND"
            if noncommercial and sharealike:
                return "CC-BY-NC-SA"
            if noncommercial:
                return "CC-BY-NC"
            if noderiv:
                return "CC-BY-ND"
            if sharealike:
                return "CC-BY-SA"
            return "CC-BY"

    if "lgpl" in t:
        return "LGPL"
    if "gpl" in t:
        return "GPL"
    if "bsd" in t:
        return "BSD"
    if t == "mit" or "mit license" in t:
        return "MIT"
    return None


def classify_license(raw: Any, *, source: str | None = None) -> dict[str, Any]:
    """Normalize a provider license value into a permission record.

    ``raw`` may be a license code/name string, or a provider license object
    (dict) with fields like ``name``, ``slug``/``code``, and boolean hints such
    as Printables' ``disallowRemixing``. Always returns a record with keys:
    code, name, url, requires_attribution, allow_commercial, allow_remix,
    share_alike, editable, verified.
    """
    name_text = ""
    disallow_remix_hint: bool | None = None

    if isinstance(raw, dict):
        for key in ("name", "title", "slug", "code", "key", "id", "label"):
            value = raw.get(key)
            if isinstance(value, str) and value.strip():
                name_text = value
                if key in ("name", "title", "label"):
                    break
        # Printables exposes an explicit derivatives flag on its license object.
        for flag_key in ("disallowRemixing", "disallow_remixing", "noDerivatives", "no_derivatives"):
            if isinstance(raw.get(flag_key), bool):
                disallow_remix_hint = raw.get(flag_key)
                break
    elif isinstance(raw, str):
        name_text = raw

    code = _match_text(name_text) if name_text else None

    if code is None:
        record = _unverified()
        if name_text.strip():
            record["name"] = name_text.strip()
        if disallow_remix_hint is False:
            # Site says derivatives are allowed even though we can't name the
            # license — honor that but keep it flagged unverified.
            record["allow_remix"] = True
            record["editable"] = True
        if source:
            record["source"] = source
        return record

    record = _finalize(code)
    # An explicit site flag overrides the name-derived remix permission.
    if disallow_remix_hint is True:
        record["allow_remix"] = False
        record["editable"] = False
    elif disallow_remix_hint is False and record["code"] in ("CC-BY-ND", "CC-BY-NC-ND"):
        record["allow_remix"] = True
        record["editable"] = True
    if source:
        record["source"] = source
    return record


def license_to_fields(record: dict[str, Any] | None) -> dict[str, Any]:
    """Flatten a license record into ExampleDesign-friendly fields (or empty)."""
    if not isinstance(record, dict):
        return {}
    return {
        "license_code": record.get("code", ""),
        "license_name": record.get("name", ""),
        "license_url": record.get("url", ""),
        "license_requires_attribution": bool(record.get("requires_attribution", True)),
        "license_allow_commercial": bool(record.get("allow_commercial", False)),
        "license_allow_remix": bool(record.get("allow_remix", False)),
        "license_share_alike": bool(record.get("share_alike", False)),
        "license_editable": bool(record.get("editable", False)),
        "license_verified": bool(record.get("verified", False)),
    }
