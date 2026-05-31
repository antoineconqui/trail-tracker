# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What's in this repo

```
trail-tracker/
├── index.html          # Dashboard public (Cloudflare Pages)
├── config-ecouves.json # Config race chargée au runtime par le dashboard
├── Ecouves 2025 off.gpx  # Tracé GPX du parcours
└── setup.sh            # Script pré-course : pousse la config dans le Worker KV
```

> `worker.js` et `extension/` ne sont pas dans ce repo — le Worker est géré directement dans Cloudflare Dashboard, l'extension Chrome est gérée séparément.

## URLs

- Dashboard : `https://trail-tracker.pages.dev/`
- Worker    : `https://aged-frog-1690.antoineconqui.workers.dev`
- Config    : `https://raw.githubusercontent.com/antoineconqui/trail-tracker/main/config-ecouves.json`
- GPX       : `https://raw.githubusercontent.com/antoineconqui/trail-tracker/main/Ecouves%202025%20off.gpx`

## Commande pré-course

```bash
bash setup.sh
```

Pousse la config et vérifie que le Worker répond. À exécuter une fois avant chaque course. `ADMIN_SECRET` est défini dans le script (ne pas commiter de valeur de prod).

## Flux de données

```
Garmin Watch → Garmin App → livetrack.garmin.com
                                    ↓
                         Chrome Extension (content_main.js)
                         intercepte les fetch() de la page
                                    ↓
                         Worker POST /relay → KV Storage
                                    ↓
                    Dashboard (index.html) GET /data toutes les 30s
```

## Worker routes

- `POST /relay`  — appelé par l'extension, stocke session + trackpoints dans KV
- `GET /data`    — appelé par le dashboard, retourne session + points depuis KV
- `GET /current` — session active courante (TTL 24h, auto-set par /relay)
- `GET /config`  — race config depuis KV (fallback si configUrl échoue)
- `POST /config` — admin, requiert header `X-Admin-Secret`
- `GET /chat`    — messages live
- `POST /chat`   — envoyer un message

## KV Cloudflare (binding: KV)

| Clé              | Valeur                                  |
|------------------|-----------------------------------------|
| `current`        | `{sid, start, name}` TTL 24h            |
| `{sid}:meta`     | session Garmin JSON                     |
| `{sid}:pts`      | array trackpoints accumulés             |
| `{sid}:chat`     | array messages (max 150)                |
| `raceConfig`     | fallback config si GitHub indisponible  |

## config-ecouves.json — structure

```json
{
  "name": "Trail d'Écouves",
  "distKm": 61,
  "totalDplus": 1950,
  "totalDminus": 1950,
  "gpxUrl": "...",
  "phases": [{ "label", "title", "description", "kmStart", "kmEnd", "fcMax", "color" }],
  "waypoints": [{ "km", "label" }],
  "ravitos": [{ "name", "km", "lat", "lon", "services" }]
}
```

Pour une nouvelle course : copier/modifier ce fichier, mettre à jour `configUrl` dans `index.html` (ligne `C.configUrl`).

## Dashboard — conventions JS (index.html)

Tout le code est dans un seul `<script>` en vanilla JS, organisé par sections séparées de commentaires `═══`.

- `C` = CONFIG (proxy URL, sessionId, race config)
- `S` = STATE (points, distances, km history, chat)
- `GPX` = modèle GPX parsé (pts[], totalDist, totalDplus)
- Polling data : 30s | Polling chat : 15s
- `projectFwd()` : projection GPS → km tracé, forward-only, se gèle si >200m du tracé
- `paceDriftModel()` : régression linéaire sur 8 derniers km → ETA avec dérive
- KM history : labels 0-indexés (km 0 = segment 0→1)
- `renderElev()` : génère le SVG du profil altimétrique inline (pas de lib)
- `checkWp()` : déclenche un toast au passage d'un waypoint ou ravito, état persisté en localStorage

## Extension Chrome — règles importantes

- `content_main.js` tourne en `world: MAIN` pour patcher `window.fetch`
- Communication inter-world via `document.dispatchEvent` (pas `window`)
- `content_bridge.js` écoute sur `document` et appelle `chrome.runtime.sendMessage`
- Flush toutes les 30s vers le Worker (throttle KV writes ≤ 1000/jour)

## Icônes ravitos (ravitoIcon)

| Services        | Icône | Couleur  |
|-----------------|-------|----------|
| Eau uniquement  | 💧    | #4fa3ff  |
| Solide + eau    | 🍽️    | #ffc532  |
| + famille       | ❤️    | #ff3d5a  |

## Ce qui n'est pas dans ce repo

- Secrets Worker (`ADMIN_SECRET`, `GARMIN_COOKIE`) → Cloudflare Dashboard > Variables
- KV namespace `LIVETRACK` → Cloudflare Dashboard > KV
- Code Worker (`worker.js`) → Cloudflare Dashboard > Workers
- Chrome Extension → gérée séparément
