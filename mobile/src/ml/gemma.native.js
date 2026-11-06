import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { connectivity, subscribeConnectivity } from '../lib/connectivity';
import { DIAGNOSIS_SCHEMA, SAMPLING, chatMessages, diagnosisMessages } from './offlinePrompts';

/* The offline AI: Gemma 3 1B (instruction tuned, 4-bit GGUF, 722 MB) run on
   the phone by llama.rn, next to the YOLO11n detector (src/ml/detector).
   Online, Claude Haiku on the server does this work; offline, Gemma writes
   the diagnosis and answers questions from the phone's own records.

   The model is not in the APK: the app downloads it by itself on Wi-Fi
   after it is installed (startAutoDownload, no sign in needed), from a fixed
   revision of the Hugging Face repository, carrying on where it stopped
   after a dropped connection or a restart. Its size is checked and it is
   kept in the app's files. Settings can also start it on mobile data. llama.rn ships 64-bit ARM libraries only, so
   on 32-bit phones the offline AI is not offered (supported() is false). */

export const GEMMA = {
  name: 'Gemma 3 1B',
  file: 'gemma-3-1b-it-Q4_0.gguf',
  url: 'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/f0b45be0aac41bd6a100a4b5734cad5f67255bfb/gemma-3-1b-it-Q4_0.gguf',
  bytes: 721918496,
  sha256: '27ee88e03be02e9ba73def9a819d570d8ad73716e50769e87f374ae394b0276e',
  terms: 'https://ai.google.dev/gemma/terms'
};

const DIR = `${FileSystem.documentDirectory}models/`;
const PATH = `${DIR}${GEMMA.file}`;
const PART = `${PATH}.part`;
// Room for the file plus some to spare, so the phone is not left full.
const SPARE_BYTES = 300 * 1024 * 1024;
// Free the model's memory when it has not been used for a while.
const IDLE_MS = 3 * 60 * 1000;

let llamaModule;
function llama() {
  if (llamaModule === undefined) {
    try { llamaModule = require('llama.rn'); } catch { llamaModule = null; }
  }
  return llamaModule;
}

/* Whether this phone can run the offline AI at all (64-bit ARM build of
   llama.rn present). */
export function supported() {
  const m = llama();
  if (!m) return false;
  try {
    const { NativeModules, TurboModuleRegistry } = require('react-native');
    return Boolean((TurboModuleRegistry && TurboModuleRegistry.get && TurboModuleRegistry.get('RNLlama')) || NativeModules.RNLlama);
  } catch {
    return false;
  }
}

/* ---------- Download ---------- */

const listeners = new Set();
let state = { status: 'unknown', progress: 0 };
function setState(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
  return state;
}
export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/* { status: 'unsupported' | 'absent' | 'downloading' | 'ready' | 'error',
   progress (0 to 1), error }. */
export async function refreshStatus() {
  if (!supported()) return setState({ status: 'unsupported' });
  if (state.status === 'downloading') return state;
  const info = await FileSystem.getInfoAsync(PATH).catch(() => ({ exists: false }));
  if (info.exists && info.size === GEMMA.bytes) return setState({ status: 'ready', progress: 1, error: null });
  const part = await partSize();
  return setState({ status: state.status === 'error' ? 'error' : 'absent', progress: part / GEMMA.bytes });
}

async function partSize() {
  const info = await FileSystem.getInfoAsync(PART).catch(() => ({ exists: false }));
  return info.exists && info.size < GEMMA.bytes ? info.size : 0;
}

let download = null;
let cancelled = false;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* Downloads the model, carrying on from a partial file (the downloader
   resumes with an HTTP range; a fresh one each time, so the offset always
   matches the bytes already saved). */
export async function startDownload() {
  if (!supported()) throw new Error('This phone cannot run the offline AI.');
  if (download || state.status === 'ready') return;
  cancelled = false;
  download = true;
  try {
    const free = await FileSystem.getFreeDiskStorageAsync().catch(() => Infinity);
    const have = await partSize();
    if (free < GEMMA.bytes - have + SPARE_BYTES) throw new Error(`Not enough free space: the offline AI needs about ${Math.ceil((GEMMA.bytes - have + SPARE_BYTES) / 1e6)} MB.`);
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    if (!have) await FileSystem.deleteAsync(PART, { idempotent: true }).catch(() => {});
    setState({ status: 'downloading', progress: have / GEMMA.bytes, error: null });
    let lastError = null;
    // A dropped connection: carry on from where it stopped, a few times.
    for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
      if (attempt) await pause(3000 * attempt);
      const from = await partSize();
      download = FileSystem.createDownloadResumable(GEMMA.url, PART, {}, ({ totalBytesWritten }) => {
        setState({ progress: Math.min(1, totalBytesWritten / GEMMA.bytes) });
      }, from ? String(from) : undefined);
      try {
        const result = await download.downloadAsync();
        if (cancelled) return;
        if (result && result.status >= 400) throw new Error(`The download failed (HTTP ${result.status}).`);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (cancelled) return;
    if (lastError) throw lastError;
    const info = await FileSystem.getInfoAsync(PART);
    if (!info.exists || info.size !== GEMMA.bytes) {
      // A wrong size cannot be carried on from: start again next time.
      await FileSystem.deleteAsync(PART, { idempotent: true }).catch(() => {});
      throw new Error('The download was incomplete. Please try again.');
    }
    await FileSystem.moveAsync({ from: PART, to: PATH });
    setState({ status: 'ready', progress: 1, error: null });
  } catch (err) {
    // The partial file is kept, so the next try carries on from it.
    if (!cancelled) setState({ status: 'error', error: err.message || String(err), progress: (await partSize()) / GEMMA.bytes });
  } finally {
    download = null;
  }
}

/* ---------- Automatic download ---------- */

// Set when the person cancels or removes the model, so it is not fetched again by itself.
const AUTO_OFF_KEY = 'lp_offline_ai_auto_off';
const RETRY_MS = 2 * 60 * 1000;
let autoOff = null;
let autoStarted = false;
let lastAutoTry = 0;

async function setAutoOff(off) {
  autoOff = off;
  await (off ? SecureStore.setItemAsync(AUTO_OFF_KEY, '1') : SecureStore.deleteItemAsync(AUTO_OFF_KEY)).catch(() => {});
}

/* Whether the app is waiting for Wi-Fi to fetch the model by itself. */
export const waitingForWifi = () => autoOff === false && state.status !== 'ready' && state.status !== 'downloading' && !connectivity().wifi;

async function autoTry() {
  if (autoOff !== false || download || !connectivity().wifi) return;
  if (Date.now() - lastAutoTry < RETRY_MS && state.status === 'error') return;
  const s = await refreshStatus();
  if (s.status !== 'absent' && s.status !== 'error') return;
  lastAutoTry = Date.now();
  startDownload().catch(() => {});
}

/* Called once when the app starts (app/_layout.js): fetches the model on
   Wi-Fi as soon as it can, and again whenever Wi-Fi comes back. Mobile data
   is not used by itself, as 722 MB can cost a farmer a lot. */
export async function startAutoDownload() {
  if (autoStarted || !supported()) return;
  autoStarted = true;
  autoOff = Boolean(await SecureStore.getItemAsync(AUTO_OFF_KEY).catch(() => null));
  await refreshStatus();
  subscribeConnectivity(() => { autoTry(); setState({}); });
  setInterval(autoTry, RETRY_MS);
  autoTry();
}

/* The Download button in Settings: any connection, and automatic again. */
export async function downloadNow() {
  await setAutoOff(false);
  return startDownload();
}

export async function cancelDownload() {
  cancelled = true;
  await setAutoOff(true);
  const d = download;
  download = null;
  if (d && d.pauseAsync) await d.pauseAsync().catch(() => {});
  await FileSystem.deleteAsync(PART, { idempotent: true }).catch(() => {});
  setState({ status: 'absent', progress: 0, error: null });
}

export async function removeModel() {
  await setAutoOff(true);
  await stop();
  if (current) await current.catch(() => {});
  await unload(true);
  await FileSystem.deleteAsync(PATH, { idempotent: true }).catch(() => {});
  setState({ status: 'absent', progress: 0 });
}

/* ---------- Running ---------- */

let contextPromise = null;
let idleTimer = null;
let running = null;

/* Never while an answer is being written (a diagnosis can take minutes):
   the idle timer starts again when it finishes. force: after stop(). */
async function unload(force) {
  clearTimeout(idleTimer);
  if (running && !force) return;
  const p = contextPromise;
  contextPromise = null;
  if (p) {
    try { await (await p).release(); } catch { /* already gone */ }
  }
}

function touch() {
  clearTimeout(idleTimer);
  if (!running) idleTimer = setTimeout(() => { unload(); }, IDLE_MS);
}

/* The model takes about a gigabyte of memory; give it back when the app
   goes to the background (after the answer being written, if any). */
let inBackground = false;
AppState.addEventListener('change', (s) => {
  inBackground = s === 'background';
  if (inBackground) unload();
});

function finished() {
  running = null;
  if (inBackground) unload();
  else touch();
}

function context() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const m = llama();
      if (!m || !supported()) throw new Error('This phone cannot run the offline AI.');
      const info = await FileSystem.getInfoAsync(PATH);
      if (!info.exists) throw new Error('The offline AI is not downloaded yet. Download it in Settings.');
      return m.initLlama({ model: PATH, n_ctx: 4096, n_batch: 512, n_gpu_layers: 0, use_mlock: false });
    })().catch((err) => { contextPromise = null; throw err; });
  }
  touch();
  return contextPromise;
}

export async function ready() {
  return (await refreshStatus()).status === 'ready';
}

/* Stops the answer being written (the partial result is discarded),
   also while the model is still loading. */
let stopRequested = false;
const stopped = () => Object.assign(new Error('Stopped.'), { stopped: true });
export async function stop() {
  stopRequested = true;
  const c = running;
  if (c && c.stopCompletion) await c.stopCompletion().catch(() => {});
}

/* One answer at a time; running is set before the model loads so it is
   not released while loading or writing. */
let current = null;
function run(work) {
  running = {};
  stopRequested = false;
  current = (async () => {
    try {
      const ctx = await context();
      if (stopRequested) throw stopped();
      running = ctx;
      return await work(ctx);
    } finally {
      current = null;
      finished();
    }
  })();
  return current;
}

/* An offline diagnosis in the online report's shape (DIAGNOSIS_SCHEMA).
   onProgress(words) while it writes. */
export function diagnose({ language, facts, vision, photoCount, reference, onProgress }) {
  let words = 0;
  return run(async (ctx) => {
    const res = await ctx.completion({
      messages: diagnosisMessages({ language, facts, vision, photoCount, reference }),
      response_format: { type: 'json_schema', json_schema: { strict: true, schema: DIAGNOSIS_SCHEMA } },
      n_predict: 1500,
      temperature: SAMPLING.temperature,
      top_p: SAMPLING.top_p,
      top_k: SAMPLING.top_k
    }, (data) => { if (data.token && /s/.test(data.token)) onProgress && onProgress(++words); });
    if (res.interrupted || stopRequested) throw stopped();
    return JSON.parse(res.text);
  });
}

/* An offline answer to the farmer's question. onText(textSoFar). */
export function chat({ language, snapshot, vision, history, onText }) {
  return run(async (ctx) => {
    const res = await ctx.completion({
      messages: chatMessages({ language, snapshot, vision, history }),
      n_predict: 400,
      ...SAMPLING
    }, (data) => { if (onText && data.accumulated_text) onText(data.accumulated_text); });
    if (res.interrupted || stopRequested) throw stopped();
    return res.text.trim();
  });
}
