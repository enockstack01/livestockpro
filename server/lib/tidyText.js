/* Makes AI text read cleanly in the app: plain sentences, no markdown
   symbols, no dashes used to join words or sentences, no emoji. The AI is
   told the same in its instructions; this guarantees it, for every answer
   and report, on the server (server/lib/tidyText.js is a copy of this file
   for the CommonJS server: keep the two the same), on the web, and on the
   phone, including reports saved earlier.

   Kept as they are: tag IDs (COW-001), dates (2026-11-12), phone numbers,
   words joined by a hyphen (follow-up), and number ranges, which become
   "7 to 14". */

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}\u{200D}]/gu;

function tidyText(input) {
  if (typeof input !== 'string' || !input) return input;
  let s = input.replace(/\r\n/g, '\n');
  // Markdown: code ticks, bold and italic markers, headings, quotes, rules.
  s = s.replace(/```[a-z]*\n?/gi, '').replace(/`([^`\n]+)`/g, '$1');
  s = s.replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, '$2');
  s = s.replace(/(^|[\s(])\*(?=\S)([^*\n]*?\S)\*(?=[\s).,;:!?]|$)/g, '$1$2');
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s{0,3}>\s?/gm, '').replace(/^\s*([-*_=]\s*){3,}$/gm, '');
  s = s.replace(/\[([^\]\n]+)\]\((?:https?:\/\/)[^)\s]+\)/g, '$1');
  // List bullets become plain lines (a numbered list keeps its numbers).
  s = s.replace(/^[ \t]*(?:[-*•–—▪●◦]|•)[ \t]+/gm, '');
  s = s.replace(/(\d)\s*[—–]\s*(?=\d)/g, '$1 to ');
  // Dashes that join words or sentences become a comma.
  s = s.replace(/\s*[—–]\s*/g, ', ').replace(/ +- +/g, ', ').replace(/ -{2,} /g, ', ');
  // Number ranges: 7-14 days, 7 – 14 days.
  s = s.replace(/(?<![\w.-])(\d{1,4}(?:[.,]\d+)?)\s?-\s?(\d{1,4}(?:[.,]\d+)?)(?![\d-])/g, (m, a, b) => (/^\d{4}$/.test(a) && /^\d{2}$/.test(b) ? m : `${a} to ${b}`));
  s = s.replace(/, ,/g, ',').replace(/,\s*([.!?:;])/g, '$1').replace(/^\s*,\s*/gm, '');
  s = s.replace(EMOJI, '');
  s = s.replace(/[ \t]+$/gm, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/* Every string inside an object or list, tidied (keys and numbers are left
   alone). Strings that are IDs, dates or links pass through unchanged. */
function tidyDeep(value) {
  if (typeof value === 'string') return /^(?:https?:\/\/|data:)/.test(value) || (value.length > 200 && !/\s/.test(value)) ? value : tidyText(value);
  if (Array.isArray(value)) return value.map(tidyDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = tidyDeep(v);
    return out;
  }
  return value;
}

module.exports = { tidyText, tidyDeep };
