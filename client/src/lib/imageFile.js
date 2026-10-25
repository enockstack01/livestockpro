/* Reads any picture a farmer has into something a canvas can draw, so every
   format ends up as a JPEG (or PNG) the server and the AI read well:
   - what the browser opens itself: JPEG, PNG, WebP, GIF, BMP, ICO, AVIF, SVG
     (and HEIC or TIFF on Safari);
   - iPhone HEIC/HEIF photos elsewhere, converted with heic2any;
   - TIFF scans elsewhere, decoded with UTIF.
   The converters load only when such a file is picked. */

/* Every picture type, for <input accept>; some phones label HEIC and TIFF
   files without an image type, so their extensions are listed too. */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif,.avif,.tif,.tiff,.bmp,.gif,.svg,.ico';

const ext = (file) => (String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
const isHeic = (file) => /heic|heif/.test(file.type) || ['heic', 'heif'].includes(ext(file));
const isTiff = (file) => /tiff/.test(file.type) || ['tif', 'tiff'].includes(ext(file));

/* Looks like a picture at all (type or extension). */
export function isImageFile(file) {
  return Boolean(file) && (/^image\//.test(file.type) || ['heic', 'heif', 'avif', 'tif', 'tiff', 'bmp', 'gif', 'svg', 'ico', 'jpg', 'jpeg', 'png', 'webp', 'jfif'].includes(ext(file)));
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // An SVG without its own size draws at a sensible default.
      const w = img.naturalWidth || 1024;
      const h = img.naturalHeight || 1024;
      resolve({ source: img, width: w, height: h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

async function fromHeic(file) {
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return loadImage(Array.isArray(out) ? out[0] : out);
}

async function fromTiff(file) {
  const UTIF = (await import('utif')).default;
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  // The largest page: some TIFFs carry a small preview first.
  ifds.forEach((ifd) => UTIF.decodeImage(buf, ifd, ifds));
  const page = ifds.filter((p) => p.width && p.height).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!page) throw new Error('unreadable');
  const rgba = UTIF.toRGBA8(page);
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, page.width * page.height * 4), page.width, page.height), 0, 0);
  return { source: canvas, width: page.width, height: page.height };
}

/* { source, width, height } for any picture file; throws 'unreadable'. */
export async function decodeImage(file) {
  try {
    return await loadImage(file);
  } catch (err) {
    if (isHeic(file)) return fromHeic(file);
    if (isTiff(file)) return fromTiff(file);
    throw err;
  }
}

/* The picture as a data URL no larger than `side` on its longest edge.
   JPEG by default (a white background under any transparency); PNG keeps
   transparency, for logos. */
export function drawToDataUrl({ source, width, height }, side, { type = 'image/jpeg', quality = 0.85 } = {}) {
  const scale = Math.min(1, side / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, quality);
}

/* The picture as a JPEG File (for uploads that need a common format). */
export async function toJpegFile(file, side = 1600) {
  const url = drawToDataUrl(await decodeImage(file), side, { quality: 0.9 });
  const blob = await (await fetch(url)).blob();
  return new File([blob], String(file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
