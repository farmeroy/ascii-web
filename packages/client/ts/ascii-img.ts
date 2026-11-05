import init, { ascii_art } from '@ascii-web/wasm/web';

let wasmReady: Promise<unknown> | null = null;

function ensureInit(): Promise<unknown> {
  if (!wasmReady) wasmReady = init();
  return wasmReady;
}

const DEFAULT_MIN_COLS = 80;
// the image is stored at most this many pixels wide per column: enough for
// each character to average a few pixels, without holding (and copying into
// WASM on every render) a full-size photo
const PIXELS_PER_COL = 4;
// high enough not to limit typical layouts; stores images at most 2048px wide
const DEFAULT_MAX_COLS = 512;

const STYLES = `
  :host {
    display: block;
    width: 100%;
    contain: inline-size;
  }
  pre, .measure {
    margin: 0;
    padding: 0;
    white-space: pre;
    font-family: var(--ascii-font-family, monospace);
    line-height: var(--ascii-line-height, 1);
  }
  /* the pre's font-size is set when rendering, so a new size and the art
     drawn for it appear together */
  .measure {
    font-size: var(--ascii-font-size, 8px);
  }
  pre {
    color: var(--ascii-color, white);
    background-color: var(--ascii-bg, black);
  }
  /* clips the measure span so its width never makes the page scroll */
  .measure-box {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }
  /* inline-block: exactly as wide as its text and as tall as one line */
  .measure {
    display: inline-block;
    visibility: hidden;
  }
`;

export class AsciiImg extends HTMLElement {
  static observedAttributes = ['src', 'alt', 'min-cols', 'max-cols'];

  #shadow: ShadowRoot;
  #pre: HTMLPreElement;
  #measure: HTMLSpanElement;
  #resizeObserver: ResizeObserver;
  #resizeFrame: number = 0;

  #imageData: ImageData | null = null;

  #minCols: number = DEFAULT_MIN_COLS;
  #maxCols: number = DEFAULT_MAX_COLS;
  #lastRenderedCols: number = 0;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.#shadow.appendChild(style);

    this.#pre = document.createElement('pre');
    this.#pre.setAttribute('aria-hidden', 'true');
    this.#shadow.appendChild(this.#pre);

    this.#measure = document.createElement('span');
    this.#measure.className = 'measure';
    this.#measure.textContent = 'M'.repeat(100);
    const measureBox = document.createElement('div');
    measureBox.className = 'measure-box';
    measureBox.appendChild(this.#measure);
    this.#shadow.appendChild(measureBox);

    // render on the next frame rather than inside the callback: rendering
    // changes the host's height, which would resize the observed element
    // mid-callback and trigger a ResizeObserver loop error
    this.#resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.#resizeFrame);
      this.#resizeFrame = requestAnimationFrame(() => this.renderAscii());
    });
  }

  connectedCallback(): void {
    // ensure element has a role, even if created by JS (react etc.)
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    this.#resizeObserver.observe(this);
    // the measure span's size is the font's: re-render when the font changes
    // even if this element's size doesn't (a web font loading, a CSS variable)
    this.#resizeObserver.observe(this.#measure);
    ensureInit(); // begin loading wasm async
    // // NOTE: the src img is loaded by this.loadImage
    // // inside of attributeChangedCallback
    // // attributeChangedCallback fires _before_ connectedCallback
  }

  disconnectedCallback(): void {
    this.#resizeObserver.disconnect();
    cancelAnimationFrame(this.#resizeFrame);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'src':
        this.loadImage();
        break;
      case 'alt':
        this.setAttribute('aria-label', newValue ?? '');
        break;
      case 'min-cols': {
        const parsed = parseInt(newValue ?? '', 10);
        this.#minCols = isNaN(parsed) ? DEFAULT_MIN_COLS : parsed;
        this.renderAscii();
        break;
      }
      case 'max-cols': {
        const parsed = parseInt(newValue ?? '', 10);
        const previous = this.#maxCols;
        this.#maxCols = isNaN(parsed) ? DEFAULT_MAX_COLS : parsed;
        // the stored image was scaled for the old max-cols; reload it so more
        // columns still get enough pixels each
        if (this.#imageData && this.#maxCols > previous) {
          this.loadImage();
        } else {
          this.renderAscii();
        }
        break;
      }
    }
  }

  private loadImage(): void {
    const src = this.getAttribute('src');
    if (!src) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;

    img.onload = () => {
      // check if src has been updated while loading
      if (this.getAttribute('src') !== src) return;
      // scale down (never up) to at most PIXELS_PER_COL pixels per column
      const scale = Math.min(1, (this.#maxCols * PIXELS_PER_COL) / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas 2d context');
        return;
      }

      // 'high' averages pixels when shrinking a lot instead of skipping them
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      this.#imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // new pixels: render even if the column count hasn't changed
      this.#lastRenderedCols = 0;
      this.renderAscii();
    };

    img.onerror = () => {
      console.error(`Failed to load image: ${src}`);
    };
  }

  // size of one character cell: its width, and the line height
  private measureChar(): { width: number; height: number } {
    const { width, height } = this.#measure.getBoundingClientRect();
    return { width: width / 100, height };
  }

  private async renderAscii(): Promise<void> {
    if (!this.#imageData) return;

    await ensureInit();
    const { data, width, height } = this.#imageData;

    const char = this.measureChar();
    if (char.width === 0 || char.height === 0) return;
    const baseCharWidth = char.width;

    const containerWidth = this.clientWidth;
    const rawCols = Math.floor(containerWidth / baseCharWidth);
    const cols = Math.min(this.#maxCols, Math.max(this.#minCols, rawCols));

    // the measured font size, scaled down below min-cols to fit the columns
    const baseFontSize = parseFloat(getComputedStyle(this.#measure).fontSize);
    const fontSize = rawCols < this.#minCols ? baseFontSize * (containerWidth / (cols * baseCharWidth)) : baseFontSize;
    this.#pre.style.fontSize = `${fontSize}px`;

    if (cols === this.#lastRenderedCols) return;
    this.#lastRenderedCols = cols;

    // characters are narrower than they are tall, so the art needs fewer rows
    // than cols / aspectRatio to keep the image's proportions
    const aspectRatio = width / height;
    const rows = Math.round((cols / aspectRatio) * (char.width / char.height));

    const art = ascii_art(new Uint8Array(data.buffer), width, height, cols, rows);

    this.#pre.textContent = art;
  }
}

customElements.define('ascii-img', AsciiImg);
