# ASCII Art Web Component — Implementation Guide

A structured, self-paced exercise: build a browser-embeddable web component that renders any image as responsive ASCII art, with Rust powering the pixel math via WASM.

---

## Overview

You will build a `<ascii-art>` custom element that:

- Takes an image URL as an attribute
- Renders it as ASCII characters in a `<pre>` block
- Re-renders responsively when the browser resizes
- Uses Rust compiled to WASM for the image-to-ASCII conversion

The guide is broken into seven milestones. Each is self-contained — get it working and tested before moving on.

---

## Milestone 1 — Rust + WASM Hello World

**Goal:** Prove the toolchain works. A Rust function, callable from a browser page.

**What to build:**

- A Rust library crate with `crate-type = ["cdylib"]`
- One exported function: `greet(name: &str) -> String` that returns a greeting
- Compile with `wasm-pack build --target web`
- A minimal HTML page that imports the `.wasm` module and calls `greet()`, displaying the result

**Key concepts:**

- `wasm-bindgen` is the bridge — it generates JS glue code so you can call Rust functions from JS and vice versa
- `wasm-pack` orchestrates the build: it runs `cargo build`, runs `wasm-bindgen`, and optionally bundles
- The `--target web` flag produces ES module output you can `import` directly — no bundler needed for now

**Gotchas:**

- You need `wasm-pack` installed (`cargo install wasm-pack`) and the `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`)
- Serve the HTML over HTTP (e.g. `python3 -m http.server`), not `file://` — WASM loading requires it
- The generated JS glue has an `init()` function you must `await` before calling any exports

**Done when:** You see your greeting rendered in the browser, and the Rust function ran inside WASM to produce it.

---

## Milestone 2 — Image to ASCII in Pure Rust

**Goal:** Write the core conversion algorithm. No browser yet — just Rust unit tests.

**What to build:**

- A function: `pixels_to_ascii(pixels: &[u8], img_width: u32, img_height: u32, cols: u32, rows: u32) -> String`
- `pixels` is RGBA data (4 bytes per pixel), laid out row by row
- The function divides the image into a grid of `cols × rows` cells, averages the brightness in each cell, and maps it to a character

**Key concepts:**

- **Brightness from RGB:** A common formula is `0.299*R + 0.587*G + 0.114*B` (luminance weighting). This matters more than simple averaging because human vision isn't equally sensitive to all channels.
- **Cell sampling:** Each cell covers a rectangular region of pixels. Average the brightness across all pixels in that region. Think carefully about how you map cell `(col, row)` back to pixel coordinates — integer division and rounding matter here.
- **Character ramp:** A string of characters ordered from darkest to brightest (or vice versa), e.g. `" .:-=+*#%@"`. Map the averaged brightness (0–255) to an index into this ramp. Which end is "dark" depends on whether you assume a light or dark background — worth thinking about.

**Gotchas:**

- Don't forget newline characters at the end of each row in the output string
- Edge pixels: if the image dimensions aren't evenly divisible by cols/rows, decide whether to truncate or include partial cells
- Pre-allocate the output `String` with a capacity hint — you know exactly how long it will be (`cols * rows + rows` for newlines)

**Testing approach:**

- Create small synthetic pixel buffers by hand (e.g. a 4×4 all-white image, all-black, a gradient)
- Assert the output characters match what you'd expect
- A 2×2 image rendered at 2 cols × 2 rows is the simplest non-trivial test case

**Done when:** `cargo test` passes and you can see that bright pixels map to one end of the ramp and dark pixels to the other.

---

## Milestone 3 — Canvas Pixel Extraction + Static Render

**Goal:** Load a real image in the browser, extract its pixels, pass them to WASM, and display ASCII output.

**What to build:**

- JS code that: creates an offscreen `<canvas>`, draws the image onto it, calls `ctx.getImageData()` to get the RGBA pixel array
- Pass that `Uint8Array` across the WASM boundary to your Rust function
- Render the returned string into a `<pre>` element

**Key concepts:**

- **The WASM boundary:** `wasm-bindgen` can accept `&[u8]` from JS — it handles the copy from JS memory into WASM linear memory. For large images, this copy matters for performance but is fine for now.
- **Canvas sizing:** When you draw the image to canvas, set the canvas dimensions to the image's natural size. `drawImage()` will scale if they don't match, which distorts your pixel data.
- **CORS:** If the image is on another origin, `getImageData()` will throw a security error. For development, use local images or a CORS-friendly source. This is a browser security constraint, not a bug in your code.

**Gotchas:**

- The image must be fully loaded before you draw it — use the `onload` event or `await` on `image.decode()`
- `getImageData()` returns an `ImageData` object; the actual bytes are in its `.data` property (a `Uint8ClampedArray`)
- Pick a fixed column count for now (e.g. 80). Calculate rows from the image aspect ratio. You'll make this dynamic in Milestone 5.

**Done when:** You see a recognizable ASCII rendering of a real image in the browser. It will probably look vertically stretched — that's expected and fixed next.

---

## Milestone 4 — Aspect Ratio Correction

**Goal:** Make the ASCII output look proportionally correct.

**The problem:**

Monospace characters are taller than they are wide — typically about 2:1. A 100×100 pixel region rendered as 100 columns × 100 rows of text will appear roughly twice as tall as it is wide, because each character cell is a tall rectangle, not a square.

**What to build:**

- JS code that measures the actual character cell dimensions: render a test character in your `<pre>` element, measure its `getBoundingClientRect()`, and compute `charAspectRatio = charWidth / charHeight`
- Pass this ratio to the Rust side (or compute `rows` in JS accounting for it)
- The corrected formula: `rows = (cols / imageAspectRatio) * charAspectRatio`

**Key concepts:**

- **Why JS, not Rust:** The character dimensions depend on the font, font size, and rendering environment — things only the browser knows. Rust handles the pixel math; JS handles the display math. This is the right separation of concerns.
- **The math:** If your image is 800×600 and you're rendering at 80 columns, the "raw" row count would be 60. But if each character cell is 8px wide × 16px tall (ratio 0.5), you want `60 * 0.5 = 30` rows. Fewer rows compensates for taller cells.

**Gotchas:**

- Measure the character size AFTER the font is loaded. If you're using a web font, you may need to wait for it. System monospace fonts avoid this issue.
- The ratio changes if the user zooms the page — for now, measuring once on load is fine. Milestone 5's resize handler is the place to re-measure if you want.
- Make sure you're measuring inside the actual `<pre>` element with the same styles the output uses

**Done when:** A square image renders as visually square ASCII art. A circle looks like a circle, not an oval.

---

## Milestone 5 — Responsive Resize

**Goal:** The ASCII art re-renders automatically when the container size changes.

**What to build:**

- A `ResizeObserver` on the container element
- On resize: measure the new container width, compute the new column count (`Math.floor(containerWidth / charWidth)`), recalculate rows with aspect correction, re-invoke the WASM function, and update the `<pre>` content

**Key concepts:**

- **ResizeObserver vs. window resize:** `ResizeObserver` watches a specific element, not the window. This is more correct — your component might resize because a sidebar opened, not because the window changed.
- **Debouncing:** Resize events fire rapidly during a drag. You don't want to run the WASM conversion 60 times per second. Debounce with a short delay (100–150ms) or use `requestAnimationFrame` to coalesce.
- **Performance budget:** For a 1920px-wide container with 8px-wide characters, you're looking at ~240 columns. The WASM function processes the full pixel buffer each time. For very large images, consider downscaling the canvas to match the ASCII resolution — no point sampling a 4000×3000 image when you only need 240×120 brightness values.

**Gotchas:**

- Don't re-decode the image on every resize. Load the image and extract pixels once; store the `Uint8Array`. Only the ASCII conversion re-runs.
- If the container starts at zero width (hidden element, late layout), guard against dividing by zero
- Test by resizing the browser window slowly and quickly — watch for flicker, lag, or layout jumps

**Done when:** Dragging the browser window edge causes the ASCII art to fluidly reflow at the new resolution, without visible lag or the image looking wrong at any size.

---

## Milestone 6 — Web Component Packaging

**Goal:** Wrap everything in a `<ascii-art src="...">` custom element that anyone can drop into a page.

**What to build:**

- A class extending `HTMLElement`, registered with `customElements.define('ascii-art', ...)`
- Shadow DOM containing your `<pre>` and scoped styles (monospace font, no margin, etc.)
- Observed attributes: at minimum `src` (the image URL)
- The component handles its own lifecycle: load WASM, fetch image, render, observe resize, clean up

**Key concepts:**

- **Shadow DOM:** Gives you style isolation. Your monospace `<pre>` won't be affected by the page's CSS, and your styles won't leak out. This is important for an embeddable component.
- **Lifecycle callbacks:** `connectedCallback` fires when the element is added to the DOM — start here. `disconnectedCallback` fires on removal — disconnect your `ResizeObserver` here. `attributeChangedCallback` fires when `src` changes — reload the image.
- **WASM initialization:** The WASM module only needs to be initialized once, even if there are multiple `<ascii-art>` elements on the page. Use a module-level promise for this.

**Gotchas:**

- `attributeChangedCallback` fires during parsing, before `connectedCallback`. Guard against operating on a not-yet-connected element.
- To observe attributes, you must declare them in a static `observedAttributes` getter
- The Shadow DOM's `<pre>` is the resize target for your `ResizeObserver`, not the host element (or the host — just be consistent about which you measure and which you observe)

**Done when:** You can write `<ascii-art src="photo.jpg"></ascii-art>` in any HTML page (with the script imported) and it just works — renders, resizes, and doesn't interfere with the page's own styles.

---

## Milestone 7 — Stretch Goals

Pick any that interest you. Each is independent.

**Color ASCII:**
Instead of plain characters, wrap each one in a `<span>` with an inline `color` style sampled from the source pixel. The character still represents brightness; the color adds richness. This dramatically increases DOM node count — consider whether performance holds up, and whether a single string of colored characters in a `<pre>` is better than a grid of spans.

**Configurable character ramp:**
Expose an attribute like `chars=".:-=+*#%@"` that lets the user choose the character set. A shorter ramp gives a more posterized look; a longer one gives more tonal range. Consider providing a few named presets ("dense", "light", "blocks").

**Dark/light mode awareness:**
The character ramp direction should flip based on the background. On a dark background, space is dark and `@` is bright. On a light background, it's reversed. Detect this with `prefers-color-scheme` or by sampling the computed background color.

**Loading state:**
While the image loads and the first render runs, show a placeholder. A simple "Loading..." is fine, or get creative with ASCII art of a loading spinner.

**Resolution control:**
Expose a `resolution` attribute (or a `max-cols` attribute) so the user can cap the detail level. Lower resolution runs faster and gives a more "artistic" look; higher resolution is more photographic.

**Edge detection mode:**
Instead of mapping brightness to characters, run a simple edge detection (Sobel filter) in Rust and map edge strength to characters. This gives an outline/sketch effect rather than a tonal reproduction.

---

## Architecture Reference

```
<ascii-art src="photo.jpg">
  #shadow-root
    <pre id="output">  ....::##@@@@##::....  </pre>
```

```
┌─────────────────────────────────────────────┐
│  JS: Web Component + Image Loading          │
│  - Custom element lifecycle                 │
│  - Canvas pixel extraction                  │
│  - ResizeObserver + debounce                │
│  - Character cell measurement               │
│                                             │
│         pixels, cols, rows                  │
│              ↓                              │
│  ┌─────────────────────────────────────┐    │
│  │  WASM: Pixel Processing (Rust)      │    │
│  │  - Cell brightness averaging        │    │
│  │  - Character ramp mapping           │    │
│  │  - Returns ASCII string             │    │
│  └─────────────────────────────────────┘    │
│              ↓                              │
│         ASCII string → <pre>                │
└─────────────────────────────────────────────┘
```

---

## Useful References

- **wasm-pack:** The build tool for Rust+WASM projects — handles `cargo build`, `wasm-bindgen`, and packaging
- **wasm-bindgen guide:** Covers the `#[wasm_bindgen]` macro, type conversions across the boundary, and memory management
- **MDN Web Components:** `customElements.define`, Shadow DOM, lifecycle callbacks, observed attributes
- **MDN Canvas API:** `drawImage`, `getImageData`, `ImageData`
- **MDN ResizeObserver:** The API for watching element size changes
