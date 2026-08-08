/* ============================================
   ANIMALS MODULE
   CRUD operations, search, filter, CSV I/O.
   ============================================ */

let allAnimals = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return;

  await loadAnimals(user.id);
  bindEvents();
});

/* ---------- Load Animals from Supabase ---------- */
async function loadAnimals(userId) {
  const { data, error } = await supabase
    .from('animals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    showToast('Failed to load animals: ' + error.message, 'error');
    return;
  }
  allAnimals = data || [];
  renderAnimals(allAnimals);
}

/* ---------- Render Animals Table ---------- */
function renderAnimals(list) {
  const tbody = document.getElementById('animalsTableBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="10">
        <div class="empty-state">
          <i class="fas fa-cow"></i>
          <h3>No animals found</h3>
          <p>Add a new animal or adjust your filters.</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(a => {
    /* Calculate age from date_of_birth */
    let age = '—';
    if (a.date_of_birth) {
      const diff = Date.now() - new Date(a.date_of_birth).getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days < 30) age = days + ' days';
      else if (days < 365) age = Math.floor(days / 30) + ' months';
      else age = (days / 365).toFixed(1) + ' years';
    }

    return `
      <tr>
        <td class="fw-600">${esc(a.tag_id)}</td>
        <td>${esc(a.name || '—')}</td>
        <td>${esc(a.species)}</td>
        <td>${esc(a.breed || '—')}</td>
        <td>${esc(a.sex || '—')}</td>
        <td>${age}</td>
        <td>${esc(a.location || '—')}</td>
        <td>${statusBadge(a.health_status)}</td>
        <td>${a.last_check_date ? new Date(a.last_check_date).toLocaleDateString() : '—'}</td>
        <td>
          <div class="table-actions">
            <button class="btn-icon" title="Edit" onclick="editAnimal('${a.id}')">
              <i class="fas fa-pen-to-square"></i>
            </button>
            <button class="btn-icon danger" title="Delete" onclick="confirmDeleteAnimal('${a.id}', '${esc(a.tag_id)}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

/* ---------- Bind Events ---------- */
function bindEvents() {
  /* Search input */
  const searchInput = document.getElementById('searchAnimals');
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  /* Species filter */
  const speciesFilter = document.getElementById('filterSpecies');
  if (speciesFilter) {
    speciesFilter.addEventListener('change', applyFilters);
  }

  /* Health status filter */
  const statusFilter = document.getElementById('filterStatus');
  if (statusFilter) {
    statusFilter.addEventListener('change', applyFilters);
  }

  /* Open add modal */
  const addBtn = document.getElementById('addAnimalBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => openAnimalModal());
  }

  /* Save button in modal */
  const saveBtn = document.getElementById('saveAnimalBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveAnimal);
  }

  /* CSV Import button */
  const csvImportBtn = document.getElementById('csvImportBtn');
  if (csvImportBtn) {
    csvImportBtn.addEventListener('click', () => openModal('csvImportModal'));
  }

  /* CSV file input change */
  const csvFileInput = document.getElementById('csvFileInput');
  if (csvFileInput) {
    csvFileInput.addEventListener('change', handleCSVImport);
  }

  /* CSV Export button */
  const csvExportBtn = document.getElementById('csvExportBtn');
  if (csvExportBtn) {
    csvExportBtn.addEventListener('click', exportAnimalsCSV);
  }

  /* Delete confirm button */
  const deleteConfirmBtn = document.getElementById('confirmDeleteBtn');
  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', deleteAnimal);
  }

  /* Populate species filter options from data */
  populateSpeciesFilter();
}

/* ---------- Apply Search & Filters ---------- */
function applyFilters() {
  const search = (document.getElementById('searchAnimals')?.value || '').toLowerCase();
  const species = document.getElementById('filterSpecies')?.value || '';
  const status = document.getElementById('filterStatus')?.value || '';

  const filtered = allAnimals.filter(a => {
    const matchSearch = !search ||
      (a.tag_id || '').toLowerCase().includes(search) ||
      (a.name || '').toLowerCase().includes(search) ||
      (a.species || '').toLowerCase().includes(search) ||
      (a.breed || '').toLowerCase().includes(search);
    const matchSpecies = !species || a.species === species;
    const matchStatus = !status || a.health_status === status;
    return matchSearch && matchSpecies && matchStatus;
  });

  renderAnimals(filtered);
}

/* ---------- Populate Species Filter ---------- */
function populateSpeciesFilter() {
  const select = document.getElementById('filterSpecies');
  if (!select) return;
  const species = [...new Set(allAnimals.map(a => a.species).filter(Boolean))];
  select.innerHTML = '<option value="">All Species</option>' +
    species.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
}

/* ---------- Open Add/Edit Modal ---------- */
let editingAnimalId = null;

function openAnimalModal(animal = null) {
  editingAnimalId = animal ? animal.id : null;
  const title = document.getElementById('animalModalTitle');
  title.textContent = animal ? 'Edit Animal' : 'Add New Animal';

  /* Fill form fields */
  const fields = ['tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth', 'location', 'health_status', 'notes'];
  fields.forEach(f => {
    const el = document.getElementById('animal_' + f);
    if (el) el.value = animal ? (animal[f] || '') : '';
  });

  /* Default health status */
  if (!animal) {
    const hs = document.getElementById('animal_health_status');
    if (hs) hs.value = 'Healthy';
  }

  openModal('animalModal');
}

/* ---------- Save Animal (Insert or Update) ---------- */
async function saveAnimal() {
  const fields = ['tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth', 'location', 'health_status', 'notes'];
  const data = {};
  fields.forEach(f => {
    const el = document.getElementById('animal_' + f);
    data[f] = el ? el.value.trim() : '';
  });

  /* Validation */
  if (!data.tag_id || !data.species) {
    showToast('Tag ID and Species are required.', 'error');
    return;
  }

  const user = await getCurrentUser();
  if (!user) return;

  if (editingAnimalId) {
    /* Update existing animal */
    const { error } = await supabase
      .from('animals')
      .update(data)
      .eq('id', editingAnimalId);
    if (error) {
      showToast('Update failed: ' + error.message, 'error');
      return;
    }
    showToast('Animal updated successfully.', 'success');
  } else {
    /* Insert new animal */
    data.user_id = user.id;
    const { error } = await supabase.from('animals').insert([data]);
    if (error) {
      showToast('Insert failed: ' + error.message, 'error');
      return;
    }
    showToast('Animal added successfully.', 'success');
  }

  closeModal('animalModal');
  await loadAnimals(user.id);
  populateSpeciesFilter();
}

/* ---------- Edit Animal ---------- */
async function editAnimal(id) {
  const { data, error } = await supabase.from('animals').select('*').eq('id', id).single();
  if (error || !data) {
    showToast('Could not load animal data.', 'error');
    return;
  }
  openAnimalModal(data);
}

/* ---------- Delete Animal ---------- */
let deletingAnimalId = null;

function confirmDeleteAnimal(id, tagId) {
  deletingAnimalId = id;
  const msg = document.getElementById('deleteMessage');
  if (msg) msg.textContent = `Are you sure you want to delete animal "${tagId}"? This action cannot be undone.`;
  openModal('deleteModal');
}

async function deleteAnimal() {
  if (!deletingAnimalId) return;
  const { error } = await supabase.from('animals').delete().eq('id', deletingAnimalId);
  if (error) {
    showToast('Delete failed: ' + error.message, 'error');
    return;
  }
  showToast('Animal deleted.', 'success');
  closeModal('deleteModal');
  deletingAnimalId = null;
  const user = await getCurrentUser();
  if (user) {
    await loadAnimals(user.id);
    populateSpeciesFilter();
  }
}

/* ---------- CSV Import ---------- */
function handleCSVImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const text = event.target.result;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        showToast('CSV file is empty or has invalid format.', 'error');
        return;
      }

      /* Expected columns: tag_id, name, species, breed, sex, date_of_birth, location, health_status, notes */
      const user = await getCurrentUser();
      if (!user) return;

      const records = rows.map(row => ({
        user_id: user.id,
        tag_id: row.tag_id || '',
        name: row.name || '',
        species: row.species || '',
        breed: row.breed || '',
        sex: row.sex || '',
        date_of_birth: row.date_of_birth || null,
        location: row.location || '',
        health_status: row.health_status || 'Healthy',
        notes: row.notes || ''
      }));

      const { error } = await supabase.from('animals').insert(records);
      if (error) {
        showToast('Import failed: ' + error.message, 'error');
        return;
      }

      showToast(`Successfully imported ${records.length} animals.`, 'success');
      closeModal('csvImportModal');
      await loadAnimals(user.id);
      populateSpeciesFilter();
    } catch (err) {
      showToast('Error parsing CSV: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  /* Reset input so same file can be re-selected */
  e.target.value = '';
}

/* ---------- CSV Export ---------- */
function exportAnimalsCSV() {
  if (allAnimals.length === 0) {
    showToast('No animals to export.', 'warning');
    return;
  }

  const headers = ['tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth', 'location', 'health_status', 'last_check_date', 'notes'];
  const csv = [headers.join(',')] + allAnimals.map(a =>
    headers.map(h => `"${(a[h] || '').toString().replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  downloadCSV(csv, 'animals_export.csv');
  showToast('Animals exported to CSV.', 'success');
}

/* ---------- CSV Parser ---------- */
function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

/* ---------- Download CSV Helper ---------- */
function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/* ---------- Modal Helpers ---------- */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('show');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('show');
}

/* ---------- Helpers (reuse from dashboard) ---------- */
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function statusBadge(status) {
  const map = {
    'Healthy': 'badge-green', 'Under Treatment': 'badge-orange',
    'Critical': 'badge-red', 'Pregnant': 'badge-purple',
    'Completed': 'badge-green', 'Pending': 'badge-orange',
    'Recovered': 'badge-green', 'Not Confirmed': 'badge-gray'
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${esc(status)}</span>`;
}