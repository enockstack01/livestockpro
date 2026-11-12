import { findDisease } from './diseases';
import { tidyDeep } from '../../../shared/tidyText';
import { DIAGNOSIS_SCHEMA, VET_NOTICE } from './offlinePrompts';

/* Reads the offline AI's report. A small model on a slow phone can stop at
   its length limit in the middle of the report, so a cut off report is
   closed where it stopped and anything missing gets a safe default (see a
   vet) instead of the whole diagnosis failing. */
export function parseReport(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) throw new Error('The offline AI did not write a report. Please try again.');
  const body = s.slice(start);
  let data;
  let cut = false;
  try {
    data = JSON.parse(body.slice(0, body.lastIndexOf('}') + 1));
  } catch {
    data = salvage(body);
    cut = true;
  }
  const out = tidyDeep(withDefaults(data, DIAGNOSIS_SCHEMA));
  if (cut) out.data_gaps = [...out.data_gaps, 'The offline report was cut short on this phone: check it again with the online AI.'];
  return out;
}

/* Closes the cut off text; when it stopped somewhere that cannot simply be
   closed (inside a property name), steps back to the last complete item. */
function salvage(body) {
  try { return JSON.parse(closeJson(body)); } catch { /* step back */ }
  const commas = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === ',') commas.push(i);
  }
  for (let k = commas.length - 1; k >= 0 && k >= commas.length - 200; k--) {
    try { return JSON.parse(closeJson(body.slice(0, commas[k]))); } catch { /* further back */ }
  }
  throw new Error('The offline AI did not finish the report. Please try again.');
}

// Closes the strings, lists and objects left open where the text stopped.
function closeJson(s) {
  const open = [];
  let inString = false;
  let escaped = false;
  for (const c of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') open.push('}');
    else if (c === '[') open.push(']');
    else if (c === '}' || c === ']') open.pop();
  }
  let out = escaped ? s.slice(0, -1) : s;
  if (inString) out += '"';
  // A key with no value yet, or a trailing comma, is dropped.
  out = out.replace(/\s+$/, '').replace(/,?\s*"[^"]*"\s*:\s*$/, '').replace(/[,:]\s*$/, '');
  return out + open.reverse().join('');
}

const SAFE = { see_vet: true, urgency: 'soon', notifiable: false, risk: 'low', likelihood: 'medium', prescription_only: true };

function withDefaults(value, schema, key) {
  if (schema.type === 'object') {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    for (const [k, sub] of Object.entries(schema.properties)) out[k] = withDefaults(src[k], sub, k);
    return out;
  }
  if (schema.type === 'array') {
    // A list item cut off half way through is dropped rather than shown half empty.
    const items = Array.isArray(value) ? value : [];
    return items
      .filter((v) => (schema.items.type === 'object' ? v && typeof v === 'object' && Object.keys(v).length : v !== '' && v != null))
      .map((v) => withDefaults(v, schema.items))
      .slice(0, schema.maxItems || items.length);
  }
  if (schema.enum) return schema.enum.includes(value) ? value : (SAFE[key] || schema.enum[0]);
  if (schema.type === 'boolean') return typeof value === 'boolean' ? value : Boolean(SAFE[key]);
  return typeof value === 'string' ? value : '';
}

/* What the offline AI (src/ml/gemma) is given, read from the phone's own
   database: the same case facts and farm snapshot the server builds for the
   online AI (server/routes/aiRoutes.js), only smaller. */

const today = () => new Date().toISOString().slice(0, 10);

function ageOf(dob) {
  if (!dob) return undefined;
  const months = Math.floor((Date.now() - new Date(dob).getTime()) / (30.44 * 86400000));
  if (!Number.isFinite(months) || months < 0) return undefined;
  return months < 24 ? `${months} months` : `${Math.floor(months / 12)} years`;
}

const pick = (o, keys) => {
  const out = {};
  for (const k of keys) if (o && o[k] != null && o[k] !== '') out[k] = o[k];
  return out;
};

/* The case for one offline diagnosis. */
export async function diagnosisFacts(repo, { animal, record, symptoms, species, location }) {
  const same = (r) => animal && (r.animal_id === animal.id || (animal.tag_id && r.tag_id === animal.tag_id));
  const [health, breeding] = animal
    ? await Promise.all([repo.list('health_records', { order: 'check_date DESC' }), repo.list('breeding_records', { order: 'breeding_date DESC' })])
    : [[], []];
  return {
    farm: { location: location || undefined, today: today() },
    animal: animal
      ? { ...pick(animal, ['tag_id', 'name', 'species', 'breed', 'sex', 'health_status', 'district', 'notes']), age: ageOf(animal.date_of_birth) }
      : { species: species || undefined },
    record_being_diagnosed: record ? pick(record, ['tag_id', 'disease', 'treatment', 'medicine', 'vet_name', 'check_date', 'next_check_date', 'status', 'notes']) : undefined,
    symptoms_described_by_farmer: symptoms || undefined,
    health_history: (health || []).filter(same).filter((h) => !record || h.id !== record.id).slice(0, 8)
      .map((h) => pick(h, ['disease', 'treatment', 'medicine', 'check_date', 'status'])),
    breeding: (breeding || []).filter(same).slice(0, 3).map((b) => pick(b, ['pregnancy_status', 'breeding_date', 'expected_birth_date', 'birth_date']))
  };
}

/* A compact picture of the farm for offline questions (the online chat
   looks these up with tools). */
export async function farmSnapshot(repo) {
  const [animals, health, tasks] = await Promise.all([
    repo.list('animals', { order: 'tag_id ASC' }),
    repo.list('health_records', { order: 'check_date DESC' }),
    repo.list('tasks', { order: 'due_date ASC' })
  ]);
  const count = (rows, key) => rows.reduce((m, r) => { const k = r[key] || 'Unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const living = (animals || []).filter((a) => a.health_status !== 'Deceased');
  return {
    today: today(),
    herd: {
      total: living.length,
      by_species: count(living, 'species'),
      by_health_status: count(living, 'health_status'),
      not_healthy: living.filter((a) => a.health_status && a.health_status !== 'Healthy').slice(0, 20).map((a) => pick(a, ['tag_id', 'name', 'species', 'health_status']))
    },
    open_health_cases: (health || []).filter((h) => h.status && h.status !== 'Recovered').slice(0, 15).map((h) => pick(h, ['tag_id', 'disease', 'status', 'check_date', 'next_check_date', 'treatment'])),
    open_tasks: (tasks || []).filter((t) => t.status !== 'Completed').slice(0, 15).map((t) => ({ ...pick(t, ['title', 'due_date', 'priority', 'status']), overdue: Boolean(t.due_date && t.due_date < today()) }))
  };
}

/* The vetted first-response guide for the diseases the detector found. */
export function referenceFor(vision) {
  const labels = [...new Set(((vision && vision.detections) || []).map((d) => d.label))].filter((l) => l !== 'healthy');
  return labels.map(findDisease).filter(Boolean).map((d) => pick(d, ['label', 'title', 'notifiable', 'zoonotic', 'urgency', 'signs', 'do_now', 'see_vet']));
}

/* A small model can get basic facts wrong. When its most likely condition is
   the disease the detector found, the guide's facts win: whether it is
   notifiable and whether it passes to people. */
export function applyGuide(report, vision) {
  const top = ((vision && vision.detections) || []).filter((d) => d.label !== 'healthy').sort((a, b) => b.confidence - a.confidence)[0];
  const guide = top && findDisease(top.label);
  const first = report.likely_conditions && report.likely_conditions[0];
  if (!guide || !first) return report;
  const words = String(guide.title).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  const name = String(first.name || '').toLowerCase();
  if (!words.some((w) => name.includes(w)) && !name.includes(guide.label.replace(/_/g, ' '))) return report;
  const out = { ...report, notifiable: Boolean(guide.notifiable) || Boolean(report.notifiable) };
  if (guide.zoonotic === false) out.zoonotic = { ...(report.zoonotic || {}), risk: 'none' };
  return out;
}

/* A small model sometimes titles or sums up the report itself ("Animal
   health assessment report", "This report details...") instead of saying
   what is wrong. Those are replaced with its own findings: the likely
   condition and the first step, which are in the farmer's language. */
// "Report" or "assessment" in the app's languages.
const REPORT_WORD = /(?:report|assessment|rapport|évaluation|informe|evaluación|relatório|avaliação|bericht|bewertung|ripoti|tathmini|raporo|isuzuma|تقرير|报告|评估|रिपोर्ट|मूल्यांकन)/i;
// A summary that opens by talking about the report ("This report details...").
const opensWithReport = (text) => REPORT_WORD.test(String(text).split(/\s+/).slice(0, 4).join(' '));
// The names of the data the model was given, which it sometimes copies into the text.
const DATA_LABEL = /\s*\(?\b(?:vision_[a-z_]+|farm_records|reference_guide|animal_case|photo_screening|photos_attached|symptoms_described_by_farmer|health_history|record_being_diagnosed)\b\)?/g;
const withoutLabels = (v) => (typeof v === 'string' ? v.replace(DATA_LABEL, '').replace(/\s+([.,;:])/g, '$1').trim()
  : Array.isArray(v) ? v.map(withoutLabels)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withoutLabels(x)])) : v);

export function tidyReport(input) {
  const data = withoutLabels(input);
  const top = data.likely_conditions && data.likely_conditions[0];
  if (!top || !top.name) return data;
  const out = { ...data };
  if (!out.title || REPORT_WORD.test(out.title)) out.title = top.name;
  if (!out.summary || opensWithReport(out.summary)) {
    const first = (out.treatment_steps || [])[0];
    out.summary = [top.why || top.name, first].filter(Boolean).join(' ');
  }
  return out;
}

/* The offline report in the saved-report shape the report views use. */
export function offlineReport({ data, vision, thumbs, animal, symptoms, species, model }) {
  const report = { ...applyGuide(tidyReport(data), vision), photo_findings: '', disclaimer: VET_NOTICE, offline: { model } };
  if (vision) report.vision = vision;
  const now = new Date().toISOString();
  return {
    id: `offline-${Date.now()}`,
    kind: 'diagnosis',
    offline: true,
    title: report.title || 'Offline diagnosis',
    created_at: now,
    report,
    input: {
      tag_id: animal ? animal.tag_id : undefined,
      photos: thumbs && thumbs.length ? thumbs : undefined,
      case: {
        tag_id: animal ? animal.tag_id : undefined, name: animal ? animal.name : undefined,
        species: animal ? animal.species : species || undefined, breed: animal ? animal.breed : undefined,
        sex: animal ? animal.sex : undefined, age: animal ? ageOf(animal.date_of_birth) : undefined,
        reported_signs: symptoms || undefined, photo_count: thumbs ? thumbs.length : undefined
      }
    }
  };
}
