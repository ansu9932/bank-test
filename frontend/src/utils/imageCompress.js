/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · client-side image compression
   Phone cameras (esp. 48/64/108 MP and HEIC originals) routinely produce 8–15 MB
   photos even when the on-screen preview looks small — which trips the server's
   per-file upload limit on "some devices". We downscale + re-encode every image
   to a sensible size BEFORE upload, so a KYC document photo becomes a few
   hundred KB. This both eliminates "file size exceeds the limit" failures and
   makes the submission upload fast on weak networks.

   The function is intentionally fail-safe: if anything goes wrong (unknown
   format, decode failure, no canvas, etc.) it returns the ORIGINAL file so the
   user is never blocked.
   ────────────────────────────────────────────────────────────────────────── */

// Load a File into something drawable on a canvas (ImageBitmap or <img>).
async function loadDrawable(file) {
  // createImageBitmap is fastest and auto-applies EXIF orientation when asked.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* fall through to the <img> path */
      }
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * Compress/resize an image File. Returns a new (smaller) File, or the original
 * file if compression isn't applicable or wouldn't help.
 *
 * @param {File} file
 * @param {object} [opts]
 * @param {number} [opts.maxDim=1600]   Max width/height (px) of the long edge.
 * @param {number} [opts.quality=0.82]  JPEG quality (0–1).
 * @param {number} [opts.skipUnderBytes=500000] Skip already-small, normal-size images.
 * @returns {Promise<File>}
 */
export async function compressImage(file, opts = {}) {
  const { maxDim = 1600, quality = 0.82, skipUnderBytes = 500 * 1024 } = opts;

  // Only images are compressible. PDFs (and anything non-image) pass through.
  if (!file || !file.type || !file.type.startsWith('image/')) return file;

  // HEIC/HEIF generally can't be decoded by a browser <canvas>; leave as-is and
  // let the (raised) server limit + extension handling deal with it.
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '')) return file;

  try {
    const drawable = await loadDrawable(file);
    const srcW = drawable.width || drawable.naturalWidth;
    const srcH = drawable.height || drawable.naturalHeight;
    if (!srcW || !srcH) {
      if (drawable.close) drawable.close();
      return file;
    }

    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));

    // Already small in BOTH dimensions and bytes — nothing to gain.
    if (scale === 1 && file.size <= skipUnderBytes) {
      if (drawable.close) drawable.close();
      return file;
    }

    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (drawable.close) drawable.close();
      return file;
    }
    // White matte so any transparency (e.g. PNG) doesn't turn black in JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(drawable, 0, 0, targetW, targetH);
    if (drawable.close) drawable.close();

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (!blob || blob.size >= file.size) return file; // no benefit → keep original

    const base = (file.name || 'document').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file; // never block the user
  }
}

export default compressImage;
