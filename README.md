# ascii-web

A slightly over-engineered approach to rendering ASCII images on web pages using WASM and web components.

The image dynamically resizes the number of characters used given a default font size of 8px. On first render or resize, it calculates its container width and maximizes the number of columns it can fit.

Live demo: https://ascii-web.raffaelecataldo.com

## Installation

```bash
npm install @ascii-web/client
```

## Usage

The web component handles measuring the container,
the size of the font used,
and the dimensions of the image.

It also ensures that when the components size changes,
the image source changes, 
or the font size changes
that the ASCII image is redrawn.

### Basic

Currently this requires a bundler:

```html
<script type="module">
  import '@ascii-web/client';
</script>

<ascii-img src="my-image.jpg"></ascii-img>
```

### Attributes

| Attribute  | Default | Description |
|------------|---------|-------------|
| `src`      | —       | Image URL or path |
| `alt`      | —       | Accessible label, as on `<img>`: `alt=""` marks it decorative, so screen readers skip it. Shown in place of the art if the image fails to load |
| `min-cols` | `80`    | Minimum character columns |
| `max-cols` | `512`   | Maximum character columns |

### Events

Like `<img>`, it fires `load` once the art is shown and `error` if the image fails to load (neither bubbles):

```js
const img = document.querySelector('ascii-img');
img.addEventListener('load', () => img.classList.add('loaded'));
img.addEventListener('error', () => (img.hidden = true));
```

### Styling

The component exposes CSS custom properties for theming:

```css
ascii-img {
  --ascii-font-family: "Fira Code", monospace;
  --ascii-font-size: 6px;
  --ascii-line-height: 1;
  --ascii-color: #00ff41;
  --ascii-bg: #0d0d0d;
}
```

### Preventing FOUC

Web components render asynchronously, so there's a flash of empty content before the ASCII can render. Hide it until the element is defined:

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

Note: `:defined` only waits for the component's script, so there will still be a short delay while the image and WASM load. To fade in once the art itself is shown, use the [`load` event](#events) instead.

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

## Using the WASM package directly

The WASM is published as well and can be installed for direct use:
```bash
npm install @ascii-web/wasm
```

However, most of the utility around displaying the output in a user friendly 
way is handled by the web component.

Still, if you would like to use it:

```ts
import init, { ascii_art } from '@ascii-web/wasm/web';
await init(); // downloads and compiles the .wasm
//   ascii_art(rgba: Uint8Array, width: number, height: number, cols: number, rows: number): string
const art = ascii_art(rgbaPixels, width, height, cols, rows);
```

For use in Node.js
```ts
import { ascii_art } from '@ascii-web/wasm/node';
const art = ascii_art(rgbaPixels, width, height, cols, rows);
```

The tricky part is getting the number of rows right. 
In the web component, we do a calculation similar to this:
```ts
const rows = Math.round((cols / (width / height)) * (character width / line height)
```

Most monospace fonts with have a col/row ration of roughly 6/10.



## Server-side rendering

I also attempt to export a server package for static sites (Astro, Next.js, etc.), you can generate the ASCII at build time instead of shipping WASM to the client. This is just a thin wrapper around the wasm package.

Requires `sharp` as a peer dependency.

```bash
npm install @ascii-web/server sharp
```

This will use the Rust Wasm ascii generator on the server to generate an ASCII image with a fixed number of columns.
It is then up to you to style them appropriately if you want to display them on your web page.

The drawback here is it's not possible to know what media size will be,
and the server package is currently not very well developed.


### Astro

```astro
---
import { renderAscii } from '@ascii-web/server';
const art = await renderAscii('./src/assets/portrait.jpg', { cols: 120 });
---
<pre set:text={art} />
```

### React Server Component

```tsx
import { renderAscii } from '@ascii-web/server';

export default async function AsciiPortrait() {
  const art = await renderAscii('./public/portrait.jpg', { cols: 120 });
  return <pre>{art}</pre>;
}
```

### Options

```ts
renderAscii(input: string | ArrayBuffer | Uint8Array, opts?: {
  cols?: number;  // default: 120
  rows?: number;  // default: auto 
}): Promise<string>
```

The low-level `ascii_art` function is also exported if you want to bring your own pixel data:

```ts
import { ascii_art } from '@ascii-web/server';
const art = ascii_art(rgbaPixels, width, height, cols, rows);
```

## Does Rust/WASM make it faster?

No, no it does not.
In fact, if you are only loading a single image that you could possibly render in advance, this will add some (almost unnoticeable) latency as the WASM and web components are loaded.

Furthermore, if you only want to render 1 ascii image, it would arguably be faster to write the ascii generator in JavaScript, which would avoid downloading the WASM binary.

## But is it fun? ...or, why use it?

Yes, yes it is fun and it was fun to make.
I also think if you are rendering many, many ascii images dynamically on a web page this might be better? 


## Roadmap

- Benchmarks (I'm curious if the cost of WASM is in any way justified :smile:)
- support for ascii gifs
- an ascii-video component
