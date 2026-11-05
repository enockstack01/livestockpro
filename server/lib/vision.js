const { AiError } = require('./ai');

/* The livestock health detector: a YOLO model on a Hugging Face Space
   (livestock-models/space/app.py, JSON endpoint "detect") that screens the
   photos sent for a diagnosis. VISION_API_URL is the Space
   (https://<owner>-<space>.hf.space) and HF_TOKEN a read token when the
   Space is private. Only this server holds the token; the apps never call
   the Space themselves.

   It is a development model (whole-animal boxes; healthy, lumpy skin
   disease, foot and mouth disease), so its detections are screening hints
   for the AI and the reports, never a diagnosis. */
/* A ZeroGPU Space can take 30 seconds or more to start, so the first try
   gets longer than the retry. */
const FIRST_TIMEOUT_MS = 60 * 1000;
const RETRY_TIMEOUT_MS = 30 * 1000;
const CONFIDENCE = 0.25;
/* After the Space could not be reached it is left alone for a while, so
   every diagnosis does not wait out the timeout while it is down. */
const COOL_OFF_MS = 2 * 60 * 1000;

let downUntil = 0;

const baseUrl = () => String(process.env.VISION_API_URL || '').trim().replace(/\/+$/, '');

function isVisionConfigured() {
  return Boolean(baseUrl());
}

/* Every request to a private Space (upload, call, result) carries the token. */
function headers(json = true) {
  const h = json ? { 'Content-Type': 'application/json' } : {};
  const token = process.env.HF_TOKEN || process.env.VISION_API_KEY;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

const unreachable = (message, retry = true) => Object.assign(new AiError(503, 'VISION_UNREACHABLE', message), { retry });
const badResponse = (message, retry = false) => Object.assign(new AiError(502, 'VISION_BAD_RESPONSE', message), { retry });

/* Gradio's HTTP API answers a call with an event id, then streams the result
   as server-sent events ending in "complete" (or "error"). */
function lastEvent(text) {
  let found = null;
  for (const chunk of String(text).split(/\r?\n\r?\n/)) {
    let event = null;
    const data = [];
    for (const line of chunk.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (event === 'complete' || event === 'error') found = { event, data: data.join('\n') };
  }
  return found;
}

function checkStatus(res) {
  /* A private Space answers 404 as well as 401 to a missing or wrong token. */
  if ([401, 403, 404].includes(res.status)) throw unreachable(`The photo screening service refused the request (${res.status}). An administrator needs to check VISION_API_URL and HF_TOKEN.`, false);
  if (!res.ok) throw unreachable(`The photo screening service answered ${res.status}.`);
}

/* Gradio's three steps: upload the photo, start the "detect" call with a
   reference to the upload, then read the result stream. */
async function callOnce(block, timeoutMs) {
  const base = baseUrl();
  const signal = AbortSignal.timeout(timeoutMs);
  let res;
  let body;
  try {
    const form = new FormData();
    const type = block.source.media_type || 'image/jpeg';
    form.append('files', new Blob([Buffer.from(block.source.data, 'base64')], { type }), `photo.${type.split('/')[1] || 'jpg'}`);
    res = await fetch(`${base}/gradio_api/upload`, { method: 'POST', headers: headers(false), body: form, signal });
    checkStatus(res);
    const [path] = await res.json().catch(() => []);
    if (typeof path !== 'string') throw badResponse('The photo screening service did not accept the photo.');

    const url = `${base}/gradio_api/call/detect`;
    res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify({ data: [{ path, meta: { _type: 'gradio.FileData' } }, CONFIDENCE] }), signal });
    checkStatus(res);
    const { event_id: eventId } = await res.json().catch(() => ({}));
    if (!eventId) throw badResponse('The photo screening service did not start the check.');
    res = await fetch(`${url}/${eventId}`, { headers: headers(), signal });
    checkStatus(res);
    body = await res.text();
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw unreachable(err.name === 'TimeoutError' ? 'The photo screening service did not answer in time.' : 'Could not reach the photo screening service.');
  }
  const ev = lastEvent(body);
  /* A failed call: a photo it could not read, or a GPU worker that gave up
     (common on a cold start), so it is worth one more try. */
  if (!ev || ev.event === 'error') throw badResponse('The photo screening service could not check the photo.', true);
  try {
    const parsed = JSON.parse(ev.data);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    throw badResponse('The photo screening answer could not be read.');
  }
}

const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places;

/* Boxes become fractions of the photo (0 to 1), so the apps can draw them
   over a thumbnail of any size. */
function normalise(raw) {
  const w = Number(raw && raw.image && raw.image.width);
  const h = Number(raw && raw.image && raw.image.height);
  if (!raw || !Array.isArray(raw.detections) || !(w > 0) || !(h > 0)) throw badResponse('The photo screening answer could not be read.');
  const clip = (v) => Math.max(0, Math.min(1, v));
  const detections = raw.detections
    .map((d) => ({ ...d, box: d && d.box && !Array.isArray(d.box) ? [d.box.x1, d.box.y1, d.box.x2, d.box.y2] : d && d.box }))
    .filter((d) => typeof d.label === 'string' && Number.isFinite(Number(d.confidence)) && Array.isArray(d.box) && d.box.length === 4 && d.box.every((v) => Number.isFinite(Number(v))))
    .map((d) => {
      const [x1, y1, x2, y2] = d.box.map(Number);
      return {
        label: d.label.slice(0, 60),
        confidence: round(Number(d.confidence), 3),
        box: [clip(x1 / w), clip(y1 / h), clip(x2 / w), clip(y2 / h)].map((v) => round(v, 4))
      };
    });
  return { model_version: String(raw.model_version || 'unknown').slice(0, 60), size: { width: w, height: h }, detections };
}

async function detectOne(block) {
  try {
    return normalise(await callOnce(block, FIRST_TIMEOUT_MS));
  } catch (err) {
    if (!err.retry) throw err;
    return normalise(await callOnce(block, RETRY_TIMEOUT_MS));
  }
}

/* Screens the photos already checked by imageBlocks() (server/lib/ai.js).
   Returns { detections: [{ photo, label, confidence, box }], model_version,
   photos: [{ width, height }] }, photo numbered from 1 and box as
   [x1, y1, x2, y2] fractions. Throws AiError VISION_UNREACHABLE or
   VISION_BAD_RESPONSE. */
async function detect(blocks) {
  if (!isVisionConfigured()) throw unreachable('Photo screening is not set up on this server.', false);
  if (downUntil > Date.now()) throw unreachable('The photo screening service is not available right now.', false);
  try {
    const results = await Promise.all(blocks.map((b) => detectOne(b)));
    return {
      model_version: results[0] ? results[0].model_version : 'unknown',
      photos: results.map((r) => r.size),
      detections: results.flatMap((r, i) => r.detections.map((d) => ({ photo: i + 1, ...d })))
    };
  } catch (err) {
    // Only an unreachable service; one unreadable photo must not turn screening off for everyone.
    if (err.code === 'VISION_UNREACHABLE') downUntil = Date.now() + COOL_OFF_MS;
    throw err;
  }
}

module.exports = { detect, isVisionConfigured, lastEvent, normalise };
