/* ============================================
   FINANCE RECORDS MODULE
   Income, expenses, profit/loss summary.
   ============================================ */

let allFinanceRecords = [];
let currentFinanceTab = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return;
  await loadFinanceRecords(user.id);
  bindFinanceEvents();
});

async function loadFinanceRecords(userId) {
  const { data, error } = await supabase
    .from('finance_records')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) { showToast('Failed to load finance records.', 'error'); return; }
  allFinanceRecords = data || [];
  renderFinanceSummary();
  renderFinanceTable();
}

function renderFinanceSummary() {
  const now = new Date();
  const thisMonth = allFinanceRecords.filter(f => {
    const d = new Date(f.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const totalIncome = thisMonth.filter(f => f.type === 'Income').reduce((s, f) => s + (f.amount || 0), 0);
  const totalExpense = thisMonth.filter(f => f.type === 'Expense').reduce((s, f) => s + (f.amount || 0), 0);
  const pl = totalIncome - totalExpense;

  const el = document.getElementById('financeSummaryCards');
  if (el) {
    el.innerHTML = `
      <div class="finance-card"><h4>Monthly Income</h4><div class="amount income">$${totalIncome.toLocaleString()}</div></div>
      <div class="finance-card"><h4>Monthly Expenses</h4><div class="amount expense">$${totalExpense.toLocaleString()}</div></div>
      <div class="finance-card"><h4>Profit / Loss</h4><div class="amount ${pl >= 0 ? 'profit' : 'loss'}">$${pl.toLocaleString()}</div></div>
    `;
  }
}

function renderFinanceTable() {
  const tbody = document.getElementById('financeTableBody');
  if (!tbody) return;

  let filtered = allFinanceRecords;
  if (currentFinanceTab === 'income') filtered = filtered.filter(f => f.type === 'Income');
  else if (currentFinanceTab === 'expense') filtered = filtered.filter(f => f.type === 'Expense');

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-receipt"></i><h3>No finance records</h3><p>Add an income or expense record.</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(f => `
    <tr>
      <td><span class="badge ${f.type === 'Income' ? 'badge-green' : 'badge-red'}">${f.type === 'Income' ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>'} ${esc(f.type)}</span></td>
      <td>${esc(f.category || '—')}</td>
      <td class="fw-600 ${f.type === 'Income' ? 'text-green' : 'text-red'}">${f.type === 'Income' ? '+' : '-'}$${(f.amount || 0).toLocaleString()}</td>
      <td>${f.date ? new Date(f.date).toLocaleDateString() : '—'}</td>
      <td>${esc((f.description || '').substring(0, 40))}${(f.description || '').length > 40 ? '...' : ''}</td>
      <td>
        <div class="table-actions">
          <button class="btn-icon" title="Edit" onclick="editFinanceRecord('${f.id}')"><i class="fas fa-pen-to-square"></i></button>
          <button class="btn-icon danger" title="Delete" onclick="confirmDeleteFinance('${f.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function bindFinanceEvents() {
  /* Tab switching */
  document.querySelectorAll('.fin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fin-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFinanceTab = btn.dataset.tab;
      renderFinanceTable();
    });
  });

  const addBtn = document.getElementById('addFinanceBtn');
  if (addBtn) addBtn.addEventListener('click', () => openFinanceModal());

  const saveBtn = document.getElementById('saveFinanceBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveFinanceRecord);

  const delBtn = document.getElementById('confirmDeleteFinanceBtn');
  if (delBtn) delBtn.addEventListener('click', deleteFinanceRecord);

  const searchInput = document.getElementById('searchFinance');
  if (searchInput) searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    let filtered = allFinanceRecords.filter(f =>
      (f.category || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q)
    );
    if (currentFinanceTab === 'income') filtered = filtered.filter(f => f.type === 'Income');
    else if (currentFinanceTab === 'expense') filtered = filtered.filter(f => f.type === 'Expense');
    /* Re-render with search */
    const tbody = document.getElementById('financeTableBody');
    if (!tbody || filtered.length === 0) { renderFinanceTable(); return; }
    tbody.innerHTML = filtered.map(f => `
      <tr>
        <td><span class="badge ${f.type === 'Income' ? 'badge-green' : 'badge-red'}">${esc(f.type)}</span></td>
        <td>${esc(f.category || '—')}</td>
        <td class="fw-600 ${f.type === 'Income' ? 'text-green' : 'text-red'}">${f.type === 'Income' ? '+' : '-'}$${(f.amount || 0).toLocaleString()}</td>
        <td>${f.date ? new Date(f.date).toLocaleDateString() : '—'}</td>
        <td>${esc((f.description || '').substring(0, 40))}</td>
        <td>
          <div class="table-actions">
            <button class="btn-icon" title="Edit" onclick="editFinanceRecord('${f.id}')"><i class="fas fa-pen-to-square"></i></button>
            <button class="btn-icon danger" title="Delete" onclick="confirmDeleteFinance('${f.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('');
  });

  const exportBtn = document.getElementById('exportFinanceCsv');
  if (exportBtn) exportBtn.addEventListener('click', () => {
    if (allFinanceRecords.length === 0) { showToast('No records to export.', 'warning'); return; }
    const headers = ['type','category','amount','date','description'];
    const csv = [headers.join(',')] + allFinanceRecords.map(f =>
      headers.map(c => `"${(f[c]||'').toString().replace(/"/g,'""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'finance_records_export.csv';
    link.click();
    showToast('Finance records exported.', 'success');
  });
}

let editingFinanceId = null;

function openFinanceModal(record = null) {
  editingFinanceId = record ? record.id : null;
  document.getElementById('financeModalTitle').textContent = record ? 'Edit Finance Record' : 'Add Finance Record';
  ['type','category','amount','date','description'].forEach(f => {
    const el = document.getElementById('finance_' + f);
    if (el) el.value = record ? (record[f] || '') : '';
  });
  if (!record) {
    document.getElementById('finance_type').value = 'Income';
    document.getElementById('finance_date').value = new Date().toISOString().split('T')[0];
  }
  openModal('financeModal');
}

async function saveFinanceRecord() {
  const data = {};
  ['type','category','date','description'].forEach(f => {
    const el = document.getElementById('finance_' + f);
    data[f] = el ? el.value.trim() : '';
  });
  data.amount = parseFloat(document.getElementById('finance_amount')?.value) || 0;
  if (data.amount <= 0) { showToast('Amount must be greater than 0.', 'error'); return; }
  if (!data.type) { showToast('Type is required.', 'error'); return; }

  const user = await getCurrentUser();
  if (!user) return;

  if (editingFinanceId) {
    const { error } = await supabase.from('finance_records').update(data).eq('id', editingFinanceId);
    if (error) { showToast('Update failed.', 'error'); return; }
    showToast('Finance record updated.', 'success');
  } else {
    data.user_id = user.id;
    const { error } = await supabase.from('finance_records').insert([data]);
    if (error) { showToast('Insert failed.', 'error'); return; }
    showToast('Finance record added.', 'success');
  }
  closeModal('financeModal');
  await loadFinanceRecords(user.id);
}

async function editFinanceRecord(id) {
  const { data } = await supabase.from('finance_records').select('*').eq('id', id).single();
  if (data) openFinanceModal(data);
}

let deletingFinanceId = null;
function confirmDeleteFinance(id) { deletingFinanceId = id; openModal('deleteFinanceModal'); }

async function deleteFinanceRecord() {
  if (!deletingFinanceId) return;
  const { error } = await supabase.from('finance_records').delete().eq('id', deletingFinanceId);
  if (error) { showToast('Delete failed.', 'error'); return; }
  showToast('Finance record deleted.', 'success');
  closeModal('deleteFinanceModal');
  deletingFinanceId = null;
  const user = await getCurrentUser();
  if (user) await loadFinanceRecords(user.id);
}

function openModal(id) { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }