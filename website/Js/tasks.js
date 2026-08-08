/* ============================================
   TASKS MODULE
   CRUD operations, search, filter tabs,
   summary cards.
   ============================================ */

var allTasks = [];
var currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async function() {

  console.log('TASKS: Starting...');

  /* Step 1: Supabase check */
  if (typeof supabase === 'undefined' || !supabase || !supabase.auth) {
    showPageStatus('Supabase not loaded. Use a local server, not file://', 'error');
    return;
  }

  /* Step 2: Auth check */
  var user = await checkAuthWithStatus();
  if (!user) return;
  console.log('TASKS: User =', user.email);

  /* Step 3: Load tasks */
  await loadTasks(user.id);

  /* Step 4: Bind events */
  bindTaskEvents();
});


/* ============================================
   LOAD TASKS FROM SUPABASE
   ============================================ */
async function loadTasks(userId) {
  try {
    var result = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (result.error) {
      console.error('TASKS: Query error:', result.error.message);
      showToast('Failed to load tasks: ' + result.error.message, 'error');
      allTasks = [];
    } else {
      allTasks = result.data || [];
      console.log('TASKS: Loaded', allTasks.length, 'tasks');
    }
  } catch (err) {
    console.error('TASKS: Load exception:', err);
    allTasks = [];
  }

  renderTaskSummary();
  renderTasks(allTasks);
}


/* ============================================
   RENDER SUMMARY CARDS
   ============================================ */
function renderTaskSummary() {
  var el = document.getElementById('taskSummary');
  if (!el) return;

  var pending = allTasks.filter(function(t) { return t.status === 'Pending'; }).length;
  var inProgress = allTasks.filter(function(t) { return t.status === 'In Progress'; }).length;
  var completed = allTasks.filter(function(t) { return t.status === 'Completed'; }).length;
  var overdue = allTasks.filter(function(t) {
    return t.due_date && t.status !== 'Completed' && new Date(t.due_date) < new Date();
  }).length;

  el.innerHTML =
    '<div class="summary-card">' +
      '<div class="summary-icon blue"><i class="fas fa-list-check"></i></div>' +
      '<div class="summary-info"><h4>' + allTasks.length + '</h4><p>Total Tasks</p></div>' +
    '</div>' +
    '<div class="summary-card">' +
      '<div class="summary-icon orange"><i class="fas fa-clock"></i></div>' +
      '<div class="summary-info"><h4>' + pending + '</h4><p>Pending</p></div>' +
    '</div>' +
    '<div class="summary-card">' +
      '<div class="summary-icon green"><i class="fas fa-spinner"></i></div>' +
      '<div class="summary-info"><h4>' + inProgress + '</h4><p>In Progress</p></div>' +
    '</div>' +
    '<div class="summary-card">' +
      '<div class="summary-icon green"><i class="fas fa-circle-check"></i></div>' +
      '<div class="summary-info"><h4>' + completed + '</h4><p>Completed</p></div>' +
    '</div>' +
    '<div class="summary-card">' +
      '<div class="summary-icon red"><i class="fas fa-triangle-exclamation"></i></div>' +
      '<div class="summary-info"><h4>' + overdue + '</h4><p>Overdue</p></div>' +
    '</div>';
}


/* ============================================
   RENDER TASKS TABLE
   ============================================ */
function renderTasks(list) {
  var tbody = document.getElementById('tasksTableBody');
  if (!tbody) return;

  /* Apply current filter */
  var filtered = list;
  if (currentFilter !== 'all') {
    filtered = list.filter(function(t) { return t.status === currentFilter; });
  }

  if (filtered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6">' +
      '<div class="empty-state">' +
      '<i class="fas fa-clipboard-check"></i>' +
      '<h3>No tasks found</h3>' +
      '<p>' + (currentFilter !== 'all' ? 'No ' + currentFilter.toLowerCase() + ' tasks.' : 'Add your first task to get started.') + '</p>' +
      '</div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function(t) {
    var isOverdue = t.due_date && t.status !== 'Completed' && new Date(t.due_date) < new Date();
    var dateDisplay = t.due_date ? new Date(t.due_date).toLocaleDateString() : '—';

    /* If overdue, show the date in red */
    if (isOverdue) {
      dateDisplay = '<span style="color:var(--red);font-weight:600;">' + dateDisplay + ' (Overdue)</span>';
    }

    /* Strikethrough completed tasks */
    var titleStyle = t.status === 'Completed' ? 'style="text-decoration:line-through;opacity:0.6;"' : '';
    var descStyle = t.status === 'Completed' ? 'style="text-decoration:line-through;opacity:0.5;"' : '';

    return '<tr>' +
      '<td class="fw-600" ' + titleStyle + '>' + esc(t.title) + '</td>' +
      '<td ' + descStyle + '>' + esc((t.description || '').substring(0, 60)) + ((t.description || '').length > 60 ? '...' : '') + '</td>' +
      '<td>' + dateDisplay + '</td>' +
      '<td>' + priorityBadge(t.priority) + '</td>' +
      '<td>' + statusBadge(t.status) + '</td>' +
      '<td><div class="table-actions">' +
        '<button class="btn-icon" title="Edit" onclick="editTask(\'' + t.id + '\')"><i class="fas fa-pen-to-square"></i></button>' +
        '<button class="btn-icon danger" title="Delete" onclick="confirmDeleteTask(\'' + t.id + '\')"><i class="fas fa-trash"></i></button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}


/* ============================================
   BIND ALL EVENTS
   ============================================ */
function bindTaskEvents() {
  /* Add task button */
  var addBtn = document.getElementById('addTaskBtn');
  if (addBtn) addBtn.addEventListener('click', function() { openTaskModal(); });

  /* Save task button */
  var saveBtn = document.getElementById('saveTaskBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveTask);

  /* Delete confirm button */
  var delBtn = document.getElementById('confirmDeleteTaskBtn');
  if (delBtn) delBtn.addEventListener('click', deleteTask);

  /* Search input */
  var searchInput = document.getElementById('searchTasks');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var q = searchInput.value.toLowerCase();
      var filtered = allTasks.filter(function(t) {
        return (t.title || '').toLowerCase().indexOf(q) !== -1 ||
               (t.description || '').toLowerCase().indexOf(q) !== -1;
      });
      renderTasks(filtered);
    });
  }

  /* Filter tabs */
  document.querySelectorAll('.task-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.task-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderTasks(allTasks);
    });
  });
}


/* ============================================
   MODAL LOGIC
   ============================================ */
var editingTaskId = null;

function openTaskModal(task) {
  editingTaskId = task ? task.id : null;
  var title = document.getElementById('taskModalTitle');
  if (title) title.textContent = task ? 'Edit Task' : 'Add Task';

  var fields = ['title', 'description', 'due_date', 'priority', 'status'];
  fields.forEach(function(f) {
    var el = document.getElementById('task_' + f);
    if (el) el.value = task ? (task[f] || '') : '';
  });

  /* Defaults for new tasks */
  if (!task) {
    var prEl = document.getElementById('task_priority');
    if (prEl) prEl.value = 'Medium';
    var stEl = document.getElementById('task_status');
    if (stEl) stEl.value = 'Pending';
  }

  openModal('taskModal');
}


/* ============================================
   SAVE TASK (INSERT OR UPDATE)
   ============================================ */
async function saveTask() {
  var data = {};
  data.title = (document.getElementById('task_title') || {}).value || '';
  data.description = (document.getElementById('task_description') || {}).value || '';
  data.due_date = (document.getElementById('task_due_date') || {}).value || null;
  data.priority = (document.getElementById('task_priority') || {}).value || 'Medium';
  data.status = (document.getElementById('task_status') || {}).value || 'Pending';

  if (!data.title.trim()) {
    showToast('Task title is required.', 'error');
    return;
  }
  data.title = data.title.trim();
  data.description = data.description.trim();

  try {
    if (editingTaskId) {
      var result = await supabase.from('tasks').update(data).eq('id', editingTaskId);
      if (result.error) { showToast('Update failed: ' + result.error.message, 'error'); return; }
      showToast('Task updated.', 'success');
    } else {
      var session = await supabase.auth.getSession();
      data.user_id = session.data.session.user.id;
      var result = await supabase.from('tasks').insert([data]);
      if (result.error) { showToast('Insert failed: ' + result.error.message, 'error'); return; }
      showToast('Task added.', 'success');
    }

    closeModal('taskModal');
    var session = await supabase.auth.getSession();
    await loadTasks(session.data.session.user.id);

  } catch (err) {
    console.error('TASKS: Save error:', err);
    showToast('Save failed: ' + err.message, 'error');
  }
}


/* ============================================
   EDIT TASK
   ============================================ */
async function editTask(id) {
  try {
    var result = await supabase.from('tasks').select('*').eq('id', id).single();
    if (result.error) { showToast('Could not load task.', 'error'); return; }
    openTaskModal(result.data);
  } catch (err) {
    showToast('Error loading task.', 'error');
  }
}


/* ============================================
   DELETE TASK
   ============================================ */
var deletingTaskId = null;

function confirmDeleteTask(id) {
  deletingTaskId = id;
  openModal('deleteTaskModal');
}

async function deleteTask() {
  if (!deletingTaskId) return;

  try {
    var result = await supabase.from('tasks').delete().eq('id', deletingTaskId);
    if (result.error) { showToast('Delete failed.', 'error'); return; }

    showToast('Task deleted.', 'success');
    closeModal('deleteTaskModal');
    deletingTaskId = null;

    var session = await supabase.auth.getSession();
    await loadTasks(session.data.session.user.id);

  } catch (err) {
    showToast('Delete error.', 'error');
  }
}


/* ============================================
   HELPERS
   ============================================ */
function openModal(id) { var el = document.getElementById(id); if (el) el.classList.add('show'); }
function closeModal(id) { var el = document.getElementById(id); if (el) el.classList.remove('show'); }

function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function statusBadge(s) {
  var m = {
    'Pending': 'badge-orange',
    'In Progress': 'badge-blue',
    'Completed': 'badge-green'
  };
  return '<span class="badge ' + (m[s] || 'badge-gray') + '">' + esc(s) + '</span>';
}

function priorityBadge(p) {
  var m = { 'High': 'badge-red', 'Medium': 'badge-orange', 'Low': 'badge-blue' };
  return '<span class="badge ' + (m[p] || 'badge-gray') + '">' + esc(p) + '</span>';
}