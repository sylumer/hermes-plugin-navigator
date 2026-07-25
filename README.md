# hermes-plugin-navigator

A [Hermes Agent](https://hermes-agent.nousresearch.com) dashboard plugin that
browses Markdown files across any number of user-configured folder
locations — a single "Navigator" tab with a location switcher, instead of
one hardcoded plugin per folder.

## What it does

Adds a `Navigator` tab to the dashboard (after `Kanban`) with a file-tree
sidebar, search/filter, and a rendered-Markdown content pane. Unlike a
folder-specific browser, locations aren't baked into the plugin — you add,
switch between, and remove named folders (`{ key, label, path }`) from the
UI itself. The list is stored in `locations.json` next to the plugin and
managed entirely through its own API; nothing needs to be added to Hermes'
own `config.yaml` beyond enabling the plugin.

The backend exposes:

```
GET    /api/plugins/navigator/locations              → [{key, label, path}, ...]
POST   /api/plugins/navigator/locations               body: {label, path}
DELETE /api/plugins/navigator/locations/{key}
GET    /api/plugins/navigator/tree?location=<key>
GET    /api/plugins/navigator/content?location=<key>&path=<relpath>
GET    /api/plugins/navigator/list?location=<key>&dir=<reldir>
```

Every read (`tree`/`content`/`list`) resolves and validates the requested
path against the location's own base directory, rejecting symlinks and any
path that escapes it.

On first request, `locations.json` is seeded with two example locations
(`~/.hermes/exomemory` and `~/.hermes/opportunities`) — edit or remove them
from the UI once you've added your own.

## Install

```bash
git clone https://github.com/sylumer/hermes-plugin-navigator.git ~/.hermes/plugins/navigator
hermes plugins enable navigator
```

Then either restart the dashboard or hit `GET /api/dashboard/plugins/rescan`.

To uninstall: `rm -rf ~/.hermes/plugins/navigator` and rescan (this also
deletes its `locations.json`, so back that up first if you want to keep the
configured folder list).

## Adding a location

From the Navigator tab: click `+` in the sidebar header, give it a name and
a folder path (`~` is expanded), and save. Switch between configured
locations with the dropdown; click `−` to remove the currently selected one
(with an inline confirm, no browser `confirm()` dialog).

## Files

| File | Purpose |
|---|---|
| `dashboard/manifest.json` | Tab declaration, icon, version |
| `dashboard/dist/index.js` | Compiled React bundle — location switcher + file tree + Markdown viewer |
| `dashboard/dist/style.css` | Styles (`filenav__*` classes) |
| `dashboard/plugin_api.py` | FastAPI router mounted at `/api/plugins/navigator/` — locations CRUD + tree/content/list |

There's no build step — `dist/index.js` is committed directly as a plain
IIFE against the dashboard's plugin SDK (`window.__HERMES_PLUGIN_SDK__`), the
same pattern used by Hermes' own reference plugins. To modify the UI, edit
`dashboard/dist/index.js` directly.

## Credits

Started from Hermes Agent's `exomemory-navigator` / `opportunities-navigator`
reference plugins — same file-tree-and-Markdown-viewer shape, generalized to
support more than one hardcoded folder.
