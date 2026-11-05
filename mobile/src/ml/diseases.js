import seed from './diseases.json';

/* The offline first-response guide for what the on-phone model flags,
   copied from livestock-models (src/data/diseases.json). English only and
   not yet reviewed by a veterinarian (see its disclaimer); no drug names or
   doses on purpose. */
const BY_ALIAS = new Map();
for (const d of seed.diseases) for (const a of [d.label, ...(d.aliases || [])]) BY_ALIAS.set(a.toLowerCase(), d);

export function findDisease(label) {
  return BY_ALIAS.get(String(label || '').toLowerCase()) || null;
}

export const GUIDE_DISCLAIMER = seed.disclaimer;
