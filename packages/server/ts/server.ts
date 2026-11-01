import { ascii_art } from '@ascii-web/wasm/node';

export interface RenderOptions {
  cols?: number;
  rows?: number;
}

export async function renderAscii(
  input: string | ArrayBuffer | Uint8Array,
  opts: RenderOptions = {},
): Promise<string> {
  let sharpFn: any;
  try {
    sharpFn = (await import('sharp')).default;
  } catch {
    throw new Error(
      'sharp is required for rascii-img/server. Install it with: npm install sharp',
    );
  }

  const img = sharpFn(input);
  const metadata = await img.metadata();
  const width: number = metadata.width;
  const height: number = metadata.height;
  const pixels: Uint8Array = await img.raw().ensureAlpha().toBuffer();

  const cols = opts.cols ?? 120;
  const rows = opts.rows ?? Math.round((cols / (width / height)) * 0.5);

  return ascii_art(new Uint8Array(pixels), width, height, cols, rows);
}

export { ascii_art } from '@ascii-web/wasm/node';

