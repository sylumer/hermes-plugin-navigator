# Development

Technical reference for working on the plugin itself. For install/usage, see
[README.md](README.md).

## API

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

Locations are stored in `locations.json`, next to the plugin install (not
inside `dashboard/`), and managed entirely through the API above — nothing
needs to be added to Hermes' own `config.yaml` beyond enabling the plugin.

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

## Iterating against a live Hermes install

Not tracked in this repo (see `.git/info/exclude`): a local `sync-to-hermes.sh`
helper that rsyncs `dashboard/` into `~/.hermes/plugins/navigator/dashboard`
for fast iteration, then restart the dashboard or hit the rescan endpoint.
