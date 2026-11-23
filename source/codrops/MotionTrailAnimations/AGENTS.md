# AGENTS.md

Notes for coding agents working on this repo. Read [README.md](README.md) first for what the demo is.

## Setup

- There is no build step, no package.json and nothing to install. Plain HTML, CSS and ES modules.
- Serve the root with any static server (`npx serve .` or `python3 -m http.server`). ES modules don't load from `file://`.
- GSAP is vendored as `js/gsap.min.js` and loaded as a classic script before the page's module, so `gsap` is a global. Don't import it.
- three.js r186 is vendored in `js/three/` for the WebGL pages (12–16). three.js only publishes unminified builds; these are jsDelivr's minified copies of `three.core.js`, `three.webgpu.js` and `three.tsl.js`. The WebGL pages load them through an import map: `three/webgpu` and `three/tsl` point at the files, and a third entry maps `./js/three/three.core.js` (which `three.webgpu.min.js` imports by that name) to `three.core.min.js`. Keep the map when copying a WebGL page.
- There are no automated tests. Check a change in a browser: move the pointer over the content area slowly and fast, pause and move again, resize the window, drag with touch (or touch emulation), turn on reduced motion, and look at the console. For the WebGL pages, also check one browser with WebGPU and one without (three.js falls back to WebGL 2 on its own).

## Map

| Path                         | What it is                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `index.html`…`index16.html`  | One page per variation (01 is `index.html`). Same markup; they differ in the `demo-<N>` body class, `<title>`, meta title and subtitle, the ten images and the scripts. |
| `js/trail.js`                | The trail engine every variation runs on: `Trail` (pointer, trailing position, when and where to show the next image, resets) and `fillPool`. |
| `js/demo<N>/index.js`        | Start-up: preloads the images and fonts, creates the `ImageTrail`, removes `loading` from the body. The same in demos 01–11; the WebGL pages 12–16 share their own (below). |
| `js/demo<N>/imageTrail.js`   | The variation: its images (or planes) and the effect, in `showNextImage`. The engine does the rest.            |
| `js/image.js`                | `Image`: references to one trail image's elements, its centering, and the reduced motion `fade`. Used by every DOM variation except 08 and 10. |
| `js/demo8/image.js`          | Demo 08's own `Image`, which also cuts each image into a 3×3 grid of clip-path tiles.                         |
| `js/demo10/image.js`         | Demo 10's own `Image`: 12 copies of the picture, which `cut(dx, dy)` clips into parallel strips along any direction (clip-path polygons), skipping the cut when the angle has hardly changed. |
| `js/demo13/flowmap.js`       | Demo 13's flowmap: a small render target the pointer stirs, read by the images as a velocity field.           |
| `js/demo14/imageTrail.js`    | Also builds Dust's geometry: a plane made of separate 4px squares, each with its center and a random seed as attributes. |
| `js/demo15/imageTrail.js`    | Gooey draws everything in one full-viewport pass instead of a plane per image.                               |
| `js/demo16/fluid.js`         | Demo 16's fluid simulation: velocity, curl, pressure and a displacement map in half-float render targets, one full-screen pass per step. |
| `js/webgl/stage.js`          | Shared by the WebGL variations: `Stage` (renderer, full-viewport canvas, pixel camera, texture loading, planes) and the TSL helpers `coverUV` and `roundedRect`. |
| `js/utils.js`                | `preloadImages`, `backgroundImageUrl`, `reducedMotion` (a `matchMedia` list) and `setClipPath`.               |
| `js/gsap.min.js`             | GSAP 3.15.0.                                                                                                  |
| `js/three/`                  | three.js r186 (core, WebGPU build, TSL).                                                                      |
| `css/base.css`               | All styles: the page grid, the loader, the frame, the variations nav (plain numbers, no boxes), the WebGL canvas, and each demo's image size, ratio and corner radius as custom properties on `.demo-<N>`. `.content` has no background: the images sit straight on the page. |
| `img/`                       | `1.jpg`…`70.jpg`, 400×600 (51–60 are 400×224). Each page uses ten of them.                                    |
| `fonts/`                     | Alpha Lyrae Medium (`.woff2`, `.woff`).                                                                       |

## How a page works

- `.content` holds ten `.content__img` boxes, one per picture. Each has a `.content__img-inner` that carries the picture as an inline `background-image` and is slightly bigger than its box (`--img-offset-x`/`-y`), so it can move inside it. On the WebGL pages these boxes stay hidden: they give each plane its picture, size and corner radius, and they're the images of the fallback trail.
- `fillPool(el, 20)` clones the boxes to twenty, so the trail takes turns with twice as many images as pictures and never takes one back while it's still showing, however fast the pointer goes (Gooey uses twelve, Tail its ten).
- `new Trail(el, {size, onImage, …})` (`js/trail.js`) runs on `gsap.ticker`. It follows the pointer (pointer events: mouse, touch and pen), and keeps a trailing position that closes `lag` of the gap per frame at 60fps, the same per second at any refresh rate.
- Every `threshold` pixels of pointer travel it calls `onImage(step)`, the variation's `showNextImage`. Fast moves get several images per frame (up to four), evenly spaced along the line from the last one, so spacing doesn't depend on speed or frame rate. `step` has `index` (which image, taking turns), `zIndex`, `to` (where the image goes), `from` (the trailing position, as far behind `to` as it is behind the pointer), `lead` (the pointer's lead over the trailing position: its direction and speed) and `at` (`to` in viewport pixels).
- A new touch, or the mouse coming back into the page, resets the trailing position to the pointer, so the next image doesn't slide in from where the pointer was before.
- `showNextImage` stops the image's running animation and builds its timeline. Most variations move the image from `from` to `to`, then take it out.
- `onFrame(frame)` runs every frame after any images were shown, with `dt`, `moved` and `movement` (the pointer's movement this frame): the WebGL variations draw there, and 13 and 16 stir their flow with it.
- Demo 11 (Tail) is the exception: it shows all ten images at once, using only the engine's pointer and frames. The head eases towards the pointer and records its path, the others sit along that path every `spacing` pixels, and `show()` unfurls or retracts the tail. With reduced motion it switches the engine's `spawning` on and shows one fading image at a time.

## Conventions

- **Coordinates.** In the DOM variations the images are absolutely positioned inside `.content`, so the engine gives `to` and `from` relative to it (its default `space: 'content'`, measured at start and on resize). The WebGL canvas covers the whole viewport, so the WebGL variations ask for `space: 'viewport'` and use the points with y negated: `mesh.position.set(to.x, -to.y, 0)`.
- **Lag.** 06, 07 and 08 pass `lag: 0.3` (their trailing position keeps closer to the pointer, as in the originals); everything else uses the default 0.1. Since several variations build their motion from `lead`, changing the lag changes how they look.
- **Centering.** `Image` sets `xPercent: -50, yPercent: -50` once, so x and y place the image's center and nothing needs measuring. A timeline that animates `xPercent`/`yPercent` keeps the -50 in its values, like demo 03's exit (`yPercent: -250` is 200% up). Planes are centered by their geometry.
- **Stacking.** The engine's `zIndex` only goes up. In the DOM it stacks images inside the stacking context of `.content` (z-index 100), so it can't cover the frame (1000) or the nav (200); on the WebGL pages it's the plane's `renderOrder`. Don't reset it: images still on screen would end up above the new ones.
- **Edges.** `main` has `overflow: clip`, so images that go past the screen's edges are cut off there instead of widening the page (on phones that would let it pan sideways).
- **Reduced motion.** Every variation checks `reducedMotion.matches` when an image starts and falls back to a plain fade at the pointer: `img.fade(x, y, zIndex)` in the DOM variations (`persist` keeps the image, as in demo 07), a tween of the plane's `opacity` uniform on the WebGL pages, and in demo 11 the engine's own spawning with `fadeImage`. A new variation needs the same.
- **Touch.** `.content` has `touch-action: none`, so a drag over it draws the trail instead of scrolling or zooming. Keep it if the content area changes.
- **Loader.** `body::before` and `::after` cover the page while the body has `loading`. Removing the class fades them out (CSS only). The WebGL pages remove it only after the textures have loaded and the shaders have compiled.

## WebGL conventions (variations 12–16)

- **Renderer.** `Stage` uses three.js' `WebGPURenderer`: WebGPU where the browser has it, WebGL 2 everywhere else, with the same shaders. Shaders are written in TSL (`three/tsl`), never in raw GLSL or WGSL, so they compile for both.
- **Camera.** Orthographic by default. `new Stage(el, {perspective: 1000})` gives a perspective camera that still shows the z = 0 plane at one CSS pixel per unit (like CSS `perspective`), for planes that bend or move in depth (demo 12).
- **Fallback.** `js/demo<N>/index.js` imports the WebGL trail dynamically and calls `await trail.init()` inside a try. If that throws (no WebGPU and no WebGL 2, or three.js didn't load), it removes the canvas and starts demo 01's DOM trail on the same images instead.
- **Planes.** `stage.loadImage(el)` reads the picture, size and corner radius from a `.content__img` box (textures are cached by URL, so the pool's clones share them), and `stage.addPlane(material, width, height, geometry)` adds a hidden plane of that size (the geometry is a plain square unless one is passed, like demo 12's 32×32 subdivided plane). Each plane is `{mesh, uniforms, width, height, timeline}`. Its effect lives in a `MeshBasicNodeMaterial` with `colorNode`, `opacityNode` and, to bend it, `positionNode`, driven by `uniform()`s that GSAP tweens through their `value`.
- **Values computed per vertex** and needed per pixel go through `vertexStage()` (demo 12's shading).
- **Pictures.** Sample through `coverUV(st, planeAspect, imageAspect)` so the picture is framed like `background-size: cover`, and mask with `roundedRect` to match the DOM corners.
- **Drawing.** `render` (the engine's `onFrame`) draws only while a plane is visible, plus one last frame to clear the canvas. The engine is created at the end of `init`, once the planes exist. A plane's timeline hides it (`mesh.visible = false`) on complete; `plane.timeline?.kill()` before reusing a plane, so an old `onComplete` can't hide the new image.
- **Shaders compile before the page shows.** `stage.compile()` runs at the end of `init`, while the loader is still up.
- **Grains (demo 14).** Custom attributes (`cell`, `seed`) come into TSL through `attribute('cell', 'vec2')`. Every vertex moves with its square's center, so the squares fly apart as units and fit back together exactly.
- **One surface (demo 15).** A single plane covers the viewport and loops over the twelve images in the shader (unrolled in JavaScript): a rounded-rectangle distance for each, turned into a metaball field (`exp(-distance / GOO)`) and added up, with the outline where the sum reaches 1. Blur comes from the textures' mipmaps (`.level(lod)`): none inside an image, more near its edge where another image's field reaches in and as it shrinks into a drop, and `BLUR` in the goo between images. Images are only state objects (position, scale) copied into `vec4` uniforms each frame; hidden ones wait far off screen. Textures read inside an `If` use `.level(0)`, since WGSL only allows explicit-level sampling in branches. Images come and go by scale, never by fading, so nothing shows through anything.
- **Fluid (demo 16).** Stable fluids at a quarter of the viewport's resolution: splat (the mouse's push), curl, vorticity confinement, divergence, 12 Jacobi pressure iterations, gradient subtraction and advection, then a displacement map (half resolution) that the flow carries along with itself and that relaxes back to zero. The images read that map at `screenUV`, so where the fluid swirls their pictures twist into spirals. A pass's textures are built into its material, one material per combination of ping-pong textures (`Fluid.pass`), rather than swapping a texture node's `value` between draws: swapping inside the same frame left the multi-texture passes reading nothing. The simulation stops four seconds after the mouse rests.
- **Flowmap (demo 13).** Two half-float render targets take turns: each frame reads the last flow, fades it and adds the pointer's movement around the pointer. Both passes read it at `screenUV`, which has its origin at the top left in both backends, so the pointer position is passed as `clientX / width`, `clientY / height`. It stops updating three seconds after the pointer rests.

## Variations

| #  | Page           | Title        | What it does                                                                                                          | Notes |
| -- | -------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- | ----- |
| 01 | `index.html`   | Classic      | Images slide from the lagging position to the pointer, then shrink and fade out.                                       | Also the fallback of the WebGL pages (12–16). |
| 02 | `index2.html`  | Innerscape   | Like Classic, but each image grows from nothing while its picture zooms out from 2.8× and dims from 250% brightness.   | |
| 03 | `index3.html`  | Exiting      | Images grow in, then fly upwards with a random sideways drift as they shrink and fade.                                 | Animates `xPercent`/`yPercent`. |
| 04 | `index4.html`  | Flow Follow  | Images keep drifting in the direction of movement; the picture flashes brighter and more contrasted the faster it goes. | |
| 05 | `index5.html`  | Spintrail    | Images turn to the angle of movement and overshoot along it as they fade.                                              | Keeps `lastAngle` between images. |
| 06 | `index6.html`  | Velocity     | Size, brightness, blur and grayscale follow pointer speed: slow moves leave small, dark, blurred images.               | `mapSpeedTo*` methods. `lag: 0.3`. |
| 07 | `index7.html`  | Persistence  | Images stay on screen, blended with `mix-blend-mode: screen`, at a random scale and slight tilt; only the oldest of nine fades out. | `visibleImagesTotal`, `lag: 0.3`. Its reduced motion branch is an if/else, not an early return, because the hide-the-oldest code still has to run. |
| 08 | `index8.html`  | Tile Apart   | Each image appears at the pointer and breaks into nine clip-path tiles that scatter and fade.                          | Own `js/demo8/image.js`. Placed with `.set`, no lagging slide. `lag: 0.3`. |
| 09 | `index9.html`  | Perspective  | Images tilt and move in depth by the pointer's distance from the window center, then recede.                           | Sets `perspective` on `.content`. Keeps its own window size for the center, measured against `at`. |
| 10 | `index10.html` | Strata       | Each image is cut into strips along the movement, at its exact angle, that catch up from the middle outwards with an elastic wobble, so it bows and ripples like a flag; it leaves the same way. | Own `js/demo10/image.js`; the strips are re-cut from the `lead`'s direction when it changes. The heaviest DOM variation (every image is a dozen clipped, animated copies), so it keeps to 12 strips, `threshold: 100` and `maxPerFrame: 2`; check it with the CPU throttled before adding strips. `--img-offset` is 0, the box doesn't clip (so strips can leave it), and each strip has the image's corner radius. Images 01–10. |
| 11 | `index11.html` | Tail         | All ten images follow the pointer as a tail that snakes along its path, leaning into the movement; at rest it slides back into the head and fades. | No `showNextImage`. `gap`, `follow`, `restDelay`. Per-frame values through `gsap.quickSetter`. The images behind the head disappear only in the last pixels of sliding in, and the head fades after, so the stack is never seen through itself. Images 61–70. |
| 12 | `index12.html` | Silk         | WebGL. Images glide on along the movement like sheets of fabric pulled by their leading edge: the trailing part curls away in depth and ripples, with light catching the folds, then settles flat. | Perspective `Stage`, subdivided planes, `positionNode`. Bends with the plane's own velocity (measured each frame) and a `flutter` it's let go with. Images 11–20. |
| 13 | `index13.html` | Liquid       | WebGL. The pointer leaves a wake in a flowmap that pushes the images' pictures and outlines around, with the colors pulled apart along the flow and a little ripple. | `js/demo13/flowmap.js`. Planes are padded by 60px so outlines can flow out. The push is in proportion to the image's width (120px at most for a 220px image). Images 31–40. |
| 14 | `index14.html` | Dust         | WebGL. Each image gathers out of a cloud of tiny squares blown in along the movement, then comes apart into dust that the same wind carries off, starting at its trailing edge. | Custom grain geometry (4px squares). `gather`, `scatter` and `wind` uniforms. Images 51–60 (400×224, landscape cards). |
| 15 | `index15.html` | Gooey        | WebGL. Images merge like drops of liquid: necks grow between them as they come close and stretch thin before snapping, the goo blurred and its colors running together; they swell out of a drop and melt back into one. | One full-viewport surface, metaball field (`GOO` = 40px reach, `BLUR` = 4.5 mip levels). With reduced motion the images fade and are spaced so they never overlap. Images 41–50. |
| 16 | `index16.html` | Swirl        | WebGL. The mouse stirs a real fluid that curls into eddies; the images are carried by it, their pictures and outlines twisting into swirls like stirred paint, with a slight color split, and settle back as the water calms. | `js/demo16/fluid.js`. Planes padded by 70px. Displacement shown at 60%, capped at 70px for a 165px image (both in proportion to the image's width); `relax` 0.965, `curl` 0.08. Images 01–10. |

## Adding a variation

1. Copy the closest demo folder to `js/demo<N>/` and write the effect in `showNextImage(step)`; the engine calls it with the image and where it goes. Keep the reduced motion branch. Set `threshold`, `lag` or `maxPerFrame` in the `Trail` options if the effect needs other spacing, lag, or fewer images at once on fast moves. For a WebGL variation, copy one of 12–16 (including its `index.js`, for the fallback) and write a new material with TSL.
2. Copy a page to `index<N>.html` and change the `demo-<N>` body class, `Demo <N>` in the title, the meta title and subtitle, the ten `background-image` URLs and the module script path. A WebGL page keeps the import map; a page using another GSAP plugin loads it after `js/gsap.min.js` and registers it in its `imageTrail.js`.
3. If the images need another size, ratio or corner radius, add `.demo-<N>` with `--img-width`, `--img-ratio` or `--img-border-radius` to `css/base.css`.
4. Add the link to the `.frame__demos` nav on **every** page, zero-padded (`17`, `18`). The current page's entry is a `<span class="frame__demo frame__demo--current">`, not a link. The nav wraps on its own, so there's nothing to change in the CSS.
5. Add a row to the Variations table above.

## Style

- JavaScript: four-space indentation, single quotes, classes with a `DOM` object for element references, class fields with trailing comments, JSDoc on every method, and plenty of comments that explain each step (the code is read alongside the article). Follow what's in the file.
- The mechanics live once in `js/trail.js`; each demo's `imageTrail.js` holds only its effect, so one file shows a whole effect without the plumbing. Fix pointer, spacing or pool behaviour in the engine, never in a variation. Other shared code lives in `js/utils.js`, `js/image.js` and `js/webgl/stage.js`.
- Some files (`js/demo15/imageTrail.js`, `js/demo16/fluid.js`) are formatted with two-space indentation and trailing commas: keep each file's own formatting.
- HTML and CSS use tabs. The CSS is plain, without nesting.
- No dependencies and no build tooling unless asked.

## Ask before changing

- The pages' `<title>`, meta description and keywords, the `frame__title` heading, the frame links and the `#cursor` tag. They're kept the same on every page.
- The variations' titles and subtitles, the images and the credits.
- Variations 01–09, which are the author's originals from the 2023 article.
