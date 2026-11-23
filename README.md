# Frontier Studio

**The source is the exhibit.** A static room for 61 creative front-end works, with 53 complete source repositories and a local demo for every card.

- **Live:** https://bear20252026.github.io/frontier-studio/
- **Atlas room cover:** https://bear20252026.github.io/frontier-studio/room.html
- **Snapshot:** 2026-11-22
- **Size:** ~202 MB of upstream source; ~233 MB in the repository after including the built Jeantimex demos (well under the 1 GB Pages ceiling)

## The six volumes

| Volume | Author / Theme | Works |
|---|---|---:|
| `01-saharan` | Saharan / Oimo — liquid light | 6 |
| `02-david-li` | David Li — the fluid canon | 4 |
| `03-amanda-ghassaei` | Amanda Ghassaei — simulation lab | 6 |
| `04-jeantimex` | Jeantimex — WebGPU weather | 4 |
| `05-codrops-motion` | Codrops — motion studies | 14 |
| `06-codrops-worlds` | Codrops — built worlds | 27 |
| **Total** | | **61** |

## What is in the repository

```
index.html            the wall — 61 cards, six volumes, filter + search
room.html             lightweight cover page for the Frontier Atlas
volumes/*.html        six volume pages
sources.html          ledger of all 53 repositories
notes.html            method, capability notes and rights
source/<owner>/<repo> complete upstream snapshots
assets/               shared CSS, filter script, one local Flow preview
tools/serve.js        tiny local static server
SOURCE.md             per-work and per-repository ledger
```

## Run locally

```bash
node tools/serve.js 8901
# open http://127.0.0.1:8901/
```

A static server is required because several WebGL/WebGPU demos load shaders, WASM or JSON with `fetch`. Opening `index.html` via `file://` will not be enough.

## Demo caveats

- WebGPU demos (`WebGPU Water`, `Lenticular Lens`, `Raindrop`) need a WebGPU-capable browser and GPU.
- `Saharan Water` may stay black under software rendering (SwiftShader); the source is present and works on hardware WebGL.
- `Jeantimex` repositories are Vite projects; their `dist/` builds are included and used by the cards. The untouched source remains alongside them.
- Codrops pieces sometimes pull fonts or analytics from their original CDNs; the interaction code itself is local.

## Rights

All source is © the original authors and is included as a study snapshot. Each upstream repository keeps its own `LICENSE` and `README`; read those before reuse. This archive does not relicense the work or imply commercial availability. Codrops demos remain under the terms attached to their respective repositories. See `SOURCE.md` and `notes.html`.

Site code (HTML/CSS/filter script) may be reused freely; the works may not.
