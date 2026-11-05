/* The on-phone detector is native only (detector.native.js); the browser
   build of the app has no TFLite, so offline photo checks are not offered. */
export const MODEL_VERSION = null;
export const available = false;

export async function detectPhotos() {
  throw new Error('Checking photos without a connection works in the phone app only.');
}
