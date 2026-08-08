/* ============================================
   FEEDING RECORDS MODULE
   ============================================ */

let allFeedingRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return;
  await loadFeedingRecords(user.id);
  bindFeedingEvents();
});

async function loadFeedingRecords(userId) {
  const { data, error } = await supabase
    .from('feeding_records')
    .select('*')
    .eq('user_id', userId)
    .order('feeding_date', { ascending: false });
  if (error) { showToast('Failed to load feeding records.', 'error'); return; }
  allFeedingRecords = data || [];
  renderFeedingRecords(allFeedingRecords);
  checkLowStock();
}

function renderFeedingRecords(list) {
  const tbody = document.getElementById('feedingTableBody');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-wheat-awn"></i><h3>No feeding records</h3><p>Log your first feeding record.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(f => `
    <tr>
      <td class="fw-600">${esc(f.feed_type)}</td>
      <td>${f.quantity || '—'} ${esc(f.unit || '')}</td>
      <td>$${(f.cost || 0).toFixed(2)}</td>
      <td>${f.feeding_date ? new Date(f.feeding_date).toLocaleDateString() : '—'}</td>
      <td>${esc(f.animal_group || '—')}</td>
      <td>${esc(f.notes || '—')}</td>
      <td>
        <div class="table-actions">
          <button class="btn-icon" title="Edit" onclick="editFeedingRecord('${f.id}')"><i class="fas fa-pen-to-square"></i></button>
          <button class="btn-icon danger" title="Delete" onclick="confirmDeleteFeeding('${f.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

/* Check for low stock alerts based on recent feeding patterns */
function checkLowStock() {
  const alertBox = document.getElementById('lowStockAlerts');
  if (!alertBox) return;

  /* Group by feed type and sum recent quantities (last 30 days) */
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recent = allFeedingRecords.filter(f => new Date(f.feeding_date) >= thirtyDaysAgo);
  const feedGroups = {};
  recent.forEach(f => {
    if (!feedGroups[f.feed_type]) feedGroups[f.feed_type] = { totalQty: 0, count: 0 };
    feedGroups[f.feed_type].totalQty += f.quantity || 0;
    feedGroups[f.feed_type].count++;
  });

  /* If a feed type has been used but usage is declining, show alert */
  const alerts = [];
  Object.entries(feedGroups).forEach(([type, info]) => {
    if (info.count <= 2) {
      alerts.push(`<span class="badge badge-orange"><i class="fas fa-exclamation-triangle"></i> ${esc(type)} — low usage detected (${info.count} records in 30 days)</span>`);
    }
  });

  if (alerts.length === 0) {
    alertBox.innerHTML = '<span class="badge badge-green"><i class="fas fa-check"></i> All feed levels look normal</span>';
  } else {
    alertBox.innerHTML = alerts.join(' ');
  }
}

function bindFeedingEvents() {
  const addBtn = document.getElementById('addFeedingBtn');
  if (addBtn) addBtn.addEventListener('click', () => openFeedingModal());

  const saveBtn = document.getElementById('saveFeedingBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveFeedingRecord);

  const delBtn = document.getElementById('confirmDeleteFeedingBtn');
  if (delBtn) delBtn.addEventListener('click', deleteFeedingRecord);

  const searchInput = document.getElementById('searchFeeding');
  if (searchInput) searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    renderFeedingRecords(allFeedingRecords.filter(f =>
      (f.feed_type || '').toLowerCase().includes(q) ||
      (f.animal_group || '').toLowerCase().includes(q)
    ));
  });
}

let editingFeedingId = null;

function openFeedingModal(record = null) {
  editingFeedingId = record ? record.id : null;
  document.getElementById('feedingModalTitle').textContent = record ? 'Edit Feeding Record' : 'Add Feeding Record';
  ['feed_type','quantity','unit','cost','feeding_date','animal_group','notes'].forEach(f => {
    const el = document.getElementById('feeding_' + f);
    if (el) el.value = record ? (record[f] || '') : '';
  });
  if (!record) document.getElementById('feeding_unit').value = 'kg';
  openModal('feedingModal');
}

async function saveFeedingRecord() {
  const data = {};
  ['feed_type','quantity','unit','cost','feeding_date','animal_group','notes'].forEach(f => {
    const el = document.getElementById('feeding_' + f);
    data[f] = el ? (f === 'quantity' || f === 'cost' ? parseFloat(el.value) || 0 : el.value.trim()) : '';
  });
  if (!data.feed_type) { showToast('Feed type is required.', 'error'); return; }

  const user = await getCurrentUser();
  if (!user) return;

  if (editingFeedingId) {
    const { error } = await supabase.from('feeding_records').update(data).eq('id', editingFeedingId);
    if (error) { showToast('Update failed.', 'error'); return; }
    showToast('Feeding record updated.', 'success');
  } else {
    data.user_id = user.id;
    const { error } = await supabase.from('feeding_records').insert([data]);
    if (error) { showToast('Insert failed.', 'error'); return; }
    showToast('Feeding record added.', 'success');
  }
  closeModal('feedingModal');
  await loadFeedingRecords(user.id);
}

async function editFeedingRecord(id) {
  const { data } = await supabase.from('feeding_records').select('*').eq('id', id).single();
  if (data) openFeedingModal(data);
}

let deletingFeedingId = null;
function confirmDeleteFeeding(id) { deletingFeedingId = id; openModal('deleteFeedingModal'); }

async function deleteFeedingRecord() {
  if (!deletingFeedingId) return;
  const { error } = await supabase.from('feeding_records').delete().eq('id', deletingFeedingId);
  if (error) { showToast('Delete failed.', 'error'); return; }
  showToast('Feeding record deleted.', 'success');
  closeModal('deleteFeedingModal');
  deletingFeedingId = null;
  const user = await getCurrentUser();
  if (user) await loadFeedingRecords(user.id);
}

function openModal(id) { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }