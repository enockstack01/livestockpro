const AnthropicModule = require('@anthropic-ai/sdk');

const Anthropic = AnthropicModule.default || AnthropicModule;

/* LivestockPro's AI features run on Claude through the Anthropic API.
   ANTHROPIC_API_KEY turns them on; without it every /api/ai route answers
   503 so the clients can show "AI is not set up yet" instead of failing.
   ANTHROPIC_MODEL overrides the model without a code change. */
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let client = null;

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!isConfigured()) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 5 * 60 * 1000 });
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
    return new AiError(503, 'AI_KEY_INVALID', 'The AI service rejected the API key. Check ANTHROPIC_API_KEY.');
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
async function ask({ system, messages, schema, tools, effort = 'medium', maxTokens = 16000, raw = false }) {
  const anthropic = getClient();
  if (!anthropic) throw new AiError(503, 'AI_NOT_CONFIGURED', 'AI is not set up on this server yet.');

  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system,
    messages,
    output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) }
  };
  if (tools) params.tools = tools;

  let response;
  try {
    response = await anthropic.beta.messages.create(params);
  } catch (err) {
    throw mapApiError(err);
  }

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

module.exports = { MODEL, AiError, isConfigured, ask, textOf, brandVoice, languageName, VET_NOTICE, mapApiError };
