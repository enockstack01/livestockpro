import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import jpeg from 'jpeg-js';
import { base64ToBytes, rgbaToTensor } from './preprocess';
import { decodeYolo, toOriginal, toReportDetections } from './yolo';
import MODEL from '../../assets/models/model.json';

/* The on-phone livestock detector (YOLO11n, TFLite, 3 MB), for diagnosis
   photos taken with no connection. Everything here runs on the phone:
     photo -> resize (native) -> JPEG decode -> letterbox -> TFLite -> decode + NMS
   It is the same development model as the server's, only smaller, so its
   detections are preliminary hints; the case is checked online later. */

export const MODEL_VERSION = MODEL.version || 'on-device';
export const available = Boolean(MODEL.installed);

let modelPromise = null;

function loadModel() {
  if (!MODEL.installed) return Promise.reject(new Error('No on-phone model is installed in this build.'));
  // [] = the default CPU delegate, which works on every phone.
  if (!modelPromise) modelPromise = loadTensorflowModel(require('../../assets/models/model.tflite'), []).catch((err) => { modelPromise = null; throw err; });
  return modelPromise;
}

async function detectOne(uri, srcW, srcH, photo) {
  const size = MODEL.imgsz;
  const model = await loadModel();
  // Downscale natively so the long side equals the model size: keeps the JS decode small.
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize(srcH > srcW ? { height: size } : { width: size });
  const small = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.92, base64: true });
  const img = jpeg.decode(base64ToBytes(small.base64 || ''), { useTArray: true, formatAsRGBA: true });
  const { input, letterbox } = rgbaToTensor(img.data, img.width, img.height, size, MODEL.input_layout || 'nhwc');
  const feed = MODEL.input_dtype === 'uint8' ? Uint8Array.from(input, (v) => Math.round(v * 255)) : input;
  const outputs = await model.run([feed.buffer]);
  const raw = new Float32Array(outputs[0]);
  const dets = decodeYolo(raw, { numClasses: MODEL.labels.length, imgsz: size, layout: MODEL.output_layout });
  return { size: { width: img.width, height: img.height }, detections: toReportDetections(toOriginal(dets, letterbox, img.width, img.height, MODEL.labels), img.width, img.height, photo) };
}

/* photos: [{ uri, width, height }]. Returns the same shape as the server's
   report.vision: { available, model_version, photos, detections, ms }. */
export async function detectPhotos(photos) {
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < photos.length; i++) results.push(await detectOne(photos[i].uri, photos[i].width, photos[i].height, i + 1));
  return {
    available: true,
    on_device: true,
    model_version: MODEL_VERSION,
    photos: results.map((r) => r.size),
    detections: results.flatMap((r) => r.detections),
    ms: Date.now() - t0
  };
}
