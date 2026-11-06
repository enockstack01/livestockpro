/* The offline AI runs on the phone only (gemma.native.js); the browser
   build of the app has no llama.rn, so it is never offered there. */
export const GEMMA = { name: 'LivestockPro offline AI', bytes: 0, terms: 'https://ai.google.dev/gemma/terms' };
const UNSUPPORTED = { status: 'unsupported', progress: 0 };
export const supported = () => false;
export const subscribe = (fn) => { fn(UNSUPPORTED); return () => {}; };
export const refreshStatus = async () => UNSUPPORTED;
export const ready = async () => false;
const no = async () => { throw new Error('The offline AI works in the phone app only.'); };
export const startDownload = no;
export const downloadNow = no;
export const startAutoDownload = async () => {};
export const waitingForWifi = () => false;
export const cancelDownload = async () => {};
export const removeModel = async () => {};
export const stop = async () => {};
export const diagnose = no;
export const chat = no;
export const selfTest = no;
export const lastProblem = async () => null;
