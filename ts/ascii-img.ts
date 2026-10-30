import init, { ascii_art } from '../pkg/rascii_web.js';

let wasmReady: Promise<unknown> | null = null;

function ensureInit(): Promise<unknown> {
  if (!wasmReady) wasmReady = init();
  return wasmReady;
}

const DEFAULT_MIN_COLS = 80;
const DEFAULT_MAX_COLS = 200;

const STYLES = `
  :host {
    display: block;
  }
  pre {
    margin: 0;
    padding: 0;
    overflow: hidden;
    white-space: pre;
    font-family: var(--rascii-font-family, monospace);
    font-size: var(--rascii-font-size, 8px);
    line-height: var(--rascii-line-height, 1);
    color: var(--rascii-color, white);
    background-color: var(--rascii-bg, black);
  }
`;

export class AsciiImg extends HTMLElement {
  static observedAttributes = ['src', 'alt', 'min-cols', 'max-cols'];

  #shadow: ShadowRoot;
  #pre: HTMLPreElement;
  #resizeObserver: ResizeObserver;

  #imageData: ImageData | null = null;
  #imageNaturalWidth: number = 0;
  #imageNaturalHeight: number = 0;

  #minCols: number = DEFAULT_MIN_COLS;
  #maxCols: number = DEFAULT_MAX_COLS;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.#shadow.appendChild(style);

    this.#pre = document.createElement('pre');
    this.#pre.setAttribute('aria-hidden', 'true');
    this.#shadow.appendChild(this.#pre);

    this.setAttribute('role', 'img');

    this.#resizeObserver = new ResizeObserver(() => this.renderAscii());
  }

  connectedCallback(): void {
    this.#resizeObserver.observe(this);
    this.loadImage();
  }

  disconnectedCallback(): void {
    this.#resizeObserver.disconnect();
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
    const span = document.createElement('span');
    span.style.font = getComputedStyle(this.#pre).font;
    span.style.visibility = 'hidden';
    span.style.position = 'absolute';
    span.textContent = 'M';
    document.body.appendChild(span);
    const width = span.getBoundingClientRect().width;
    document.body.removeChild(span);
    return width;
  }

  private async renderAscii(): Promise<void> {
    if (!this.#imageData || !this.#imageNaturalHeight || !this.#imageNaturalWidth) return;

    await ensureInit();

    const charWidth = this.measureCharWidth();
    if (charWidth === 0) return;

    const containerWidth = this.clientWidth;
    const rawCols = Math.floor(containerWidth / charWidth);
    const cols = Math.min(this.#maxCols, Math.max(this.#minCols, rawCols));

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
