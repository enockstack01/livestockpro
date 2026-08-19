/*
 * Seeds a small, deliberately illustrative dataset for the One Health dashboard —
 * not just "some data", but examples chosen to show what the detector currently
 * catches and where it currently misses, so the picture it gives is honest.
 *
 * Everything inserted here is tagged `seed: true` and lives under synthetic
 * user_ids (seed-oh-farm-*) with their own `profiles` entries — it never touches
 * a real account's own records. Safe to re-run: it clears its own previous rows
 * first, so running twice does not create duplicates.
 *
 * Usage: npm run seed:onehealth
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Add it to your .env file.');
  process.exit(1);
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const FARMS = [
  { userId: 'seed-oh-farm-musanze-1', farmName: 'Musanze Highland Dairy', location: 'Musanze', district: 'Musanze', lat: -1.4998, lng: 29.6344 },
  { userId: 'seed-oh-farm-musanze-2', farmName: 'Twin Lakes Cattle Co-op', location: 'Musanze', district: 'Musanze', lat: -1.5011, lng: 29.6301 },
  { userId: 'seed-oh-farm-musanze-3', farmName: 'Ruhengeri Family Farm', location: 'Musanze', district: 'Musanze', lat: -1.4980, lng: 29.6389 },
  { userId: 'seed-oh-farm-nyagatare-1', farmName: 'Nyagatare Ranch', location: 'Nyagatare', district: 'Nyagatare', lat: -1.2929, lng: 30.3253 },
  { userId: 'seed-oh-farm-nyagatare-2', farmName: 'Akagera Poultry Estate', location: 'Nyagatare', district: 'Nyagatare', lat: -1.2871, lng: 30.3198 },
  { userId: 'seed-oh-farm-huye-1', farmName: 'Huye Mixed Farm', location: 'Huye', district: 'Huye', lat: -2.5967, lng: 29.7392 },
  { userId: 'seed-oh-farm-huye-2', farmName: 'Butare Goat Collective', location: 'Huye', district: 'Huye', lat: -2.6034, lng: 29.7418 }
];

function farm(userId) {
  return FARMS.find((f) => f.userId === userId);
}

function makeAnimal(userId, tagId, species, breed, healthStatus, lastCheckDaysAgo) {
  const f = farm(userId);
  return {
    _id: crypto.randomUUID(),
    user_id: userId,
    tag_id: tagId,
    name: tagId,
    species,
    breed,
    sex: Math.random() > 0.5 ? 'Female' : 'Male',
    date_of_birth: '2022-03-01',
    location: f.location,
    district: f.district,
    latitude: f.lat,
    longitude: f.lng,
    health_status: healthStatus,
    last_check_date: isoDaysAgo(lastCheckDaysAgo),
    notes: '',
    created_at: new Date().toISOString(),
    seed: true
  };
}

function makeRecord(userId, tagId, disease, status, checkDaysAgo, notes) {
  const f = farm(userId);
  return {
    _id: crypto.randomUUID(),
    user_id: userId,
    animal_id: tagId,
    tag_id: tagId,
    disease,
    treatment: '',
    medicine: '',
    vet_name: 'Dr. Uwase',
    check_date: isoDaysAgo(checkDaysAgo),
    next_check_date: isoDaysAgo(checkDaysAgo - 14),
    status,
    district: f.district,
    latitude: f.lat,
    longitude: f.lng,
    notes: notes || '',
    created_at: new Date().toISOString(),
    seed: true
  };
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'livestock');

  console.log('Clearing previous seed data...');
  const cleared = await Promise.all([
    db.collection('profiles').deleteMany({ seed: true }),
    db.collection('animals').deleteMany({ seed: true }),
    db.collection('health_records').deleteMany({ seed: true })
  ]);
  console.log(`  removed ${cleared[0].deletedCount} profiles, ${cleared[1].deletedCount} animals, ${cleared[2].deletedCount} health records`);

  const profiles = FARMS.map((f) => ({
    _id: crypto.randomUUID(),
    user_id: f.userId,
    farm_name: f.farmName,
    location: f.location,
    phone: '',
    avatar_url: '',
    created_at: new Date().toISOString(),
    seed: true
  }));

  const animals = [
    makeAnimal('seed-oh-farm-musanze-1', 'MZ1-001', 'Cattle', 'Ankole', 'Under Treatment', 3),
    makeAnimal('seed-oh-farm-musanze-1', 'MZ1-002', 'Cattle', 'Friesian', 'Healthy', 10),
    makeAnimal('seed-oh-farm-musanze-2', 'MZ2-001', 'Cattle', 'Ankole', 'Under Treatment', 5),
    makeAnimal('seed-oh-farm-musanze-2', 'MZ2-002', 'Goat', 'Boer', 'Healthy', 8),
    makeAnimal('seed-oh-farm-musanze-3', 'MZ3-001', 'Cattle', 'Friesian', 'Under Treatment', 2),
    makeAnimal('seed-oh-farm-nyagatare-1', 'NY1-001', 'Cattle', 'Ankole', 'Critical', 1),
    makeAnimal('seed-oh-farm-nyagatare-1', 'NY1-002', 'Cattle', 'Ankole', 'Critical', 2),
    makeAnimal('seed-oh-farm-nyagatare-1', 'NY1-003', 'Cattle', 'Friesian', 'Critical', 3),
    makeAnimal('seed-oh-farm-nyagatare-1', 'NY1-004', 'Cattle', 'Ankole', 'Healthy', 20),
    makeAnimal('seed-oh-farm-nyagatare-2', 'NY2-001', 'Poultry', 'Layer', 'Critical', 2),
    makeAnimal('seed-oh-farm-nyagatare-2', 'NY2-002', 'Poultry', 'Layer', 'Deceased', 1),
    makeAnimal('seed-oh-farm-nyagatare-2', 'NY2-003', 'Poultry', 'Layer', 'Deceased', 2),
    makeAnimal('seed-oh-farm-nyagatare-2', 'NY2-004', 'Poultry', 'Layer', 'Healthy', 15),
    makeAnimal('seed-oh-farm-huye-1', 'HY1-001', 'Sheep', 'Local', 'Healthy', 12),
    makeAnimal('seed-oh-farm-huye-1', 'HY1-002', 'Cattle', 'Ankole', 'Under Treatment', 6),
    makeAnimal('seed-oh-farm-huye-2', 'HY2-001', 'Goat', 'Boer', 'Under Treatment', 9),
    makeAnimal('seed-oh-farm-huye-2', 'HY2-002', 'Goat', 'Local', 'Healthy', 18)
  ];

  const records = [
    /* ── A) Cross-farm outbreak cluster — no named disease, catches an
       emerging pattern purely from 3 farms in one district reporting the
       same unusual symptom text within 14 days. This is the detector's
       strongest capability: it does not need to know what the disease is. */
    makeRecord('seed-oh-farm-musanze-1', 'MZ1-001', 'Sudden high fever and lameness', 'Under Treatment', 3,
      'Onset within 24 hours, refusing feed.'),
    makeRecord('seed-oh-farm-musanze-2', 'MZ2-001', 'Sudden high fever and lameness', 'Under Treatment', 5,
      'Similar presentation to neighbouring farm.'),
    makeRecord('seed-oh-farm-musanze-3', 'MZ3-001', 'Sudden high fever and lameness', 'Under Treatment', 2,
      'Third case in the area this week.'),

    /* ── B) Named watchlist diseases — isolated, single-farm, correctly
       matched by keyword and flagged zoonotic where relevant. */
    makeRecord('seed-oh-farm-nyagatare-2', 'NY2-001', 'Suspected Avian Influenza (H5N1) in layer flock', 'Critical', 2,
      'Sudden drop in egg production, several birds found dead overnight.'),
    makeRecord('seed-oh-farm-huye-2', 'HY2-001', 'Brucellosis confirmed by lab test', 'Under Treatment', 9,
      'Positive serology, isolated from herd.'),

    /* ── C) Critical-status cluster at one farm — animals seriously unwell
       but not (yet, or not confirmed) deceased. */
    makeRecord('seed-oh-farm-nyagatare-1', 'NY1-001', 'Unexplained weight loss and weakness', 'Critical', 1, ''),
    makeRecord('seed-oh-farm-nyagatare-1', 'NY1-002', 'Loss of appetite and high fever', 'Critical', 2, ''),
    makeRecord('seed-oh-farm-nyagatare-1', 'NY1-003', 'Severe lethargy, not responding to treatment', 'Critical', 3, ''),

    /* ── D) Colloquial terminology — "mad dog disease" is a real informal
       name for rabies, now on the Rabies watchlist entry alongside the
       clinical term, and "suspected" in the text tags it with 'suspected'
       confidence rather than 'confirmed'. */
    makeRecord('seed-oh-farm-huye-1', 'HY1-002', 'Mad dog disease suspected after erratic behaviour', 'Under Treatment', 6,
      'Animal became aggressive and disoriented; bitten by a stray dog 3 weeks ago.'),

    /* ── E) Preventive vaccination, correctly NOT flagged — mentions "FMD"
       but only in a routine booster context with no confirming/suspecting
       language and a Healthy status, so the preventive-only guard excludes
       it from the watchlist match. */
    makeRecord('seed-oh-farm-musanze-2', 'MZ2-002', 'Annual FMD vaccination — booster dose', 'Healthy', 4,
      'Routine preventive vaccination, animal shows no symptoms.'),

    /* ── F) Ordinary, healthy records — correctly generate no alert at all. */
    makeRecord('seed-oh-farm-musanze-1', 'MZ1-002', 'Routine check-up', 'Healthy', 10, 'No concerns.'),
    makeRecord('seed-oh-farm-nyagatare-1', 'NY1-004', 'Routine deworming', 'Healthy', 20, ''),
    makeRecord('seed-oh-farm-nyagatare-2', 'NY2-004', 'Routine check-up', 'Healthy', 15, ''),
    makeRecord('seed-oh-farm-huye-1', 'HY1-001', 'Routine check-up', 'Healthy', 12, ''),
    makeRecord('seed-oh-farm-huye-2', 'HY2-002', 'Routine vaccination — Newcastle', 'Recovered', 18, 'Preventive, no active disease.'),

    /* ── G) Mortality cluster — two genuine deaths (Deceased status, matching
       the two animals above) at the same poultry farm within a week,
       reinforcing the suspected Avian Influenza case above with an actual
       mortality signal rather than only a Critical-status proxy. */
    makeRecord('seed-oh-farm-nyagatare-2', 'NY2-002', 'Sudden death, suspected Avian Influenza', 'Deceased', 1,
      'Found dead in coop, no prior signs of illness.'),
    makeRecord('seed-oh-farm-nyagatare-2', 'NY2-003', 'Sudden death, suspected Avian Influenza', 'Deceased', 2,
      'Second bird found dead this week.')
  ];

  await db.collection('profiles').insertMany(profiles);
  await db.collection('animals').insertMany(animals);
  await db.collection('health_records').insertMany(records);

  console.log(`Inserted ${profiles.length} farm profiles, ${animals.length} animals, ${records.length} health records.`);
  console.log('\nExpect the One Health dashboard to show:');
  console.log('  - 1 outbreak cluster alert    ("Sudden high fever and lameness" — Musanze, 3 farms)');
  console.log('  - 3 watchlist alerts          (Avian Influenza — suspected, Nyagatare; Brucellosis — confirmed, Huye; Rabies — suspected via "mad dog disease", Huye)');
  console.log('  - 1 mortality cluster alert   (Akagera Poultry Estate — 2 deaths in 7 days)');
  console.log('  - 1 critical cluster alert    (Nyagatare Ranch — 3 Critical records in 7 days)');
  console.log('  - 2 correctly-quiet records   (FMD and Newcastle vaccination mentions — preventive-only guard keeps these from alerting)');

  await client.close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
