/* ============================================
   HEALTH RECORDS MODULE
   ============================================ */

var allHealthRecords = [];

document.addEventListener('DOMContentLoaded', async function() {

  /* Step 1: Verify Supabase is connected */
  var statusEl = document.getElementById('pageStatus');
  if (typeof supabase === 'undefined' || !supabase || !supabase.auth) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.background = '#FFEBEE';
      statusEl.style.color = 'var(--red)';
      statusEl.innerHTML = '<i class="fas fa-xmark-circle"></i> Supabase not loaded. Check console. You must use a local server, not file://';
    }
    console.error('HEALTH: supabase is undefined');
    return;
  }

  /* Step 2: Check authentication */
  var user = null;
  try {
    var sessionResult = await supabase.auth.getSession();
    var session = sessionResult.data.session;
    if (!session) {
      console.warn('HEALTH: No session found, redirecting to login');
      window.location.href = 'index.html';
      return;
    }
    user = session.user;
    console.log('HEALTH: Authenticated as', user.email);
  } catch (err) {
    console.error('HEALTH: Session check failed:', err);
    window.location.href = 'index.html';
    return;
  }

  /* Step 3: Load user info in topbar */
  var nameEl = document.getElementById('userName');
  var avatarEl = document.getElementById('userAvatar');
  if (nameEl) nameEl.textContent = user.email.split('@')[0];
  if (avatarEl) avatarEl.textContent = user.email.substring(0, 2).toUpperCase();

  /* Step 4: Load data */
  if (statusEl) statusEl.style.display = 'none';
  await loadHealthRecords(user.id);
  bindHealthEvents();
});


/* ---------- Load Records ---------- */
async function loadHealthRecords(userId) {
  try {
    var result = await supabase
      .from('health_records')
      .select('*')
      .eq('user_id', userId)
      .order('check_date', { ascending: false });

    if (result.error) {
      console.error('HEALTH: Query error:', result.error);
      showToast('Failed to load: ' + result.error.message, 'error');
      renderHealthRecords([]);
      return;
    }

    allHealthRecords = result.data || [];
    console.log('HEALTH: Loaded', allHealthRecords.length, 'records');
    renderHealthRecords(allHealthRecords);
  } catch (err) {
    console.error('HEALTH: Load exception:', err);
    renderHealthRecords([]);
  }
}


/* ---------- Render Table ---------- */
function renderHealthRecords(list) {
  var tbody = document.getElementById('healthTableBody');
  if (!tbody) {
    console.error('HEALTH: healthTableBody element not found in HTML');
    return;
  }

  if (list.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9">' +
      '<div class="empty-state">' +
      '<i class="fas fa-stethoscope"></i>' +
      '<h3>No health records</h3>' +
      '<p>Add a health record to get started.</p>' +
      '</div></td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function(h) {
    return '<tr>' +
      '<td class="fw-600">' + esc(h.tag_id || '—') + '</td>' +
      '<td>' + esc(h.disease || '—') + '</td>' +
      '<td>' + esc(h.treatment || '—') + '</td>' +
      '<td>' + esc(h.medicine || '—') + '</td>' +
      '<td>' + esc(h.vet_name || '—') + '</td>' +
      '<td>' + (h.check_date ? new Date(h.check_date).toLocaleDateString() : '—') + '</td>' +
      '<td>' + (h.next_check_date ? new Date(h.next_check_date).toLocaleDateString() : '—') + '</td>' +
      '<td>' + statusBadge(h.status) + '</td>' +
      '<td><div class="table-actions">' +
        '<button class="btn-icon" title="Edit" onclick="editHealthRecord(\'' + h.id + '\')"><i class="fas fa-pen-to-square"></i></button>' +
        '<button class="btn-icon danger" title="Delete" onclick="confirmDeleteHealth(\'' + h.id + '\')"><i class="fas fa-trash"></i></button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}


/* ---------- Bind Events ---------- */
function bindHealthEvents() {
  var addBtn = document.getElementById('addHealthBtn');
  if (addBtn) addBtn.addEventListener('click', function() { openHealthModal(); });

  var saveBtn = document.getElementById('saveHealthBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveHealthRecord);

  var delBtn = document.getElementById('confirmDeleteHealthBtn');
  if (delBtn) delBtn.addEventListener('click', deleteHealthRecord);

  var searchInput = document.getElementById('searchHealth');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var q = searchInput.value.toLowerCase();
      var filtered = allHealthRecords.filter(function(h) {
        return (h.tag_id || '').toLowerCase().indexOf(q) !== -1 ||
               (h.disease || '').toLowerCase().indexOf(q) !== -1 ||
               (h.treatment || '').toLowerCase().indexOf(q) !== -1 ||
               (h.vet_name || '').toLowerCase().indexOf(q) !== -1;
      });
      renderHealthRecords(filtered);
    });
  }

  var exportBtn = document.getElementById('exportHealthCsv');
  if (exportBtn) {
    exportBtn.addEventListener('click', function() {
      if (allHealthRecords.length === 0) {
        showToast('No records to export.', 'warning');
        return;
      }
      var headers = ['tag_id','disease','treatment','medicine','vet_name','check_date','next_check_date','status','notes'];
      var csv = headers.join(',') + '\n' + allHealthRecords.map(function(h) {
        return headers.map(function(col) {
          return '"' + (h[col] || '').toString().replace(/"/g, '""') + '"';
        }).join(',');
      }).join('\n');

      var blob = new Blob([csv], { type: 'text/csv' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'health_records_export.csv';
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('Health records exported.', 'success');
    });
  }
}


/* ---------- Modal Logic ---------- */
var editingHealthId = null;

function openHealthModal(record) {
  editingHealthId = record ? record.id : null;
  var title = document.getElementById('healthModalTitle');
  if (title) title.textContent = record ? 'Edit Health Record' : 'Add Health Record';

  var fields = ['tag_id','disease','treatment','medicine','vet_name','check_date','next_check_date','status','notes'];
  fields.forEach(function(f) {
    var el = document.getElementById('health_' + f);
    if (el) el.value = record ? (record[f] || '') : '';
  });

  var statusEl = document.getElementById('health_status');
  if (statusEl && !record) statusEl.value = 'Under Treatment';

  openModal('healthModal');
}

async function saveHealthRecord() {
  var fields = ['tag_id','disease','treatment','medicine','vet_name','check_date','next_check_date','status','notes'];
  var data = {};
  fields.forEach(function(f) {
    var el = document.getElementById('health_' + f);
    data[f] = el ? el.value.trim() : '';
  });

  if (!data.tag_id) {
    showToast('Tag ID is required.', 'error');
    return;
  }

  try {
    if (editingHealthId) {
      var result = await supabase.from('health_records').update(data).eq('id', editingHealthId);
      if (result.error) { showToast('Update failed: ' + result.error.message, 'error'); return; }
      showToast('Health record updated.', 'success');
    } else {
      var session = await supabase.auth.getSession();
      data.user_id = session.data.session.user.id;
      var result = await supabase.from('health_records').insert([data]);
      if (result.error) { showToast('Insert failed: ' + result.error.message, 'error'); return; }
      showToast('Health record added.', 'success');
    }
    closeModal('healthModal');
    var session = await supabase.auth.getSession();
    await loadHealthRecords(session.data.session.user.id);
  } catch (err) {
    console.error('Save error:', err);
    showToast('Save failed: ' + err.message, 'error');
  }
}

async function editHealthRecord(id) {
  try {
    var result = await supabase.from('health_records').select('*').eq('id', id).single();
    if (result.error) { showToast('Could not load record.', 'error'); return; }
    openHealthModal(result.data);
  } catch (err) {
    showToast('Error loading record.', 'error');
  }
}

var deletingHealthId = null;
function confirmDeleteHealth(id) {
  deletingHealthId = id;
  openModal('deleteHealthModal');
}

async function deleteHealthRecord() {
  if (!deletingHealthId) return;
  try {
    var result = await supabase.from('health_records').delete().eq('id', deletingHealthId);
    if (result.error) { showToast('Delete failed.', 'error'); return; }
    showToast('Health record deleted.', 'success');
    closeModal('deleteHealthModal');
    deletingHealthId = null;
    var session = await supabase.auth.getSession();
    await loadHealthRecords(session.data.session.user.id);
  } catch (err) {
    showToast('Delete error.', 'error');
  }
}


/* ---------- Helpers ---------- */
function openModal(id) { var el = document.getElementById(id); if (el) el.classList.add('show'); }
function closeModal(id) { var el = document.getElementById(id); if (el) el.classList.remove('show'); }
function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function statusBadge(s) {
  var m = { 'Healthy':'badge-green', 'Under Treatment':'badge-orange', 'Critical':'badge-red', 'Recovered':'badge-green', 'Completed':'badge-green', 'Pending':'badge-orange' };
  return '<span class="badge ' + (m[s] || 'badge-gray') + '">' + esc(s) + '</span>';
}