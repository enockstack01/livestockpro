import { findDisease } from './diseases';
import { VET_NOTICE } from './offlinePrompts';

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

/* A 1B model can get basic facts wrong. When its most likely condition is
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

/* The offline report in the saved-report shape the report views use. */
export function offlineReport({ data, vision, thumbs, animal, symptoms, species, model }) {
  const report = { ...applyGuide(data, vision), photo_findings: '', disclaimer: VET_NOTICE, offline: { model } };
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
