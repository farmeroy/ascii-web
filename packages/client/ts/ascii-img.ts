import init, { ascii_art } from '@ascii-web/wasm/web';

let wasmReady: Promise<unknown> | null = null;

function ensureInit(): Promise<unknown> {
  if (!wasmReady) wasmReady = init();
  return wasmReady;
}

const DEFAULT_MIN_COLS = 80;
const DEFAULT_MAX_COLS = 300;

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
    font-size: var(--ascii-font-size, 8px);
    line-height: var(--ascii-line-height, 1);
  }
  pre {
    color: var(--ascii-color, white);
    background-color: var(--ascii-bg, black);
  }
  .measure {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
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
  #imageNaturalWidth: number = 0;
  #imageNaturalHeight: number = 0;

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
    this.#shadow.appendChild(this.#measure);

    this.setAttribute('role', 'img');

    // render on the next frame rather than inside the callback: rendering
    // changes the host's height, which would resize the observed element
    // mid-callback and trigger a ResizeObserver loop error
    this.#resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.#resizeFrame);
      this.#resizeFrame = requestAnimationFrame(() => this.renderAscii());
    });
  }

  connectedCallback(): void {
    this.#resizeObserver.observe(this);
    this.loadImage();
  }

  disconnectedCallback(): void {
    this.#resizeObserver.disconnect();
    cancelAnimationFrame(this.#resizeFrame);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'src':
        this.#lastRenderedCols = 0;
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
        this.#maxCols = isNaN(parsed) ? DEFAULT_MAX_COLS : parsed;
        this.renderAscii();
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
      const canvas = document.createElement('canvas');
      this.#imageNaturalWidth = img.naturalWidth;
      this.#imageNaturalHeight = img.naturalHeight;
      canvas.width = this.#imageNaturalWidth;
      canvas.height = this.#imageNaturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas 2d context');
        return;
      }

      ctx.drawImage(img, 0, 0);
      this.#imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      this.renderAscii();
    };

    img.onerror = () => {
      console.error(`Failed to load image: ${src}`);
    };
  }

  private measureCharWidth(): number {
    return this.#measure.getBoundingClientRect().width / 100;
  }

  private async renderAscii(): Promise<void> {
    if (!this.#imageData || !this.#imageNaturalHeight || !this.#imageNaturalWidth) return;

    await ensureInit();

    this.#pre.style.fontSize = '';
    const baseCharWidth = this.measureCharWidth();
    if (baseCharWidth === 0) return;

    const containerWidth = this.clientWidth;
    const rawCols = Math.floor(containerWidth / baseCharWidth);
    const cols = Math.min(this.#maxCols, Math.max(this.#minCols, rawCols));

    if (rawCols < this.#minCols) {
      const baseFontSize = parseFloat(getComputedStyle(this.#pre).fontSize);
      this.#pre.style.fontSize = `${baseFontSize * (containerWidth / (cols * baseCharWidth))}px`;
    }

    if (cols === this.#lastRenderedCols) return;
    this.#lastRenderedCols = cols;

    const aspectRatio = this.#imageNaturalWidth / this.#imageNaturalHeight;
    const rows = Math.round((cols / aspectRatio) * 0.5);

    const art = ascii_art(
      new Uint8Array(this.#imageData.data.buffer),
      this.#imageNaturalWidth,
      this.#imageNaturalHeight,
      cols,
      rows,
    );

    this.#pre.textContent = art;
  }
}

customElements.define('ascii-img', AsciiImg);
