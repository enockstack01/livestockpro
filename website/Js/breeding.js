/* ============================================
   BREEDING RECORDS MODULE
   ============================================ */

let allBreedingRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return;
  await loadBreedingRecords(user.id);
  bindBreedingEvents();
});

async function loadBreedingRecords(userId) {
  const { data, error } = await supabase
    .from('breeding_records')
    .select('*')
    .eq('user_id', userId)
    .order('breeding_date', { ascending: false });
  if (error) { showToast('Failed to load breeding records.', 'error'); return; }
  allBreedingRecords = data || [];
  renderBreedingRecords(allBreedingRecords);
}

function renderBreedingRecords(list) {
  const tbody = document.getElementById('breedingTableBody');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fas fa-venus-mars"></i><h3>No breeding records</h3><p>Track your breeding program here.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(b => `
    <tr>
      <td class="fw-600">${esc(b.tag_id || '—')}</td>
      <td>${b.breeding_date ? new Date(b.breeding_date).toLocaleDateString() : '—'}</td>
      <td>${pregnancyBadge(b.pregnancy_status)}</td>
      <td>${b.expected_birth_date ? new Date(b.expected_birth_date).toLocaleDateString() : '—'}</td>
      <td>${b.birth_date ? new Date(b.birth_date).toLocaleDateString() : '—'}</td>
      <td>${b.newborn_count || '—'}</td>
      <td>${esc((b.newborn_details || '').substring(0, 40))}${(b.newborn_details || '').length > 40 ? '...' : ''}</td>
      <td>
        <div class="table-actions">
          <button class="btn-icon" title="Edit" onclick="editBreedingRecord('${b.id}')"><i class="fas fa-pen-to-square"></i></button>
          <button class="btn-icon danger" title="Delete" onclick="confirmDeleteBreeding('${b.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function bindBreedingEvents() {
  const addBtn = document.getElementById('addBreedingBtn');
  if (addBtn) addBtn.addEventListener('click', () => openBreedingModal());

  const saveBtn = document.getElementById('saveBreedingBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveBreedingRecord);

  const delBtn = document.getElementById('confirmDeleteBreedingBtn');
  if (delBtn) delBtn.addEventListener('click', deleteBreedingRecord);

  const searchInput = document.getElementById('searchBreeding');
  if (searchInput) searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    renderBreedingRecords(allBreedingRecords.filter(b =>
      (b.tag_id || '').toLowerCase().includes(q) ||
      (b.pregnancy_status || '').toLowerCase().includes(q)
    ));
  });

  const filterStatus = document.getElementById('filterPregnancy');
  if (filterStatus) filterStatus.addEventListener('change', () => {
    const v = filterStatus.value;
    renderBreedingRecords(v ? allBreedingRecords.filter(b => b.pregnancy_status === v) : allBreedingRecords);
  });
}

let editingBreedingId = null;

function openBreedingModal(record = null) {
  editingBreedingId = record ? record.id : null;
  document.getElementById('breedingModalTitle').textContent = record ? 'Edit Breeding Record' : 'Add Breeding Record';
  ['tag_id','breeding_date','pregnancy_status','expected_birth_date','birth_date','newborn_count','newborn_details','notes'].forEach(f => {
    const el = document.getElementById('breeding_' + f);
    if (el) el.value = record ? (record[f] || '') : '';
  });
  if (!record) document.getElementById('breeding_pregnancy_status').value = 'Not Confirmed';
  openModal('breedingModal');
}

async function saveBreedingRecord() {
  const data = {};
  ['tag_id','breeding_date','pregnancy_status','expected_birth_date','birth_date','newborn_details','notes'].forEach(f => {
    const el = document.getElementById('breeding_' + f);
    data[f] = el ? el.value.trim() : '';
  });
  data.newborn_count = parseInt(document.getElementById('breeding_newborn_count')?.value) || 0;

  if (!data.tag_id) { showToast('Tag ID is required.', 'error'); return; }

  const user = await getCurrentUser();
  if (!user) return;

  if (editingBreedingId) {
    const { error } = await supabase.from('breeding_records').update(data).eq('id', editingBreedingId);
    if (error) { showToast('Update failed.', 'error'); return; }
    showToast('Breeding record updated.', 'success');
  } else {
    data.user_id = user.id;
    const { error } = await supabase.from('breeding_records').insert([data]);
    if (error) { showToast('Insert failed.', 'error'); return; }
    showToast('Breeding record added.', 'success');
  }
  closeModal('breedingModal');
  await loadBreedingRecords(user.id);
}

async function editBreedingRecord(id) {
  const { data } = await supabase.from('breeding_records').select('*').eq('id', id).single();
  if (data) openBreedingModal(data);
}

let deletingBreedingId = null;
function confirmDeleteBreeding(id) { deletingBreedingId = id; openModal('deleteBreedingModal'); }

async function deleteBreedingRecord() {
  if (!deletingBreedingId) return;
  const { error } = await supabase.from('breeding_records').delete().eq('id', deletingBreedingId);
  if (error) { showToast('Delete failed.', 'error'); return; }
  showToast('Breeding record deleted.', 'success');
  closeModal('deleteBreedingModal');
  deletingBreedingId = null;
  const user = await getCurrentUser();
  if (user) await loadBreedingRecords(user.id);
}

function openModal(id) { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function pregnancyBadge(s) {
  const m = { 'Pregnant':'badge-purple', 'Not Confirmed':'badge-gray', 'Not Pregnant':'badge-orange', 'Delivered':'badge-green' };
  return `<span class="badge ${m[s]||'badge-gray'}">${esc(s)}</span>`;
}