/* YOLO11 detection post-processing for the on-phone model: box decoding,
   class-aware NMS and un-letterboxing. Plain JS with no React Native
   imports, ported from livestock-models/mobile/src/core/yolo.ts (its tests
   cover the same maths). */

/* Scale an image to fit size x size keeping its aspect ratio, centred, the
   rest padded (as ultralytics does). */
export function letterboxParams(srcW, srcH, size) {
  const scale = Math.min(size / srcW, size / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  return { scale, padX: Math.floor((size - newW) / 2), padY: Math.floor((size - newH) / 2), newW, newH, size };
}

/* Boxes from the raw network output ([1, 4+nc, N] 'channels_first' or
   [1, N, 4+nc] 'channels_last'), in model-input pixels. */
export function decodeYolo(out, { numClasses, imgsz, layout, confThreshold = 0.25, iouThreshold = 0.45, maxDet = 50 }) {
  const C = 4 + numClasses;
  if (out.length % C !== 0) throw new Error(`output length ${out.length} is not a multiple of 4+nc=${C}`);
  const N = out.length / C;
  const at = (anchor, ch) => (layout === 'channels_first' ? out[ch * N + anchor] : out[anchor * C + ch]);

  const cand = [];
  for (let a = 0; a < N; a++) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < numClasses; c++) {
      const s = at(a, 4 + c);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best >= 0 && bestScore >= confThreshold) cand.push({ classId: best, score: bestScore, cx: at(a, 0), cy: at(a, 1), w: at(a, 2), h: at(a, 3) });
  }
  // TFLite exports give coordinates as fractions of the input, ONNX gives pixels: tell from the data.
  const maxCoord = cand.reduce((m, d) => Math.max(m, d.cx, d.cy, d.w, d.h), 0);
  const k = cand.length > 0 && maxCoord <= 2 ? imgsz : 1;
  const boxes = cand.map((d) => ({
    classId: d.classId,
    score: d.score,
    box: { x1: (d.cx - d.w / 2) * k, y1: (d.cy - d.h / 2) * k, x2: (d.cx + d.w / 2) * k, y2: (d.cy + d.h / 2) * k }
  }));
  return nms(boxes, iouThreshold, maxDet);
}

export function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = ix * iy;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return union <= 0 ? 0 : inter / union;
}

/* Greedy non-maximum suppression, per class. */
export function nms(items, iouThr, maxDet) {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const keep = [];
  for (const it of sorted) {
    if (keep.length >= maxDet) break;
    if (keep.every((k) => k.classId !== it.classId || iou(k.box, it.box) < iouThr)) keep.push(it);
  }
  return keep;
}

/* Boxes from letterboxed model space back to the image's pixels, clipped. */
export function toOriginal(dets, lb, srcW, srcH, labels) {
  const clip = (v, max) => Math.max(0, Math.min(max, v));
  return dets
    .map((d) => ({
      classId: d.classId,
      label: labels[d.classId] || `class_${d.classId}`,
      score: d.score,
      box: {
        x1: clip((d.box.x1 - lb.padX) / lb.scale, srcW),
        y1: clip((d.box.y1 - lb.padY) / lb.scale, srcH),
        x2: clip((d.box.x2 - lb.padX) / lb.scale, srcW),
        y2: clip((d.box.y2 - lb.padY) / lb.scale, srcH)
      }
    }))
    .filter((d) => d.box.x2 - d.box.x1 > 1 && d.box.y2 - d.box.y1 > 1);
}

/* Detections in the shape the server's report uses (server/lib/vision.js):
   { photo, label, confidence, box: [x1, y1, x2, y2] as fractions }. */
export function toReportDetections(dets, width, height, photo) {
  const r = (v) => Math.round(v * 10000) / 10000;
  return dets.map((d) => ({
    photo,
    label: d.label,
    confidence: Math.round(d.score * 1000) / 1000,
    box: [r(d.box.x1 / width), r(d.box.y1 / height), r(d.box.x2 / width), r(d.box.y2 / height)]
  }));
}
