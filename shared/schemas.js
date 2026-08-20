/* Mirror of server/routes/dataRoutes.js's SCHEMAS whitelist — the single
   source of truth for which fields exist per collection. The mobile app's
   local SQLite schema (mobile/src/db/schema.js) and sync engine key off this
   list directly instead of hardcoding it a second time. If the backend
   whitelist changes, update it here too (and vice versa) — there is no way
   to share this file with server/ at runtime (separate Node process), it's
   duplicated on purpose for the two JS runtimes (Metro/mobile, Vite/web)
   this package is bundled into; server/ stays the authority, this must match it. */

export const SCHEMAS = {
  profiles: ['farm_name', 'location', 'phone', 'avatar_url'],
  animals: ['tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth', 'location', 'district', 'latitude', 'longitude', 'health_status', 'last_check_date', 'notes'],
  health_records: ['animal_id', 'tag_id', 'disease', 'treatment', 'medicine', 'vet_name', 'check_date', 'next_check_date', 'status', 'district', 'latitude', 'longitude', 'notes'],
  feeding_records: ['feed_type', 'quantity', 'unit', 'cost', 'feeding_date', 'animal_group', 'district', 'latitude', 'longitude', 'notes'],
  breeding_records: ['animal_id', 'tag_id', 'breeding_date', 'pregnancy_status', 'expected_birth_date', 'birth_date', 'newborn_count', 'newborn_details', 'district', 'latitude', 'longitude', 'notes'],
  production_records: ['animal_id', 'tag_id', 'production_type', 'quantity', 'unit', 'production_date', 'district', 'latitude', 'longitude', 'notes'],
  finance_records: ['type', 'category', 'amount', 'date', 'description', 'district', 'latitude', 'longitude'],
  tasks: ['title', 'description', 'due_date', 'status', 'priority', 'district', 'latitude', 'longitude'],
};

/* Tables the offline sync engine mirrors locally and queues writes for.
   'profiles' is included (Settings screen); push_tokens is server-only
   (registered directly, never synced/cached) so it's deliberately excluded. */
export const SYNCED_TABLES = Object.keys(SCHEMAS);
