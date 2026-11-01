# ascii-web

A slightly over-engineered approach to rendering ASCII images on web pages using WASM and web components.

The image dynamically resizes the number of characters used given a default font size of 8px. On first render or resize, it calculates its container width and maximizes the number of columns it can fit.

## Installation

```bash
npm install ascii-web
```

## Usage

### Basic

```html
<script type="module">
  import 'ascii-web';
</script>

<ascii-img src="my-image.jpg"></ascii-img>
```

### Attributes

| Attribute  | Default | Description |
|------------|---------|-------------|
| `src`      | —       | Image URL or path |
| `alt`      | —       | Accessible label (sets `aria-label`) |
| `min-cols` | `80`    | Minimum character columns |
| `max-cols` | `300`   | Maximum character columns |

### Styling

The component exposes CSS custom properties for theming:

```css
ascii-img {
  --rascii-font-family: "Fira Code", monospace;
  --rascii-font-size: 6px;
  --rascii-line-height: 1;
  --rascii-color: #00ff41;
  --rascii-bg: #0d0d0d;
}
```

### Preventing FOUC

The component renders asynchronously (WASM init + image load), so there's a flash of empty content before the ASCII appears. Hide it until the element is defined:

```css
ascii-img:not(:defined) {
  display: none;
}
```

Or use a fade-in for something less jarring:

```css
ascii-img {
  opacity: 1;
  transition: opacity 0.3s;
}
ascii-img:not(:defined) {
  opacity: 0;
}
```

### Preventing layout shift

The component's height depends on the rendered output, which isn't known until after the WASM runs. To reserve space and avoid layout shift, wrap it in a container with a fixed aspect ratio:

```css
.ascii-container {
  width: 100%;
  aspect-ratio: 16 / 9; /* adjust to match your image */
  overflow: hidden;
}
```

```html
<div class="ascii-container">
  <ascii-img src="portrait.jpg"></ascii-img>
</div>
```

## Server-side rendering

For static sites (Astro, Next.js, etc.), you can generate the ASCII at build time instead of shipping WASM to the client. Requires `sharp` as a peer dependency.

```bash
npm install sharp
```

### Astro

```astro
---
import { renderAscii } from 'ascii-web/server';
const art = await renderAscii('./src/assets/portrait.jpg', { cols: 120 });
---
<pre set:text={art} />
```

### React Server Component

```tsx
import { renderAscii } from 'ascii-web/server';

export default async function AsciiPortrait() {
  const art = await renderAscii('./public/portrait.jpg', { cols: 120 });
  return <pre>{art}</pre>;
}
```

### Options

```ts
renderAscii(input: string | ArrayBuffer | Uint8Array, opts?: {
  cols?: number;  // default: 120
  rows?: number;  // default: auto (preserves aspect ratio)
}): Promise<string>
```

The low-level `ascii_art` function is also exported if you want to bring your own pixel data:

```ts
import { ascii_art } from 'ascii-web/server';
const art = ascii_art(rgbaPixels, width, height, cols, rows);
```

## Does Rust/WASM make it faster?

No, no it does not. This is just a static image.
In fact, if you are only loading a single image that you could possibly render in advance, this will add ~100ms to the displaying of the image.

## But is it fun?

Yes, yes it is.
