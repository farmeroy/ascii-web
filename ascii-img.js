// @ts-check

import init, {ascii_art} from './pkg/rascii_web.js';


await init();

class AsciiImg extends HTMLElement {
  static observedAttributes = ['src'];
  #imageData = null;
  #imageNaturalWidth = 0;
  #imageNaturalHeight = 0;
  constructor() {
    super();
  }
  loadImage() {
    const img = new Image();
    img.src = this.getAttribute('src');
    try {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        this.#imageNaturalWidth = img.naturalWidth;
        this.#imageNaturalHeight = img.naturalHeight;
        canvas.width = this.#imageNaturalWidth;
        canvas.height = this.#imageNaturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("could not make image context");
        ctx.drawImage(img, 0, 0);
        this.#imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.renderAscii();
      }
    } catch(e) {
      if (e instanceof Error) {
        console.error(e.message);
      } else {
        console.error(e);
      }
    }}
  renderAscii() {
    if (!this.#imageData || !this.#imageNaturalHeight || !this.#imageNaturalWidth) return;
      const aspect_ratio = this.#imageNaturalWidth/ this.#imageNaturalHeight;
      const cols = 120;
      const rows = (cols / aspect_ratio) * 0.5;
      const art = ascii_art(this.#imageData.data, this.#imageNaturalWidth, this.#imageNaturalHeight, cols, rows); // the RGBA bytes
      const pre = this.querySelector('pre');
      if (!pre) return;
      pre.textContent = art;
  }
  connectedCallback() {
    this.innerHTML = `<pre style="background-color: black; color: white; font-size: .8em;"></pre>`
    this.loadImage();
  }

}



customElements.define("ascii-img", AsciiImg);
