import { useEffect, useRef, useState } from 'react';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * Lazily creates a MediaPipe FaceLandmarker (VIDEO mode, blendshapes +
 * transformation matrix, up to 2 faces so multi-face fraud is detectable).
 * Tries the GPU delegate first, falls back to CPU for devices without WebGL.
 * Everything runs on-device via WebAssembly — no frames leave the browser.
 */
export default function useFaceLandmarker(enabled) {
  const landmarkerRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error

  useEffect(() => {
    if (!enabled || landmarkerRef.current) return undefined;
    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        const options = (delegate) => ({
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numFaces: 2,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
        let lm;
        try {
          lm = await FaceLandmarker.createFromOptions(fileset, options('GPU'));
        } catch {
          lm = await FaceLandmarker.createFromOptions(fileset, options('CPU'));
        }
        if (cancelled) { lm.close(); return; }
        landmarkerRef.current = lm;
        setStatus('ready');
      } catch (err) {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [enabled]);

  // Close the engine on unmount to release WASM/GPU memory.
  useEffect(() => () => {
    landmarkerRef.current?.close?.();
    landmarkerRef.current = null;
  }, []);

  return { landmarkerRef, status };
}
