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

## The four axes

Every work is classified once on each axis, so the same 61 works can be read as forms, mechanisms, engines or tempos:

| Axis | Values | What it answers |
|---|---|---|
| **Form** | Fluid · Life · Structure · Interface · Image · Type · Space | What the work is |
| **Mechanism** | Simulate · Generate · Scroll · Hover · Transition · Navigate · Compose | How it moves |
| **Engine** | WebGPU · WebGL · DOM · SVG · Canvas | What renders it |
| **Tempo** | Ambient · Reactive · Cinematic · Playful | How it feels |

The index lives at `taxonomy.html`; the machine-readable mappings are in `assets/taxonomy.json`. The wall supports all four axes at once, plus volume and free-text search.

## What is in the repository

```
index.html            the wall — 61 cards, six volumes, filter + search + four-axis facets
taxonomy.html         the classified index — four axes, 7×7 matrix, 61-row ledger
room.html             lightweight cover page for the Frontier Atlas
volumes/*.html        six volume pages with an “Indexed as” summary
sources.html          ledger of all 53 repositories
notes.html            method, capability notes and rights
source/<owner>/<repo> complete upstream snapshots
assets/               shared CSS, filter script, one local Flow preview, taxonomy.json
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

- WebGPU demos (`Saharan Water`, `WebGPU Water`, `Lenticular Lens`, `Raindrop`) need a WebGPU-capable browser and GPU; under software rendering they may stay black.
- `Jeantimex` repositories are Vite projects; their `dist/` builds are included and used by the cards. The untouched source remains alongside them.
- Some Codrops pieces begin on an interaction: `Menu to Grid` opens with a cursor dot, and hover-led pieces need a pointer to reveal their state.
- Codrops pieces sometimes pull fonts or analytics from their original CDNs; the interaction code itself is local.

## Rights

All source is © the original authors and is included as a study snapshot. Each upstream repository keeps its own `LICENSE` and `README`; read those before reuse. This archive does not relicense the work or imply commercial availability. Codrops demos remain under the terms attached to their respective repositories. See `SOURCE.md` and `notes.html`.

Site code (HTML/CSS/filter script) may be reused freely; the works may not.
