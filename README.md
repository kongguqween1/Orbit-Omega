# ORBIT Ω — A 100 Trillion Token Genesis

A cinematic, single-page WebGL experience celebrating an imagined creator
incentive — 100,000,000,000,000 tokens of compute released to people who
build the next intelligence. Inspired by minimal Asian-tech aesthetics
but rebuilt as an interactive star field rather than a static landing page.

## What's inside

- **Custom-shader spiral galaxy** — ~80,000 GPU-driven stars with
  differential rotation, twinkle, mouse parallax and a click-to-pulse
  ripple. Written in raw GLSL on top of `THREE.Points`.
- **Cinematic post-processing** — `UnrealBloomPass` + a tiny chromatic
  aberration / vignette / grain pass for that anamorphic look.
- **Live token counter** — monotonic 15-digit display ticking out
  ~38M tokens / second with smooth in-place digit animations.
- **HUD telemetry** — animated lat/lon, T-minus countdown, SIG status.
- **WebAudio ambient pad** — a synthesised drone (no audio assets)
  with detuned oscillators, LFO-modulated gain and stereo delay.
- **Cursor-aware UI** — bespoke cursor with smoothed lag ring and
  hover-state morphing across interactive elements.
- **Glassmorphic sections** — manifesto, model constellation, tier
  pricing, application form. All hand-rolled, no UI framework.

## Tech

Pure HTML / CSS / ES modules. No bundler. Three.js loaded via importmap
from a CDN. Designed to drop straight onto any static host.

```
orbit-omega/
├─ index.html
├─ styles/
│  └─ main.css
├─ scripts/
│  ├─ galaxy.js   # WebGL scene + GLSL
│  └─ app.js      # UI, cursor, counter, audio, form
└─ netlify.toml
```

## Run locally

Any static server will do. From the project folder:

```bash
# Python
python -m http.server 5173

# Node
npx serve -l 5173

# PowerShell one-liner
npx --yes http-server . -p 5173
```

Then open <http://localhost:5173>.

## Performance notes

- Pixel ratio is clamped to `1.75` to keep mid-tier laptops at 60fps
  while still looking sharp on retina.
- The galaxy uses additive blending and disables depth-write — there
  are no transparent overdraw cliffs.
- A `prefers-reduced-motion` branch disables intro animation timing
  and slow boot; a `pointer: coarse` branch hides the custom cursor
  and switches to OS cursor for touch.

## Deploy

Drop the folder on Netlify, Vercel, GitHub Pages, Cloudflare Pages —
no build step required. A `netlify.toml` is provided for one-click.

## License

For demonstration purposes. The "100T Token Genesis" is a fictional
creator incentive.
