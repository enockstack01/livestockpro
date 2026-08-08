/* ============================================
   PRODUCTION RECORDS MODULE
   Milk, eggs, meat weight gain tracking.
   ============================================ */

let allProductionRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return;
  await loadProductionRecords(user.id);
  bindProductionEvents();
});

async function loadProductionRecords(userId) {
  const { data, error } = await supabase
    .from('production_records')
    .select('*')
    .eq('user_id', userId)
    .order('production_date', { ascending: false });
  if (error) { showToast('Failed to load production records.', 'error'); return; }
  allProductionRecords = data || [];
  renderProductionRecords(allProductionRecords);
  renderProductionSummary();
}

function renderProductionRecords(list) {
  const tbody = document.getElementById('productionTableBody');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-gauge-high"></i><h3>No production records</h3><p>Start tracking your production output.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => {
    const typeIcon = { 'Milk': 'fa-glass-water', 'Eggs': 'fa-egg', 'Meat': 'fa-drumstick-bite' };
    return `
      <tr>
        <td><span class="badge ${p.production_type === 'Milk' ? 'badge-blue' : p.production_type === 'Eggs' ? 'badge-orange' : 'badge-green'}"><i class="fas ${typeIcon[p.production_type] || 'fa-box'}"></i> ${esc(p.production_type)}</span></td>
        <td>${esc(p.tag_id || '—')}</td>
        <td class="fw-600">${p.quantity || 0} ${esc(p.unit || '')}</td>
        <td>${p.production_date ? new Date(p.production_date).toLocaleDateString() : '—'}</td>
        <td>${esc((p.notes || '').substring(0, 35))}${(p.notes || '').length > 35 ? '...' : ''}</td>
        <td>
          <div class="table-actions">
            <button class="btn-icon" title="Edit" onclick="editProductionRecord('${p.id}')"><i class="fas fa-pen-to-square"></i></button>
            <button class="btn-icon danger" title="Delete" onclick="confirmDeleteProduction('${p.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderProductionSummary() {
  const summaryEl = document.getElementById('productionSummary');
  if (!summaryEl) return;

  const now = new Date();
  const thisMonth = allProductionRecords.filter(p => {
    const d = new Date(p.production_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const milk = thisMonth.filter(p => p.production_type === 'Milk').reduce((s, p) => s + (p.quantity || 0), 0);
  const eggs = thisMonth.filter(p => p.production_type === 'Eggs').reduce((s, p) => s + (p.quantity || 0), 0);
  const meat = thisMonth.filter(p => p.production_type === 'Meat').reduce((s, p) => s + (p.quantity || 0), 0);

  summaryEl.innerHTML = `
    <div class="finance-card"><h4>Milk (This Month)</h4><div class="amount income">${milk.toFixed(1)} L</div></div>
    <div class="finance-card"><h4>Eggs (This Month)</h4><div class="amount" style="color:var(--orange)">${eggs} units</div></div>
    <div class="finance-card"><h4>Meat (This Month)</h4><div class="amount" style="color:var(--primary)">${meat.toFixed(1)} kg</div></div>
  `;
}

function bindProductionEvents() {
  const addBtn = document.getElementById('addProductionBtn');
  if (addBtn) addBtn.addEventListener('click', () => openProductionModal());

  const saveBtn = document.getElementById('saveProductionBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveProductionRecord);

  const delBtn = document.getElementById('confirmDeleteProductionBtn');
  if (delBtn) delBtn.addEventListener('click', deleteProductionRecord);

  const searchInput = document.getElementById('searchProduction');
  if (searchInput) searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    renderProductionRecords(allProductionRecords.filter(p =>
      (p.tag_id || '').toLowerCase().includes(q) ||
      (p.production_type || '').toLowerCase().includes(q)
    ));
  });

  const filterType = document.getElementById('filterProductionType');
  if (filterType) filterType.addEventListener('change', () => {
    const v = filterType.value;
    renderProductionRecords(v ? allProductionRecords.filter(p => p.production_type === v) : allProductionRecords);
  });

  const exportBtn = document.getElementById('exportProductionCsv');
  if (exportBtn) exportBtn.addEventListener('click', () => {
    if (allProductionRecords.length === 0) { showToast('No records to export.', 'warning'); return; }
    const headers = ['tag_id','production_type','quantity','unit','production_date','notes'];
    const csv = [headers.join(',')] + allProductionRecords.map(p =>
      headers.map(c => `"${(p[c]||'').toString().replace(/"/g,'""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'production_records_export.csv';
    link.click();
    showToast('Production records exported.', 'success');
  });

  /* Change unit when production type changes */
  const typeSelect = document.getElementById('production_production_type');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      const unitMap = { 'Milk': 'liters', 'Eggs': 'units', 'Meat': 'kg' };
      const unitEl = document.getElementById('production_unit');
      if (unitEl) unitEl.value = unitMap[typeSelect.value] || 'units';
    });
  }
}

let editingProductionId = null;

function openProductionModal(record = null) {
  editingProductionId = record ? record.id : null;
  document.getElementById('productionModalTitle').textContent = record ? 'Edit Production Record' : 'Add Production Record';
  ['tag_id','production_type','quantity','unit','production_date','notes'].forEach(f => {
    const el = document.getElementById('production_' + f);
    if (el) el.value = record ? (record[f] || '') : '';
  });
  if (!record) {
    document.getElementById('production_production_type').value = 'Milk';
    document.getElementById('production_unit').value = 'liters';
  }
  openModal('productionModal');
}

async function saveProductionRecord() {
  const data = {};
  ['tag_id','production_type','unit','production_date','notes'].forEach(f => {
    const el = document.getElementById('production_' + f);
    data[f] = el ? el.value.trim() : '';
  });
  data.quantity = parseFloat(document.getElementById('production_quantity')?.value) || 0;
  if (!data.production_type) { showToast('Production type is required.', 'error'); return; }

  const user = await getCurrentUser();
  if (!user) return;

  if (editingProductionId) {
    const { error } = await supabase.from('production_records').update(data).eq('id', editingProductionId);
    if (error) { showToast('Update failed.', 'error'); return; }
    showToast('Production record updated.', 'success');
  } else {
    data.user_id = user.id;
    const { error } = await supabase.from('production_records').insert([data]);
    if (error) { showToast('Insert failed.', 'error'); return; }
    showToast('Production record added.', 'success');
  }
  closeModal('productionModal');
  await loadProductionRecords(user.id);
}

async function editProductionRecord(id) {
  const { data } = await supabase.from('production_records').select('*').eq('id', id).single();
  if (data) openProductionModal(data);
}

let deletingProductionId = null;
function confirmDeleteProduction(id) { deletingProductionId = id; openModal('deleteProductionModal'); }

async function deleteProductionRecord() {
  if (!deletingProductionId) return;
  const { error } = await supabase.from('production_records').delete().eq('id', deletingProductionId);
  if (error) { showToast('Delete failed.', 'error'); return; }
  showToast('Production record deleted.', 'success');
  closeModal('deleteProductionModal');
  deletingProductionId = null;
  const user = await getCurrentUser();
  if (user) await loadProductionRecords(user.id);
}

function openModal(id) { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }