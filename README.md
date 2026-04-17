# Deep Aquarium

A procedural, browser-based 3D aquarium built with Three.js. Designed as an
ambient art piece — something you can leave running and watch drift by.

Deep-sea mystery ✕ healing vibe, with six hand-tuned procedural creatures
swimming, pulsing, and crawling through a caustics-lit tank.

> **Live demo:** GitHub Pages → open the repo's Pages URL
> (`https://<user>.github.io/3D-aquarium/`).

---

## Features

- **6 procedural creatures**, each with unique geometry and behavior:
  - **クラゲ / Jellyfish** — translucent bell (`MeshPhysicalMaterial` transmission),
    inner additive glow, 8 wavy tentacles + 16 fringe strands, sin³ pulsing
    with small upward thrust on each pulse.
  - **シーラカンス / Coelacanth** — lathe body with oval cross-section, signature
    3-lobe diphycercal tail, multiple lobed pectoral/pelvic fins, cream-spot
    texture. Heavy slow swim.
  - **アリゲーターガー / Alligator gar** — long cylindrical body with needle snout,
    forked tail, ganoid-diamond scale texture. Reacts to food.
  - **ピラルク / Pirarucu** — hero fish. Huge flattened-head torpedo body with
    crimson back-half scales, large paddle tail. Reacts to food.
  - **三葉虫 / Trilobite** — three-lobe segmented crawler pinned to the seafloor.
    Head shield + 8 thorax ribs + tail shield + 16 articulated legs.
  - **ダイオウグソクムシ / Giant isopod** — heavy chitinous crawler with 7 overlapping
    segment plates, pleotelson tail fan, antennae, 14 two-segment legs.
    Occasional idle pauses.
- **Intent-driven motion** — no plain sin-wave swimming. Steering seeks a
  wandering target with wall avoidance, accel-limited turns, and per-species
  depth preferences. Fins scull independently, body banks into turns, pitch
  follows vertical velocity, and the shared fish-bend shader curls the tail
  outward on every turn.
- **Water-volume rendering** — volumetric fog, vertical-gradient navy→black
  background, 2-layer blue/emerald point-light fill, animated Worley-ish
  caustics injected into the seafloor material, soft additive god rays,
  drifting plankton (`THREE.Points`) sized by depth, rising bubble streams
  (`InstancedMesh`), and background rock silhouettes.
- **Feeding** — click empty water (or the 餌 button) to drop a food pellet.
  Pirarucu + gar detect it, bubble trails rise, audio reacts.
- **Ambient / cinematic camera** — left alone for a few seconds, the camera
  slowly orbits through 5 scripted waypoints with soft drift. Any interaction
  pauses it for 10s.
- **Procedural WebAudio** — zero hosted audio assets. Pink-noise rumble,
  breathing ambience, motion layer whose gain tracks mean fish speed,
  periodic bubble pips, feed splash + pitch-sweep, chomp thud.
- **Minimal UI** — species zoom, ambient toggle, sound toggle, feed button.
  Frosted-glass panel; auto-dims when idle.
- **Mobile-friendly** — mobile detection tunes pixel ratio, antialias,
  shadows, and creature counts. Target ≥30fps on phones.

## Controls

| Action            | Result                                      |
|-------------------|---------------------------------------------|
| **Drag**          | Rotate camera                                |
| **Wheel / Pinch** | Zoom                                         |
| **Tap creature**  | Smoothly follow it — drag to cancel          |
| **Tap water**     | Drop food — pirarucu & gar swim to it        |
| **Species button**| Zoom & follow a random instance of that species |
| **鑑賞 toggle**   | Ambient/cinematic camera on/off              |
| **音 toggle**     | Sound on/off (muted by default)              |
| **餌 button**     | Drop food at a random spot over the tank     |

## File layout

```
/index.html          importmap, canvas, UI markup
/style.css           frosted-glass UI styling
/README.md
/js/
  main.js            entry point, animation loop, state, food manager, UI wiring
  scene.js           fog, background, lights, caustics, god rays, plankton,
                     bubbles, seafloor, background rocks
  controls.js        OrbitControls + click discrimination + follow mode +
                     ambient waypoint cinema
  audio.js           WebAudio graph (rumble, ambience, motion, bubble, feed)
  creatures/
    Creature.js      shared steering base class (seek/wander/wall-avoid/orient)
    fishBend.js      shared vertex-shader helper for tail wave + heading curl
    Jellyfish.js
    Coelacanth.js
    Gar.js
    Pirarucu.js
    Trilobite.js
    GiantIsopod.js
```

## Running locally

The app uses native ES modules via an import map, so it needs a static HTTP
server (file:// URLs cannot load module scripts):

```bash
# Python 3
python3 -m http.server 8000

# Node (npx, no install)
npx serve .

# Any other static server works too
```

Then open http://localhost:8000.

Dependencies are fetched from unpkg at runtime:
- `three@0.160.0` — `build/three.module.js`
- `three@0.160.0` — `examples/jsm/controls/OrbitControls.js`

No npm install, no bundler, no build step.

## GitHub Pages deploy

1. Push this branch to `main` (or enable Pages on the feature branch).
2. In repo **Settings → Pages**, pick the branch + `/ (root)` directory.
3. All asset paths are relative, so it works under a project path
   (`/3D-aquarium/`) without configuration.

## Performance notes

- Triangle budget: ~40k on screen, ~60 draw calls.
- Canvas textures: ≤ 1024×256 (pirarucu body), ≤ 512² for sand.
- `devicePixelRatio` capped at 1.5 desktop / 1.25 mobile.
- Shadows are **off on mobile** and only the key `DirectionalLight` casts
  them on desktop (512² shadow map).
- If FPS dips on a low-end device: mobile-detection already drops god rays
  from 6 → 3 and plankton 1500 → 800. You can further halve the creature
  counts in `js/main.js`.

## Extending

- **New creature**: extend `Creature` in `js/creatures/`, export a `spawn*`
  helper, import it in `main.js`, and add an instance count.
- **New fish that bends**: reuse `makeFishBendUniforms` + `injectFishBend`
  from `js/creatures/fishBend.js` on each sub-mesh's material so body and
  fins bend in lock-step.
- **New sound**: add a trigger function in `js/audio.js` mirroring the
  existing `triggerBubble` / `triggerFeed` style.
- **New waypoint**: push to the `waypoints` array in `js/controls.js`.

## Tech

- Three.js r160 (unpkg CDN, no bundler)
- ES modules + `<script type="importmap">`
- WebGL 2 preferred, WebGL 1 fallback via Three.js
- WebAudio API

## License

MIT.
