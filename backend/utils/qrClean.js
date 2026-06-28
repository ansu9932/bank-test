const sharp = require('sharp');
const jsQR = require('jsqr');
const QRCode = require('qrcode');
const logger = require('./logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · QR CLEANER
   Razorpay's QR `image_url` is a branded *poster* — it surrounds the actual
   scannable code with the Razorpay logo (top), the merchant name and UPI app
   logos (bottom). To show ONLY the scannable square QR in the Add Money box, we
   decode the UPI payload out of the poster and regenerate a crisp, square,
   QR-only PNG from that exact payload. The regenerated code encodes the same
   UPI string, so it scans identically — just without any branding.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * @param {Buffer} buffer Raw bytes of the Razorpay QR poster image.
 * @returns {Promise<string|null>} A `data:image/png;base64,...` URI of a clean
 *   QR-only image, or null if the code could not be decoded (caller falls back).
 */
async function cleanQrDataUriFromBuffer(buffer) {
  try {
    // 1) Decode the poster to raw RGBA pixels for the QR reader.
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 2) Read the embedded UPI string from anywhere in the poster.
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    if (!decoded || !decoded.data) {
      logger?.warn?.('QR cleaner: could not decode the Razorpay poster QR.');
      return null;
    }

    // 3) Regenerate a clean, square QR purely from the decoded payload.
    const png = await QRCode.toBuffer(decoded.data, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,             // tight quiet zone; the UI white box adds more
      width: 512,            // crisp on retina screens
      color: { dark: '#000000', light: '#ffffff' },
    });

    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) {
    logger?.warn?.(`QR cleaner failed, will fall back to the original image: ${e.message}`);
    return null;
  }
}

module.exports = { cleanQrDataUriFromBuffer };
