import init, { ascii_art } from '../pkg/rascii_web.js';

let wasmReady: Promise<unknown> | null = null;

function ensureInit(): Promise<unknown> {
  if (!wasmReady) wasmReady = init();
  return wasmReady;
}

class AsciiImg extends HTMLElement {
  static observedAttributes = ['src'];

  #imageData: ImageData | null = null;
  #imageNaturalWidth: number = 0;
  #imageNaturalHeight: number = 0;

  connectedCallback(): void {
    this.innerHTML = `<pre style="background-color: black; color: white; font-size: .8em;"></pre>`;
    this.loadImage();
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue !== newValue) {
      this.loadImage();
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

  private async renderAscii(): Promise<void> {
    if (!this.#imageData || !this.#imageNaturalHeight || !this.#imageNaturalWidth) return;

    await ensureInit();

    const aspectRatio = this.#imageNaturalWidth / this.#imageNaturalHeight;
    const cols = 120; // TODO this should be configurable or computable
    const rows = Math.round((cols / aspectRatio) * 0.5);

    const art = ascii_art(
      new Uint8Array(this.#imageData.data.buffer),
      this.#imageNaturalWidth,
      this.#imageNaturalHeight,
      cols,
      rows,
    );

    const pre = this.querySelector('pre');
    if (!pre) {
      console.error("Could not find <pre> tag!");
      return;
    }
    pre.textContent = art; // maybe this should protect against xss
  }
}

customElements.define('ascii-img', AsciiImg);
