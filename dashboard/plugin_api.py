"""FastAPI routes for the Navigator plugin.

Browses Markdown files across user-configured folder "locations" —
successor to the hardcoded exomemory-navigator / opportunities-navigator
plugins. Locations are stored in ``locations.json`` next to this plugin
(sibling of ``dashboard/``) and managed entirely through the API below;
there's no dependency on Hermes' own config.yaml.

Mounted at /api/plugins/navigator/ by the dashboard plugin system.
"""

import json
import os
import re
import sys
from pathlib import Path

import markdown

# Fix for dashboard's importlib loader
_plugin_dir = Path(__file__).resolve().parent
if str(_plugin_dir) not in sys.path:
    sys.path.insert(0, str(_plugin_dir))

from fastapi import APIRouter
from pydantic import BaseModel
from starlette.responses import JSONResponse

MAX_FILE_SIZE = 500 * 1024  # 500KB
LOCATIONS_FILE = _plugin_dir.parent / "locations.json"

router = APIRouter()


class _AddLocationBody(BaseModel):
    label: str
    path: str


def _default_locations() -> list:
    """Seed locations matching the two plugins this one replaces."""
    return [
        {"key": "exomemory", "label": "Exomemory", "path": "~/.hermes/exomemory"},
        {"key": "opportunities", "label": "Opportunities", "path": "~/.hermes/opportunities"},
    ]


def _load_locations() -> list:
    if not LOCATIONS_FILE.exists():
        seeded = _default_locations()
        _save_locations(seeded)
        return seeded
    try:
        return json.loads(LOCATIONS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_locations(locations: list) -> None:
    LOCATIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    LOCATIONS_FILE.write_text(json.dumps(locations, indent=2), encoding="utf-8")


def _slugify(label: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "-", label.strip().lower()).strip("-")
    return key or "location"


def _find_location(key: str):
    for loc in _load_locations():
        if loc["key"] == key:
            return loc
    return None


def _base_dir(location: dict) -> Path:
    return Path(os.path.expanduser(location["path"])).resolve()


def _validate_path(base_dir: Path, requested: str):
    """Resolve and validate that requested path stays under base_dir."""
    full = (base_dir / requested).resolve()
    if full != base_dir and base_dir not in full.parents:
        return None
    if full.is_symlink():
        return None
    return full


@router.get("/locations")
def list_locations():
    return _load_locations()


@router.post("/locations")
def add_location(body: _AddLocationBody):
    label = body.label.strip()
    path = body.path.strip()
    if not label or not path:
        return JSONResponse({"error": "label and path are required"}, status_code=400)

    locations = _load_locations()
    base_key = _slugify(label)
    key = base_key
    existing_keys = {loc["key"] for loc in locations}
    i = 2
    while key in existing_keys:
        key = f"{base_key}-{i}"
        i += 1

    entry = {"key": key, "label": label, "path": path}
    locations.append(entry)
    _save_locations(locations)
    return entry


@router.delete("/locations/{key}")
def delete_location(key: str):
    locations = _load_locations()
    remaining = [loc for loc in locations if loc["key"] != key]
    if len(remaining) == len(locations):
        return JSONResponse({"error": "Location not found"}, status_code=404)
    _save_locations(remaining)
    return {"ok": True}


@router.get("/tree")
def get_tree(location: str):
    """Return directory tree of the given location as nested JSON."""
    loc = _find_location(location)
    if loc is None:
        return JSONResponse({"error": "Unknown location"}, status_code=404)
    base_dir = _base_dir(loc)

    def _build_tree(directory: Path):
        dirs = []
        files = []
        try:
            for item in sorted(directory.iterdir()):
                if item.name.startswith("."):
                    continue
                if item.is_dir():
                    dirs.append(_build_tree(item))
                elif item.suffix == ".md":
                    rel = str(item.relative_to(base_dir))
                    files.append({"name": item.name, "path": rel})
        except (PermissionError, FileNotFoundError):
            pass
        result = []
        for d in dirs:
            result.append({"name": d["name"], "type": "dir", "children": d["children"]})
        for f in files:
            result.append({"name": f["name"], "type": "file", "path": f["path"]})
        return {"name": directory.name, "type": "dir", "children": result}

    if base_dir.exists():
        return _build_tree(base_dir)
    return {"name": loc["label"], "type": "dir", "children": []}


@router.get("/content")
def get_content(location: str, path: str):
    """Read raw text content of a markdown file and return rendered HTML."""
    loc = _find_location(location)
    if loc is None:
        return JSONResponse({"error": "Unknown location"}, status_code=404)
    base_dir = _base_dir(loc)
    full = _validate_path(base_dir, path)
    if full is None or not full.is_file():
        return JSONResponse({"error": "File not found"}, status_code=404)
    if full.stat().st_size > MAX_FILE_SIZE:
        return JSONResponse({"error": "File too large"}, status_code=413)
    try:
        text = full.read_text(encoding="utf-8", errors="replace")
        md = markdown.Markdown(
            extensions=["tables", "fenced_code", "codehilite", "toc"],
            extension_configs={"codehilite": {"use_pygments": True}}
        )
        html = md.convert(text)
        return {
            "path": path,
            "content": text,
            "html": html,
            "size": full.stat().st_size
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/list")
def list_files(location: str, dir: str = ""):
    """List all .md files under a directory within the location (flat list)."""
    loc = _find_location(location)
    if loc is None:
        return []
    base_dir = _base_dir(loc)
    base = _validate_path(base_dir, dir)
    if base is None or not base.is_dir():
        return []
    files = []
    for md in sorted(base.rglob("*.md")):
        rel = str(md.relative_to(base_dir))
        files.append({"name": md.name, "path": rel})
    return files
