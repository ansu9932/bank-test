/* ────────────────────────────────────────────────────────────────────────────
   ALISTER BANK vKYC · Face Engine
   Thin wrapper around MediaPipe Face Landmarker (WASM). All processing is
   100% on-device — no frame ever leaves the browser. The heavy vision bundle
   is lazy-loaded only when the KYC camera flow actually starts.
   ──────────────────────────────────────────────────────────────────────────── */

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let landmarkerPromise = null;

/**
 * Lazily create (and memoize) the FaceLandmarker.
 * Tries the GPU delegate first, falls back to CPU for devices without WebGL.
 */
export function getFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      const baseOptions = { modelAssetPath: MODEL_URL, delegate: 'GPU' };
      const options = {
        baseOptions,
        runningMode: 'VIDEO',
        numFaces: 2, // detect a 2nd face so we can REJECT multi-face frames
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      };
      try {
        return await FaceLandmarker.createFromOptions(fileset, options);
      } catch {
        // No WebGL / GPU delegate failed → CPU fallback
        return FaceLandmarker.createFromOptions(fileset, {
          ...options,
          baseOptions: { ...baseOptions, delegate: 'CPU' },
        });
      }
    })();
    landmarkerPromise.catch(() => { landmarkerPromise = null; });
  }
  return landmarkerPromise;
}

/** Release the memoized instance (called on unmount / session wipe). */
export function disposeFaceLandmarker() {
  if (landmarkerPromise) {
    landmarkerPromise.then((lm) => { try { lm.close(); } catch { /* noop */ } }).catch(() => {});
    landmarkerPromise = null;
  }
}

// ─── Landmark indices (MediaPipe 478-point face mesh) ────────────────────────
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const FACE_LEFT = 234;  // leftmost contour point in IMAGE coordinates
const FACE_RIGHT = 454; // rightmost contour point in IMAGE coordinates

/**
 * Derive everything the KYC state machine needs from one detection result.
 * All coordinates are normalized [0..1] relative to the video frame.
 */
export function computeFaceMetrics(result) {
  const faces = result?.faceLandmarks?.length || 0;
  if (faces === 0) return { faces: 0 };

  const lm = result.faceLandmarks[0];
  const left = lm[FACE_LEFT];
  const right = lm[FACE_RIGHT];
  const nose = lm[NOSE_TIP];
  const top = lm[FOREHEAD];
  const bottom = lm[CHIN];

  const faceWidth = Math.abs(right.x - left.x);
  const faceHeight = Math.abs(bottom.y - top.y);
  const centerX = (left.x + right.x) / 2;
  const centerY = (top.y + bottom.y) / 2;

  // Head yaw: nose offset between the cheeks. User turning to THEIR left moves
  // the nose toward image-right (positive). Scaled to approximate degrees.
  const yaw = faceWidth > 0 ? ((nose.x - centerX) / faceWidth) * 90 : 0;
  // Head pitch: nose offset between forehead and chin. Looking UP → negative.
  const pitch = faceHeight > 0 ? ((nose.y - centerY) / faceHeight) * 90 : 0;

  // Blink scores from blendshapes
  let blinkLeft = 0;
  let blinkRight = 0;
  const shapes = result.faceBlendshapes?.[0]?.categories;
  if (shapes) {
    for (const c of shapes) {
      if (c.categoryName === 'eyeBlinkLeft') blinkLeft = c.score;
      else if (c.categoryName === 'eyeBlinkRight') blinkRight = c.score;
    }
  }

  return {
    faces,
    centerX,
    centerY,
    faceWidth,
    faceHeight,
    yaw,
    pitch,
    blinkLeft,
    blinkRight,
    // A compact geometric signature used to detect face swaps between steps
    signature: [
      faceWidth / (faceHeight || 1),
      (nose.x - left.x) / (faceWidth || 1),
      (nose.y - top.y) / (faceHeight || 1),
    ],
  };
}

/** Compare two face signatures — large drift ⇒ likely a different person. */
export function signatureDistance(a, b) {
  if (!a || !b) return 0;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d += Math.abs(a[i] - b[i]);
  return d;
}

/**
 * Average luminance of the current video frame (0–255), sampled on a tiny
 * offscreen canvas so it is cheap enough to run every few frames.
 */
export function frameLuminance(video, sampleCanvas) {
  const c = sampleCanvas;
  const w = 32;
  const h = 24;
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx || !video.videoWidth) return 128;
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 4);
}

/**
 * Variance of a Laplacian-style edge response — a standard sharpness metric.
 * Low variance ⇒ blurry capture. Runs on a downscaled grayscale frame.
 */
export function laplacianVariance(source, sampleCanvas) {
  const c = sampleCanvas;
  const w = 160;
  const h = 100;
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  // 4-neighbour Laplacian
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += v;
      sumSq += v * v;
      n += 1;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Edge density inside vs. outside the ID guide box — a lightweight
 * "is a card-like rectangle filling the frame?" heuristic (no OpenCV needed).
 * Returns { inside, outside } edge ratios in [0..1].
 */
export function edgeDensity(video, sampleCanvas, box) {
  const c = sampleCanvas;
  const w = 160;
  const h = 100;
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx || !video.videoWidth) return { inside: 0, outside: 0 };
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  const bx0 = Math.floor(box.x * w);
  const by0 = Math.floor(box.y * h);
  const bx1 = Math.ceil((box.x + box.w) * w);
  const by1 = Math.ceil((box.y + box.h) * h);

  let inEdges = 0;
  let inCount = 0;
  let outEdges = 0;
  let outCount = 0;
  const T = 26; // gradient threshold

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = Math.abs(gray[i + 1] - gray[i - 1]);
      const gy = Math.abs(gray[i + w] - gray[i - w]);
      const isEdge = gx + gy > T ? 1 : 0;
      if (x >= bx0 && x <= bx1 && y >= by0 && y <= by1) {
        inEdges += isEdge;
        inCount += 1;
      } else {
        outEdges += isEdge;
        outCount += 1;
      }
    }
  }
  return {
    inside: inCount ? inEdges / inCount : 0,
    outside: outCount ? outEdges / outCount : 0,
  };
}
