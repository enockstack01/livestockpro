/* Per-table screen config: form fields (drives src/components/RecordForm.js),
   list display (drives src/screens/RecordListScreen.js), enums matching the
   web app's <select> options exactly (client/src/pages/*.jsx) so records
   created on either client look the same on both. district/latitude/longitude
   are deliberately absent from every fields[] list below — they're attached
   automatically from GPS on create (src/hooks/useGeoCapture.js), never a
   manual form field, matching the web app's convention. */

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
    label: 'Animals',
    singular: 'Animal',
    icon: 'paw',
    fields: [
      { key: 'tag_id', label: 'Tag ID', type: 'text', required: true },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'species', label: 'Species', type: 'select', options: SPECIES_OPTIONS, required: true },
      { key: 'breed', label: 'Breed', type: 'text' },
      { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'] },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'health_status', label: 'Health Status', type: 'select', options: ANIMAL_HEALTH_STATUS, default: 'Healthy' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    titleField: 'tag_id',
    subtitleFields: ['species', 'breed'],
    badgeField: { key: 'health_status', kind: 'status' },
    searchFields: ['tag_id', 'name', 'species', 'breed'],
    filters: [{ key: 'species', label: 'Species', options: SPECIES_OPTIONS }, { key: 'health_status', label: 'Health status', options: ANIMAL_HEALTH_STATUS }],
  },
  health_records: {
    table: 'health_records',
    label: 'Health',
    singular: 'Health Record',
    icon: 'medkit',
    fields: [
      { key: 'tag_id', label: 'Animal Tag ID', type: 'text', required: true },
      { key: 'disease', label: 'Disease / Condition', type: 'text' },
      { key: 'treatment', label: 'Treatment', type: 'text' },
      { key: 'medicine', label: 'Medicine', type: 'text' },
      { key: 'vet_name', label: 'Vet Name', type: 'text' },
      { key: 'check_date', label: 'Check Date', type: 'date' },
      { key: 'next_check_date', label: 'Next Check Date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: HEALTH_RECORD_STATUS, default: 'Under Treatment' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    titleField: 'tag_id',
    subtitleFields: ['disease', 'treatment'],
    badgeField: { key: 'status', kind: 'status' },
    searchFields: ['tag_id', 'disease', 'treatment', 'vet_name'],
    filters: [{ key: 'status', label: 'Status', options: HEALTH_RECORD_STATUS }],
  },
  feeding_records: {
    table: 'feeding_records',
    label: 'Feeding',
    singular: 'Feeding Record',
    icon: 'nutrition',
    fields: [
      { key: 'feed_type', label: 'Feed Type', type: 'text', required: true },
      { key: 'quantity', label: 'Quantity', type: 'number' },
      { key: 'unit', label: 'Unit', type: 'select', options: FEEDING_UNITS, default: 'kg' },
      { key: 'cost', label: 'Cost', type: 'number' },
      { key: 'feeding_date', label: 'Feeding Date', type: 'date' },
      { key: 'animal_group', label: 'Animal Group', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    titleField: 'feed_type',
    subtitleFields: ['animal_group'],
    searchFields: ['feed_type', 'animal_group'],
    filters: [],
  },
  breeding_records: {
    table: 'breeding_records',
    label: 'Breeding',
    singular: 'Breeding Record',
    icon: 'heart',
    fields: [
      { key: 'tag_id', label: 'Animal Tag ID', type: 'text', required: true },
      { key: 'breeding_date', label: 'Breeding Date', type: 'date' },
      { key: 'pregnancy_status', label: 'Pregnancy Status', type: 'select', options: PREGNANCY_STATUS, default: 'Not Confirmed' },
      { key: 'expected_birth_date', label: 'Expected Birth Date', type: 'date' },
      { key: 'birth_date', label: 'Birth Date', type: 'date' },
      { key: 'newborn_count', label: 'Newborn Count', type: 'number' },
      { key: 'newborn_details', label: 'Newborn Details', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    titleField: 'tag_id',
    subtitleFields: ['breeding_date'],
    badgeField: { key: 'pregnancy_status', kind: 'pregnancy' },
    searchFields: ['tag_id'],
    filters: [{ key: 'pregnancy_status', label: 'Status', options: PREGNANCY_STATUS }],
  },
  production_records: {
    table: 'production_records',
    label: 'Production',
    singular: 'Production Record',
    icon: 'stats-chart',
    fields: [
      { key: 'production_type', label: 'Type', type: 'select', options: PRODUCTION_TYPES, required: true, default: 'Milk' },
      { key: 'tag_id', label: 'Animal Tag ID', type: 'text' },
      { key: 'quantity', label: 'Quantity', type: 'number' },
      { key: 'unit', label: 'Unit', type: 'select', options: PRODUCTION_UNITS, default: 'liters' },
      { key: 'production_date', label: 'Production Date', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    titleField: 'production_type',
    subtitleFields: ['tag_id'],
    searchFields: ['tag_id', 'production_type'],
    filters: [{ key: 'production_type', label: 'Type', options: PRODUCTION_TYPES }],
  },
  finance_records: {
    table: 'finance_records',
    label: 'Finance',
    singular: 'Finance Record',
    icon: 'cash',
    fields: [
      { key: 'type', label: 'Type', type: 'select', options: FINANCE_TYPES, required: true, default: 'Income' },
      { key: 'amount', label: 'Amount', type: 'number', required: true },
      { key: 'category', label: 'Category', type: 'select', options: FINANCE_CATEGORIES },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    titleField: 'category',
    subtitleFields: ['type'],
    searchFields: ['category', 'description'],
    filters: [{ key: 'type', label: 'Type', options: FINANCE_TYPES }],
  },
  tasks: {
    table: 'tasks',
    label: 'Tasks',
    singular: 'Task',
    icon: 'checkbox',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'due_date', label: 'Due Date', type: 'date' },
      { key: 'priority', label: 'Priority', type: 'select', options: TASK_PRIORITY, default: 'Medium' },
      { key: 'status', label: 'Status', type: 'select', options: TASK_STATUS, default: 'Pending' },
    ],
    titleField: 'title',
    subtitleFields: ['due_date'],
    badgeField: { key: 'status', kind: 'status' },
    priorityField: 'priority',
    searchFields: ['title', 'description'],
    filters: [{ key: 'status', label: 'Status', options: TASK_STATUS }],
  },
};

export const TABLE_KEYS = Object.keys(TABLES);
