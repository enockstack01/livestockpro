const AnthropicModule = require('@anthropic-ai/sdk');

const Anthropic = AnthropicModule.default || AnthropicModule;

const { currentModel, logModelCall } = require('./aiSettings');

/* LivestockPro AI. AI_API_KEY turns it on; without it every /api/ai
   route answers 503 so the clients can show "AI is not set up yet" instead
   of failing. The model comes from the admin's AI settings
   (server/lib/aiSettings.js); users never see which provider runs it. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let client = null;

/* AI_API_KEY; the older variable name still works so existing deployments
   keep running. */
const apiKey = () => process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || '';

function isConfigured() {
  return Boolean(apiKey());
}

function getClient() {
  if (!isConfigured()) return null;
  if (!client) client = new Anthropic({ apiKey: apiKey(), maxRetries: 2, timeout: 5 * 60 * 1000 });
  return client;
}

/* An error a route can hand straight to the client: `status` is the HTTP
   status, `code` a stable value the apps translate. */
class AiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const LANGUAGES = {
  en: 'British English', fr: 'French', sw: 'Swahili', rw: 'Kinyarwanda', es: 'Spanish',
  pt: 'Portuguese', de: 'German', ar: 'Arabic', zh: 'Simplified Chinese', hi: 'Hindi'
};

function languageName(code) {
  return LANGUAGES[String(code || 'en').slice(0, 2).toLowerCase()] || LANGUAGES.en;
}

/* The voice every feature shares, from the Agricoders writing rules. */
function brandVoice(language) {
  return [
    'You are the AI assistant inside LivestockPro, a livestock farm management app by Agricoders used by farmers, vets and extension officers, mostly in East Africa.',
    `Write every piece of text for the user in ${languageName(language)}, even if the records are in another language. Keep record values such as tag IDs and drug names as they are.`,
    'Use plain, practical language a farmer can act on today. Prefer short sentences. Use sentence case for any titles.',
    'Do not use em dashes, en dashes or spaced hyphens to join words or sentences; use a colon or a comma instead. Write ranges with "to" (for example "7 to 14 days").',
    'Write money as the amount followed by the currency code (for example "25,000 RWF"), except US dollars which take the $ sign first ("$20").',
    'Base what you say on the farm records you are given. When the records do not say something, say that you do not know rather than guessing.'
  ].join('\n');
}

const VET_NOTICE = 'LivestockPro AI supports, and does not replace, a qualified veterinarian. Always confirm a diagnosis and any prescription medicine with a vet.';

function mapApiError(err) {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError(503, 'AI_KEY_INVALID', 'The AI service rejected the server key. An administrator needs to check the AI key.');
  }
  if (err instanceof Anthropic.RateLimitError) return new AiError(429, 'AI_BUSY', 'The AI service is busy. Please try again in a minute.');
  if (err instanceof Anthropic.BadRequestError) return new AiError(400, 'AI_BAD_REQUEST', err.message);
  if (err instanceof Anthropic.APIConnectionError) return new AiError(503, 'AI_UNREACHABLE', 'Could not reach the AI service. Please try again.');
  if (err instanceof Anthropic.APIError) return new AiError(502, 'AI_ERROR', err.message);
  return new AiError(500, 'AI_ERROR', err.message || 'AI request failed.');
}

/* One Messages API call. `schema` asks for JSON matching that schema
   (structured outputs) and returns the parsed object; otherwise the text.
   With `tools` the raw message is returned so the caller can run them. */
async function ask({ system, messages, schema, tools, effort = 'medium', maxTokens = 16000, raw = false, model }) {
  const anthropic = getClient();
  if (!anthropic) throw new AiError(503, 'AI_NOT_CONFIGURED', 'AI is not set up on this server yet.');

  const modelId = model || (await currentModel());
  const params = {
    model: modelId,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system,
    messages,
    output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) }
  };
  if (tools) params.tools = tools;

  let response;
  const started = Date.now();
  try {
    response = await anthropic.beta.messages.create(params);
  } catch (err) {
    const mapped = mapApiError(err);
    logModelCall({ model: modelId, ok: false, code: mapped.code, usage: null, ms: Date.now() - started });
    throw mapped;
  }
  logModelCall({ model: modelId, ok: response.stop_reason !== 'refusal', code: response.stop_reason === 'refusal' ? 'AI_REFUSED' : null, usage: response.usage, ms: Date.now() - started });

  if (response.stop_reason === 'refusal') {
    throw new AiError(422, 'AI_REFUSED', 'The AI could not help with this request.');
  }
  if (raw) return response;
  if (response.stop_reason === 'max_tokens') {
    throw new AiError(502, 'AI_TRUNCATED', 'The AI answer was cut short. Please try again with less detail.');
  }

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!schema) return { text, response };
  try {
    return { data: JSON.parse(text), response };
  } catch {
    throw new AiError(502, 'AI_BAD_OUTPUT', 'The AI answer could not be read. Please try again.');
  }
}

function textOf(response) {
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

/* Image blocks for photos the user took: [{ media_type, data }] in base64. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 7 * 1024 * 1024; // about 5 MB once decoded

function imageBlocks(images) {
  if (!Array.isArray(images) || !images.length) return [];
  if (images.length > MAX_IMAGES) throw new AiError(400, 'AI_BAD_REQUEST', `Send at most ${MAX_IMAGES} photos.`);
  return images.map((img) => {
    const type = img && String(img.media_type || '').toLowerCase();
    const data = img && String(img.data || '').replace(/^data:[^,]+,/, '');
    if (!IMAGE_TYPES.includes(type) || !data || !/^[A-Za-z0-9+/=]+$/.test(data)) throw new AiError(400, 'AI_BAD_REQUEST', 'A photo could not be read. Use a JPEG, PNG or WebP picture.');
    if (data.length > MAX_IMAGE_CHARS) throw new AiError(400, 'AI_BAD_REQUEST', 'A photo is too large. Use a smaller picture.');
    return { type: 'image', source: { type: 'base64', media_type: type, data } };
  });
}

module.exports = { imageBlocks, MAX_IMAGES, getClient, AiError, isConfigured, ask, textOf, brandVoice, languageName, VET_NOTICE, mapApiError };
