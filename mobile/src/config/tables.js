/* Per-table screen config: form fields (drives src/components/RecordForm.js),
   list display (drives src/screens/RecordListScreen.js). Field/table labels
   are looked up at render time via i18next as `tables.<table>.fields.<key>` /
   `tables.<table>.label` / `tables.<table>.singular` (see src/i18n/locales/*.json)
   — this file only carries the canonical English `options` values (which stay
   in English for storage/filtering) plus an `i18nEnum` pointer telling the UI
   which `enums.*` namespace translates those values for display.
   district/latitude/longitude are deliberately absent from every fields[]
   list below — they're attached automatically from GPS on create
   (src/hooks/useGeoCapture.js), never a manual form field, matching the web
   app's convention. */

const SPECIES_OPTIONS = ['Cattle', 'Sheep', 'Goat', 'Pig', 'Poultry', 'Horse', 'Donkey', 'Rabbit', 'Other'];
const ANIMAL_HEALTH_STATUS = ['Healthy', 'Under Treatment', 'Critical', 'Deceased'];
const HEALTH_RECORD_STATUS = ['Under Treatment', 'Healthy', 'Critical', 'Recovered', 'Deceased'];
const PREGNANCY_STATUS = ['Not Confirmed', 'Pregnant', 'Not Pregnant', 'Delivered'];
const FEEDING_UNITS = ['kg', 'lbs', 'tons', 'bags'];
const PRODUCTION_TYPES = ['Milk', 'Eggs', 'Meat'];
const PRODUCTION_UNITS = ['liters', 'units', 'kg'];
const FINANCE_TYPES = ['Income', 'Expense'];
const FINANCE_CATEGORIES = ['Milk Sales', 'Egg Sales', 'Meat Sales', 'Animal Sales', 'Other Income', 'Feed', 'Veterinary', 'Medicine', 'Labor', 'Equipment', 'Maintenance', 'Transport', 'Other Expense'];
const TASK_PRIORITY = ['Low', 'Medium', 'High'];
const TASK_STATUS = ['Pending', 'In Progress', 'Completed'];

export const TABLES = {
  animals: {
    table: 'animals',
    icon: 'cow',
    fields: [
      { key: 'tag_id', type: 'text', required: true },
      { key: 'name', type: 'text' },
      { key: 'species', type: 'select', options: SPECIES_OPTIONS, i18nEnum: 'species', required: true },
      { key: 'breed', type: 'text' },
      { key: 'sex', type: 'select', options: ['Male', 'Female'], i18nEnum: 'sex' },
      { key: 'date_of_birth', type: 'date' },
      { key: 'location', type: 'text' },
      { key: 'health_status', type: 'select', options: ANIMAL_HEALTH_STATUS, i18nEnum: 'animalHealthStatus', default: 'Healthy' },
      { key: 'notes', type: 'textarea' },
    ],
    titleField: 'tag_id',
    subtitleFields: ['species', 'breed'],
    badgeField: { key: 'health_status', kind: 'status' },
    searchFields: ['tag_id', 'name', 'species', 'breed'],
    filters: [{ key: 'species', options: SPECIES_OPTIONS, i18nEnum: 'species' }, { key: 'health_status', options: ANIMAL_HEALTH_STATUS, i18nEnum: 'animalHealthStatus' }],
  },
  health_records: {
    table: 'health_records',
    icon: 'stethoscope',
    fields: [
      { key: 'tag_id', type: 'text', required: true },
      { key: 'disease', type: 'text' },
      { key: 'treatment', type: 'text' },
      { key: 'medicine', type: 'text' },
      { key: 'vet_name', type: 'text' },
      { key: 'check_date', type: 'date' },
      { key: 'next_check_date', type: 'date' },
      { key: 'status', type: 'select', options: HEALTH_RECORD_STATUS, i18nEnum: 'healthRecordStatus', default: 'Under Treatment' },
      { key: 'notes', type: 'textarea' },
    ],
    titleField: 'tag_id',
    subtitleFields: ['disease', 'treatment'],
    badgeField: { key: 'status', kind: 'status' },
    searchFields: ['tag_id', 'disease', 'treatment', 'vet_name'],
    filters: [{ key: 'status', options: HEALTH_RECORD_STATUS, i18nEnum: 'healthRecordStatus' }],
  },
  feeding_records: {
    table: 'feeding_records',
    icon: 'wheat-awn',
    fields: [
      { key: 'feed_type', type: 'text', required: true },
      { key: 'quantity', type: 'number' },
      { key: 'unit', type: 'select', options: FEEDING_UNITS, i18nEnum: 'feedingUnit', default: 'kg' },
      { key: 'cost', type: 'number' },
      { key: 'feeding_date', type: 'date' },
      { key: 'animal_group', type: 'text' },
      { key: 'notes', type: 'textarea' },
    ],
    titleField: 'feed_type',
    subtitleFields: ['animal_group'],
    searchFields: ['feed_type', 'animal_group'],
    filters: [],
  },
  breeding_records: {
    table: 'breeding_records',
    icon: 'venus-mars',
    fields: [
      { key: 'tag_id', type: 'text', required: true },
      { key: 'breeding_date', type: 'date' },
      { key: 'pregnancy_status', type: 'select', options: PREGNANCY_STATUS, i18nEnum: 'pregnancyStatus', default: 'Not Confirmed' },
      { key: 'expected_birth_date', type: 'date' },
      { key: 'birth_date', type: 'date' },
      { key: 'newborn_count', type: 'number' },
      { key: 'newborn_details', type: 'textarea' },
      { key: 'notes', type: 'textarea' },
    ],
    titleField: 'tag_id',
    subtitleFields: ['breeding_date'],
    badgeField: { key: 'pregnancy_status', kind: 'pregnancy' },
    searchFields: ['tag_id'],
    filters: [{ key: 'pregnancy_status', options: PREGNANCY_STATUS, i18nEnum: 'pregnancyStatus' }],
  },
  production_records: {
    table: 'production_records',
    icon: 'gauge',
    fields: [
      { key: 'production_type', type: 'select', options: PRODUCTION_TYPES, i18nEnum: 'productionType', required: true, default: 'Milk' },
      { key: 'tag_id', type: 'text' },
      { key: 'quantity', type: 'number' },
      { key: 'unit', type: 'select', options: PRODUCTION_UNITS, i18nEnum: 'productionUnit', default: 'liters' },
      { key: 'production_date', type: 'date' },
      { key: 'notes', type: 'textarea' },
    ],
    titleField: 'production_type',
    subtitleFields: ['tag_id'],
    searchFields: ['tag_id', 'production_type'],
    filters: [{ key: 'production_type', options: PRODUCTION_TYPES, i18nEnum: 'productionType' }],
  },
  finance_records: {
    table: 'finance_records',
    icon: 'coins',
    fields: [
      { key: 'type', type: 'select', options: FINANCE_TYPES, i18nEnum: 'financeType', required: true, default: 'Income' },
      { key: 'amount', type: 'number', required: true },
      { key: 'category', type: 'select', options: FINANCE_CATEGORIES, i18nEnum: 'financeCategory' },
      { key: 'date', type: 'date' },
      { key: 'description', type: 'textarea' },
    ],
    titleField: 'category',
    subtitleFields: ['type'],
    searchFields: ['category', 'description'],
    filters: [{ key: 'type', options: FINANCE_TYPES, i18nEnum: 'financeType' }],
  },
  tasks: {
    table: 'tasks',
    icon: 'list-check',
    fields: [
      { key: 'title', type: 'text', required: true },
      { key: 'description', type: 'textarea' },
      { key: 'due_date', type: 'date' },
      { key: 'priority', type: 'select', options: TASK_PRIORITY, i18nEnum: 'taskPriority', default: 'Medium' },
      { key: 'status', type: 'select', options: TASK_STATUS, i18nEnum: 'taskStatus', default: 'Pending' },
    ],
    titleField: 'title',
    subtitleFields: ['due_date'],
    badgeField: { key: 'status', kind: 'status' },
    priorityField: 'priority',
    searchFields: ['title', 'description'],
    filters: [{ key: 'status', options: TASK_STATUS, i18nEnum: 'taskStatus' }],
  },
};

export const TABLE_KEYS = Object.keys(TABLES);
