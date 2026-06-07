"""Prompt normalization for source-model searches.

Cadio searches public model sites in English, but users can describe models in
Swedish and other common languages.  This module keeps that translation
deterministic and local so source search, file ranking, and simple edit
detection all see the same query words.
"""

from __future__ import annotations

import re
import unicodedata

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:\.[0-9]+)?")

_PHRASE_TRANSLATIONS: tuple[tuple[str, str], ...] = (
    # Swedish
    (r"\b(?:vagg\s*monterad|vaggmonterad|vagg\s*hangd|vagghangd)\b", "wall mounted"),
    (r"\b(?:bord\s*monterad|bordmonterad|skrivbord\s*monterad|skrivbordsmonterad)\b", "desk mount"),
    (r"\b(?:klam\s*faste(?:t)?|klamfaste(?:t)?|klamma\s*faste(?:t)?|klammafaste(?:t)?|clamp\s*faste(?:t)?)\b", "clamp mount"),
    (r"\b(?:ihop\s*fallbar|ihopfallbar|hop\s*fallbar|hopfallbar|vikbar)\b", "foldable"),
    (r"\b(?:svangbar|vridbar|roterande|roterbar)\b", "rotating"),
    (r"\b(?:verktyg\s*hallaren?|verktygshallaren?)\b", "tool holder"),
    (r"\b(?:borr\s*hallaren?|borrhallaren?)\b", "drill holder"),
    (r"\b(?:skruvmejsel\s*hallaren?|skruvmejselhallaren?)\b", "screwdriver holder"),
    (r"\b(?:nyckel\s*hallaren?|nyckelhallaren?)\b", "wrench holder"),
    (r"\b(?:batteri\s*hallaren?|batterihallaren?)\b", "battery holder"),
    (r"\b(?:batteri\s*faste(?:t)?|batterifaste(?:t)?)\b", "battery mount"),
    (r"\b(?:vagg\s*faste(?:t)?|vaggfaste(?:t)?|vagg\s*montering(?:en)?|vaggmontering(?:en)?|vagg\s*hallaren?|vagghallaren?)\b", "wall mount"),
    (r"\b(?:skrivbord\s*faste(?:t)?|skrivbordsfaste(?:t)?|bord\s*faste(?:t)?|bordfaste(?:t)?)\b", "desk mount"),
    (r"\b(?:skrivbord\s*hallaren?|skrivbordshallaren?|bord\s*hallaren?|bordhallaren?)\b", "desk holder"),
    (r"\b(?:telefon\s*stall(?:et)?|telefonstall(?:et)?|mobil\s*stall(?:et)?|mobilstall(?:et)?)\b", "phone stand"),
    (r"\b(?:telefon\s*hallaren?|telefonhallaren?|mobil\s*hallaren?|mobilhallaren?)\b", "phone holder"),
    (r"\b(?:horlur\s*stall(?:et)?|horlurs\s*stall(?:et)?|horlursstall(?:et)?)\b", "headphone stand"),
    (r"\b(?:horlur\s*hallaren?|horlurs\s*hallaren?|horlurshallaren?)\b", "headphone holder"),
    (r"\b(?:headset\s*stall(?:et)?|headsetstall(?:et)?)\b", "headset stand"),
    (r"\b(?:mugg\s*hallaren?|mugghallaren?)\b", "mug holder"),
    (r"\b(?:kopp\s*hallaren?|kopphallaren?)\b", "cup holder"),
    (r"\b(?:mugg\s*stall(?:et)?|muggstall(?:et)?)\b", "mug stand"),
    (r"\b(?:kopp\s*stall(?:et)?|koppstall(?:et)?)\b", "cup stand"),
    (r"\b(?:dryck\s*hallaren?|dryckeshallaren?)\b", "drink holder"),
    (r"\b(?:kabel\s*hallaren?|kabelhallaren?|sladd\s*hallaren?|sladdhallaren?)\b", "cable holder"),
    (r"\b(?:kabel\s*klamma|kabelklamma|sladd\s*klamma|sladdklamma)\b", "cable clip"),
    (r"\b(?:laddare\s*hallaren?|laddarhallaren?)\b", "charger holder"),
    (r"\b(?:laddstation|laddnings\s*station|laddningsstation)\b", "charging station"),
    (r"\b(?:magsafe\s*laddare)\b", "magsafe charger"),
    (r"\b(?:skruv\s*hal|skruvhal)\b", "screw holes"),
    (r"\b(?:monterings\s*hal|monteringshal)\b", "mounting holes"),
    (r"\b(?:forsankt\s*hal|forsankta\s*hal)\b", "countersunk holes"),
    (r"\b(?:forsankning|forsankta)\b", "counterbore"),
    (r"\b(?:botten\s*platt(?:a|an)|bottenplatt(?:a|an))\b", "bottom plate"),
    (r"\b(?:kort\s*sida|kortsida|kortsidorna)\b", "short sides"),
    (r"\b(?:lang\s*sida|langsida|langsidorna)\b", "long sides"),
    (r"\b(?:ingraverad\s*text|ingraverat\s*text|gravyr\s*text)\b", "engraved text"),
    (r"\b(?:upphojd\s*text|upphojt\s*text|praglad\s*text)\b", "raised text"),
    (r"\b(?:kabel\s*utskarning|kabelutskarning|sladd\s*utskarning|sladdutskarning)\b", "cable cutout"),
    (r"\b(?:skruv\s*bossar|skruvbossar|skruv\s*boss|skruvboss|distanser)\b", "screw bosses"),
    (r"\b(?:hangande\s*krok|upphangnings\s*krok|upphangningskrok)\b", "hanging hook"),
    (r"\b(?:starkare\s*modell|gor\s*den\s*starkare|gor\s*det\s*starkare)\b", "make stronger"),
    (r"\b(?:snusdosa\s*hallaren?|snus\s*dosa\s*hallaren?|snusdose\s*hallaren?)\b", "snus can holder"),
    (r"\bblackfisk\b", "octopus"),
    # Spanish
    (r"\b(?:soporte\s+(?:de\s+|para\s+)?(?:telefono|movil|celular)|porta\s*(?:telefono|movil|celular))\b", "phone stand"),
    (r"\b(?:soporte\s+(?:de\s+|para\s+)?(?:auriculares|audifonos|cascos))\b", "headphone stand"),
    (r"\b(?:porta\s*vasos?|soporte\s+(?:de\s+|para\s+)?(?:vaso|taza|copa))\b", "cup holder"),
    (r"\b(?:soporte\s+(?:de\s+|para\s+)?cable|organizador\s+de\s+cables?)\b", "cable holder"),
    (r"\b(?:montaje\s+en\s+pared|soporte\s+de\s+pared|pared\s+montado)\b", "wall mounted"),
    (r"\b(?:montaje\s+de\s+escritorio|soporte\s+de\s+escritorio|para\s+escritorio)\b", "desk mount"),
    (r"\b(?:plegable|abatible)\b", "foldable"),
    (r"\b(?:giratorio|rotatorio)\b", "rotating"),
    (r"\b(?:agujeros?\s+de\s+tornillos?|orificios?\s+de\s+tornillos?)\b", "screw holes"),
    # French
    (r"\b(?:support\s+(?:de\s+|pour\s+)?(?:telephone|portable|mobile))\b", "phone stand"),
    (r"\b(?:support\s+(?:de\s+|pour\s+)?(?:casque|ecouteurs))\b", "headphone stand"),
    (r"\b(?:support\s+mural\s+(?:pour\s+|de\s+)?(?:casque|ecouteurs))\b", "wall mounted headphone holder"),
    (r"\b(?:porte\s*(?:gobelet|tasse)|support\s+(?:de\s+|pour\s+)?(?:gobelet|tasse))\b", "cup holder"),
    (r"\b(?:support\s+(?:de\s+|pour\s+)?cable|range\s*cable)\b", "cable holder"),
    (r"\b(?:support\s+mural|fixation\s+murale|montage\s+mural)\b", "wall mounted"),
    (r"\b(?:support\s+de\s+bureau|fixation\s+de\s+bureau)\b", "desk mount"),
    (r"\b(?:pliable|rabattable)\b", "foldable"),
    (r"\b(?:rotatif|pivotant)\b", "rotating"),
    (r"\b(?:trous?\s+de\s+vis)\b", "screw holes"),
    # Italian
    (r"\b(?:supporto\s+(?:per\s+|da\s+)?telefono|porta\s*telefono|supporto\s+(?:per\s+)?cellulare)\b", "phone stand"),
    (r"\b(?:supporto\s+(?:per\s+)?cuffie|porta\s*cuffie)\b", "headphone stand"),
    (r"\b(?:porta\s*(?:tazza|bicchiere)|supporto\s+(?:per\s+)?(?:tazza|bicchiere))\b", "cup holder"),
    (r"\b(?:supporto\s+da\s+parete\s+(?:per\s+)?cavo)\b", "wall mounted cable holder"),
    (r"\b(?:porta\s*cavo|supporto\s+(?:per\s+)?cavo|organizzatore\s+cavi)\b", "cable holder"),
    (r"\b(?:supporto\s+da\s+parete|montaggio\s+a\s+parete|fissaggio\s+a\s+parete)\b", "wall mounted"),
    (r"\b(?:supporto\s+da\s+scrivania|montaggio\s+scrivania)\b", "desk mount"),
    (r"\b(?:pieghevole|richiudibile)\b", "foldable"),
    (r"\b(?:girevole|rotante)\b", "rotating"),
    (r"\b(?:fori\s+(?:per\s+)?viti)\b", "screw holes"),
    # German
    (r"\b(?:handy\s*halter|handyhalter|telefon\s*halter|telefonhalter)\b", "phone stand"),
    (r"\b(?:kopfhorer\s*stander|kopfhorerstander|kopfhorer\s*halter|kopfhorerhalter)\b", "headphone stand"),
    (r"\b(?:becher\s*halter|becherhalter|tassen\s*halter|tassenhalter)\b", "cup holder"),
    (r"\b(?:kabel\s*halter|kabelhalter|kabel\s*clip|kabelclip)\b", "cable holder"),
    (r"\b(?:wand\s*halterung|wandhalterung|wand\s*montage|wandmontage)\b", "wall mounted"),
    (r"\b(?:tisch\s*halterung|tischhalterung|schreibtisch\s*halterung|schreibtischhalterung)\b", "desk mount"),
    (r"\b(?:klappbar|faltbar)\b", "foldable"),
    (r"\b(?:drehbar|rotierend)\b", "rotating"),
    (r"\b(?:schrauben\s*locher|schraubenlocher)\b", "screw holes"),
    # Portuguese
    (r"\b(?:suporte\s+(?:de\s+|para\s+)?(?:telefone|celular|telemovel)|porta\s*(?:telefone|celular))\b", "phone stand"),
    (r"\b(?:suporte\s+(?:de\s+|para\s+)?(?:fone|fones|auscultadores|headset))\b", "headphone stand"),
    (r"\b(?:suporte\s+de\s+parede\s+(?:para\s+|de\s+)?(?:copo|caneca|xicara))\b", "wall mounted cup holder"),
    (r"\b(?:porta\s*copos?|suporte\s+(?:de\s+|para\s+)?(?:copo|caneca|xicara))\b", "cup holder"),
    (r"\b(?:suporte\s+(?:de\s+|para\s+)?cabo|organizador\s+de\s+cabos?)\b", "cable holder"),
    (r"\b(?:suporte\s+de\s+parede|montagem\s+na\s+parede|parede\s+montado)\b", "wall mounted"),
    (r"\b(?:suporte\s+de\s+mesa|montagem\s+de\s+mesa)\b", "desk mount"),
    (r"\b(?:dobravel|articulado)\b", "foldable"),
    (r"\b(?:giratorio|rotativo)\b", "rotating"),
    (r"\b(?:furos?\s+(?:de\s+|para\s+)?parafusos?)\b", "screw holes"),
)

_WORD_TRANSLATIONS: dict[str, str] = {
    "andra": "change",
    "backa": "undo",
    "baksida": "back",
    "batteri": "battery",
    "batterier": "batteries",
    "behallare": "container",
    "bit": "part",
    "bord": "desk",
    "bricka": "tray",
    "bred": "wide",
    "bredare": "wider",
    "bredd": "width",
    "boss": "boss",
    "bossar": "bosses",
    "borr": "drill",
    "borrmaskin": "drill",
    "del": "part",
    "delar": "parts",
    "djup": "depth",
    "duplicera": "duplicate",
    "dubbel": "dual",
    "dubbla": "dual",
    "extrudera": "extrude",
    "farg": "color",
    "fasa": "chamfer",
    "faste": "mount",
    "fasten": "mounts",
    "fastet": "mount",
    "fillet": "fillet",
    "flytta": "move",
    "foldbar": "foldable",
    "grej": "thing",
    "forvaring": "storage",
    "forsankt": "countersunk",
    "genomforing": "cutout",
    "gravyr": "engraving",
    "fram": "front",
    "framsida": "front",
    "hall": "hole",
    "hallare": "holder",
    "hallaren": "holder",
    "hallarna": "holders",
    "hal": "holes",
    "halen": "holes",
    "halet": "hole",
    "hog": "high",
    "hogre": "taller",
    "hojd": "height",
    "horisontell": "horizontal",
    "horlur": "headphone",
    "horlurar": "headphones",
    "horlurs": "headphone",
    "hylla": "shelf",
    "kabel": "cable",
    "klamma": "clip",
    "klammor": "clips",
    "klamfaste": "clamp mount",
    "kopp": "cup",
    "kortsida": "short side",
    "kortsidor": "short sides",
    "kortsidorna": "short sides",
    "krok": "hook",
    "krokar": "hooks",
    "laddare": "charger",
    "laddar": "charger",
    "laddning": "charging",
    "lada": "box",
    "langsida": "long side",
    "langsidor": "long sides",
    "langsidorna": "long sides",
    "linje": "line",
    "lock": "lid",
    "lang": "long",
    "langre": "longer",
    "liggande": "horizontal",
    "magnetisk": "magnetic",
    "magnet": "magnet",
    "magnetiskt": "magnetic",
    "magsafeladdare": "magsafe charger",
    "material": "material",
    "mobil": "phone",
    "montering": "mounting",
    "mugg": "mug",
    "ny": "new",
    "objekt": "object",
    "plat": "plate",
    "platta": "plate",
    "plattan": "plate",
    "popular": "popular",
    "populart": "popular",
    "praglad": "embossed",
    "radera": "delete",
    "rektangel": "rectangle",
    "ribba": "rib",
    "ribbor": "ribs",
    "rotera": "rotate",
    "roterbar": "rotating",
    "roterande": "rotating",
    "rund": "rounded",
    "runda": "rounded",
    "sida": "side",
    "sidor": "sides",
    "sidorna": "sides",
    "skala": "scale",
    "skapa": "create",
    "skruv": "screw",
    "skruvar": "screws",
    "skena": "rail",
    "skenor": "rails",
    "skal": "shell",
    "skrivbord": "desk",
    "skrivbords": "desk",
    "sladd": "cable",
    "snygg": "clean",
    "staende": "vertical",
    "stativ": "stand",
    "stall": "stand",
    "stallet": "stand",
    "stallning": "stand",
    "storre": "larger",
    "stark": "strong",
    "starkare": "stronger",
    "text": "text",
    "tjock": "thick",
    "tjockare": "thicker",
    "tjocklek": "thickness",
    "tunnare": "thinner",
    "undersida": "bottom",
    "upphojd": "raised",
    "upphojt": "raised",
    "utskarning": "cutout",
    "utskarningar": "cutouts",
    "utanfor": "outside",
    "vagghangd": "wall mounted",
    "vaggmonterad": "wall mounted",
    "vagg": "wall",
    "verktyg": "tool",
    "verktygs": "tool",
    "vertikal": "vertical",
    "vikbar": "foldable",
    "ingravera": "engrave",
    "ingraverad": "engraved",
    "ingraverat": "engraved",
    "logga": "logo",
    "ovansida": "top",
    "distans": "standoff",
    "distanser": "standoffs",
    # Spanish
    "agujero": "hole",
    "agujeros": "holes",
    "auriculares": "headphones",
    "cable": "cable",
    "cables": "cables",
    "caja": "box",
    "celular": "phone",
    "escritorio": "desk",
    "giratorio": "rotating",
    "movil": "phone",
    "pared": "wall",
    "plegable": "foldable",
    "soporte": "holder",
    "taza": "mug",
    "telefono": "phone",
    "tornillo": "screw",
    "tornillos": "screws",
    "vaso": "cup",
    # French
    "bureau": "desk",
    "casque": "headphone",
    "ecouteurs": "headphones",
    "gobelet": "cup",
    "mural": "wall",
    "murale": "wall",
    "pivotant": "rotating",
    "pliable": "foldable",
    "support": "holder",
    "tasse": "mug",
    "telephone": "phone",
    "trou": "hole",
    "trous": "holes",
    "vis": "screws",
    # Italian
    "bicchiere": "cup",
    "cellulare": "phone",
    "cavo": "cable",
    "cavi": "cables",
    "cuffie": "headphones",
    "girevole": "rotating",
    "parete": "wall",
    "pieghevole": "foldable",
    "scrivania": "desk",
    "supporto": "holder",
    "viti": "screws",
    # German
    "becher": "cup",
    "drehbar": "rotating",
    "faltbar": "foldable",
    "handy": "phone",
    "halter": "holder",
    "halterung": "holder",
    "klappbar": "foldable",
    "kopfhorer": "headphone",
    "schrauben": "screws",
    "schreibtisch": "desk",
    "tisch": "desk",
    "wand": "wall",
    # Portuguese
    "cabo": "cable",
    "cabos": "cables",
    "caneca": "mug",
    "celular": "phone",
    "copo": "cup",
    "dobravel": "foldable",
    "fone": "headphone",
    "fones": "headphones",
    "furos": "holes",
    "mesa": "desk",
    "parede": "wall",
    "parafuso": "screw",
    "parafusos": "screws",
    "rotativo": "rotating",
    "suporte": "holder",
    "telemovel": "phone",
    "xicara": "mug",
}

_COMPOUND_SUFFIX_TRANSLATIONS: tuple[tuple[str, str], ...] = (
    ("hallarna", "holders"),
    ("hallaren", "holder"),
    ("hallare", "holder"),
    ("stallet", "stand"),
    ("stallning", "stand"),
    ("stall", "stand"),
    ("fastet", "mount"),
    ("faste", "mount"),
    ("monteringen", "mount"),
    ("montering", "mount"),
    ("hyllan", "shelf"),
    ("hylla", "shelf"),
    ("krokar", "hooks"),
    ("krok", "hook"),
    ("klamma", "clip"),
    ("klammor", "clips"),
    ("lada", "box"),
    ("boxen", "box"),
    ("box", "box"),
)

_STOP_WORDS = {
    "a",
    "add",
    "an",
    "and",
    "att",
    "av",
    "build",
    "bygg",
    "cad",
    "create",
    "change",
    "den",
    "det",
    "design",
    "do",
    "en",
    "ett",
    "for",
    "fran",
    "from",
    "generate",
    "generera",
    "gor",
    "i",
    "it",
    "make",
    "med",
    "min",
    "mina",
    "mitt",
    "model",
    "modell",
    "modify",
    "och",
    "pa",
    "print",
    "rita",
    "skriv",
    "som",
    "that",
    "the",
    "till",
    "to",
    "ut",
    "with",
    "con",
    "de",
    "del",
    "des",
    "el",
    "la",
    "le",
    "les",
    "los",
    "para",
    "par",
    "per",
    "pour",
    "por",
    "und",
    "von",
    "zu",
    "da",
    "di",
}

_SWEDISH_HINTS = {
    "andra",
    "att",
    "av",
    "batteri",
    "batterier",
    "boss",
    "bossar",
    "bottenplatta",
    "bygg",
    "del",
    "duplicera",
    "den",
    "det",
    "en",
    "ett",
    "farg",
    "faste",
    "flytta",
    "for",
    "forsankt",
    "fran",
    "genomforing",
    "generera",
    "gor",
    "hallare",
    "hal",
    "hogre",
    "hojd",
    "horlur",
    "ingravera",
    "ingraverat",
    "kabel",
    "klamma",
    "kortsida",
    "kortsidorna",
    "laddare",
    "lagg",
    "langsida",
    "langsidorna",
    "liggande",
    "logga",
    "magnetisk",
    "med",
    "mobil",
    "montering",
    "och",
    "objekt",
    "pa",
    "radera",
    "rita",
    "ribba",
    "ribbor",
    "rotera",
    "roterbar",
    "runda",
    "skruv",
    "skrivbord",
    "sidorna",
    "sladd",
    "staende",
    "stall",
    "starkare",
    "ta",
    "text",
    "tjockare",
    "till",
    "upphojd",
    "utskarning",
    "utanfor",
    "vagg",
    "vikbar",
}


def _repair_mojibake(value: str) -> str:
    if "\u00c3" not in value and "\u00c2" not in value:
        return value
    try:
        repaired = value.encode("latin1").decode("utf-8")
    except UnicodeError:
        return value
    nordic_chars = ("\u00e5", "\u00e4", "\u00f6", "\u00c5", "\u00c4", "\u00d6")
    return repaired if any(char in repaired for char in nordic_chars) else value


def fold_prompt_text(prompt: str) -> str:
    """Return lowercase ASCII-ish prompt text suitable for token matching."""
    text = _repair_mojibake(str(prompt or ""))
    text = re.sub(r"(?<=\d),(?=\d)", ".", text)
    text = text.replace("&", " and ")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.lower()
    text = re.sub(r"[^a-z0-9.]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _apply_phrase_translations(text: str) -> str:
    translated = text
    for pattern, replacement in _PHRASE_TRANSLATIONS:
        translated = re.sub(pattern, replacement, translated)
    translated = re.sub(r"\b(?:lagg\s+till|lagga\s+till)\b", "add", translated)
    translated = re.sub(r"\b(?:ta\s+bort)\b", "remove", translated)
    translated = re.sub(r"\s+", " ", translated).strip()
    return translated


def _dedupe_words(words: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for word in words:
        if word not in seen:
            seen.add(word)
            result.append(word)
    return result


def _translate_token(token: str, depth: int = 0) -> str:
    mapped = _WORD_TRANSLATIONS.get(token)
    if mapped:
        return mapped
    if depth >= 3 or len(token) < 6:
        return token
    for suffix, suffix_translation in _COMPOUND_SUFFIX_TRANSLATIONS:
        if not token.endswith(suffix):
            continue
        prefix = token[: -len(suffix)]
        if len(prefix) < 3:
            continue
        prefix_translation = _translate_token(prefix, depth + 1)
        if prefix_translation == prefix and prefix.endswith("s") and len(prefix) > 4:
            prefix_translation = _translate_token(prefix[:-1], depth + 1)
        words = [prefix_translation, suffix_translation]
        return " ".join(word for word in words if word).strip()
    return token


def normalize_source_query(prompt: str) -> str:
    """Translate common Swedish CAD/model wording into an English search query."""
    folded = fold_prompt_text(prompt)
    if not folded:
        return ""
    translated_text = _apply_phrase_translations(folded)
    words: list[str] = []
    for token in _TOKEN_RE.findall(translated_text):
        mapped = _translate_token(token)
        for word in mapped.split():
            if len(word) <= 1 or word in _STOP_WORDS:
                continue
            words.append(word)
    query = " ".join(_dedupe_words(words))
    return query or folded


def looks_swedish_prompt(prompt: str) -> bool:
    folded = fold_prompt_text(prompt)
    if not folded:
        return False
    if any(re.search(pattern, folded) for pattern, _replacement in _PHRASE_TRANSLATIONS):
        return True
    return bool(set(_TOKEN_RE.findall(folded)) & _SWEDISH_HINTS)


def translated_query_action(prompt: str) -> str | None:
    """Return a UI/debug action when a Swedish prompt is translated."""
    if not looks_swedish_prompt(prompt):
        return None
    query = normalize_source_query(prompt)
    if not query:
        return None
    return f'translated-query: "{query}"'
