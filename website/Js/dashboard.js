/* ============================================
   DASHBOARD MODULE
   Connected to: Animals, Health, Tasks, Finance,
   Production, Breeding. All linked to their
   respective full pages.
   ============================================ */

/* Store data globally so the quick-add task can re-render */
var dashData = {
  animals: [],
  health: [],
  finance: [],
  production: [],
  tasks: [],
  breeding: [],
  user: null
};

document.addEventListener('DOMContentLoaded', async function() {

  console.log('DASHBOARD: Starting...');

  if (typeof supabase === 'undefined' || !supabase || !supabase.auth) {
    showPageStatus('Supabase not loaded. Use a local server, not file://', 'error');
    return;
  }

  var user = await checkAuthWithStatus();
  if (!user) return;
  console.log('DASHBOARD: User =', user.email);
  dashData.user = user;

  if (typeof Chart === 'undefined') {
    console.error('DASHBOARD: Chart.js is NOT loaded');
  } else {
    console.log('DASHBOARD: Chart.js v' + Chart.version + ' loaded');
  }

  /* Fetch all data */
  console.log('DASHBOARD: Fetching data...');
  await fetchAllData(user.id);

  /* Render everything */
  renderSummaryCards();
  renderHealthChart();
  renderFinanceChart();
  renderProductionChart();
  renderRecentAnimals();
  renderUpcomingTasks();
  renderHealthAlerts();

  /* Bind dashboard-specific buttons */
  bindDashEvents();
});


/* ============================================
   FETCH ALL DATA
   ============================================ */
async function fetchAllData(userId) {
  try {
    var r1 = await supabase.from('animals').select('*').eq('user_id', userId);
    var r2 = await supabase.from('health_records').select('*').eq('user_id', userId);
    var r3 = await supabase.from('finance_records').select('*').eq('user_id', userId);
    var r4 = await supabase.from('production_records').select('*').eq('user_id', userId);
    var r5 = await supabase.from('tasks').select('*').eq('user_id', userId).order('due_date', { ascending: true, nullsFirst: false });
    var r6 = await supabase.from('breeding_records').select('*').eq('user_id', userId);

    [r1, r2, r3, r4, r5, r6].forEach(function(r, i) {
      var names = ['Animals','Health','Finance','Production','Tasks','Breeding'];
      if (r.error) console.error('DASHBOARD: ' + names[i] + ' error:', r.error.message);
    });

    dashData.animals    = r1.data || [];
    dashData.health     = r2.data || [];
    dashData.finance    = r3.data || [];
    dashData.production = r4.data || [];
    dashData.tasks      = r5.data || [];
    dashData.breeding   = r6.data || [];

    console.log('DASHBOARD: Data loaded —',
      'Animals:', dashData.animals.length,
      'Health:', dashData.health.length,
      'Finance:', dashData.finance.length,
      'Production:', dashData.production.length,
      'Tasks:', dashData.tasks.length,
      'Breeding:', dashData.breeding.length
    );

  } catch (err) {
    console.error('DASHBOARD: Data fetch exception:', err);
    showPageStatus('Failed to load data: ' + err.message, 'error');
    dashData.animals = []; dashData.health = []; dashData.finance = [];
    dashData.production = []; dashData.tasks = []; dashData.breeding = [];
  }
}


/* ============================================
   SUMMARY CARDS
   "Pending Tasks" card links to tasks.html
   ============================================ */
function renderSummaryCards() {
  var a = dashData.animals;
  var h = dashData.health;
  var t = dashData.tasks;
  var b = dashData.breeding;
  var f = dashData.finance;

  var healthyCount   = a.filter(function(x) { return x.health_status === 'Healthy'; }).length;
  var treatmentCount = a.filter(function(x) { return x.health_status === 'Under Treatment'; }).length;
  var criticalCount  = a.filter(function(x) { return x.health_status === 'Critical'; }).length;
  var pregnantCount  = b.filter(function(x) { return x.pregnancy_status === 'Pregnant'; }).length;
  var newbornCount   = b.filter(function(x) { return x.birth_date; }).reduce(function(s, x) { return s + (x.newborn_count || 0); }, 0);
  var pendingTasks   = t.filter(function(x) { return x.status === 'Pending'; }).length;
  var overdueTasks   = t.filter(function(x) { return x.due_date && x.status !== 'Completed' && new Date(x.due_date) < new Date(); }).length;

  var now = new Date();
  var monthFinance = f.filter(function(x) {
    var d = new Date(x.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  var monthIncome  = monthFinance.filter(function(x) { return x.type === 'Income'; }).reduce(function(s, x) { return s + (x.amount || 0); }, 0);
  var monthExpense = monthFinance.filter(function(x) { return x.type === 'Expense'; }).reduce(function(s, x) { return s + (x.amount || 0); }, 0);
  var profitLoss   = monthIncome - monthExpense;

  var items = [
    { icon: 'fa-cow',                 color: 'green',  label: 'Total Animals',    value: a.length,    link: 'animals.html' },
    { icon: 'fa-heart-pulse',         color: 'green',  label: 'Healthy',          value: healthyCount, link: 'animals.html' },
    { icon: 'fa-stethoscope',         color: 'orange', label: 'Under Treatment',  value: treatmentCount, link: 'health.html' },
    { icon: 'fa-triangle-exclamation', color: 'red',   label: 'Critical Cases',   value: criticalCount, link: 'health.html' },
    { icon: 'fa-baby',                color: 'purple', label: 'Pregnant',         value: pregnantCount, link: 'breeding.html' },
    { icon: 'fa-egg',                 color: 'blue',   label: 'Newborns',         value: newbornCount,  link: 'breeding.html' },
    { icon: 'fa-list-check',          color: overdueTasks > 0 ? 'red' : 'orange', label: 'Pending Tasks', value: pendingTasks, link: 'tasks.html' },
    { icon: 'fa-arrow-trend-up',      color: 'green',  label: 'Monthly Income',   value: '$' + monthIncome.toLocaleString(), link: 'finance.html' },
    { icon: 'fa-arrow-trend-down',    color: 'red',    label: 'Monthly Expenses', value: '$' + monthExpense.toLocaleString(), link: 'finance.html' },
    { icon: 'fa-chart-line',          color: profitLoss >= 0 ? 'blue' : 'red', label: 'Profit/Loss', value: '$' + profitLoss.toLocaleString(), link: 'finance.html' }
  ];

  var grid = document.getElementById('summaryGrid');
  if (!grid) return;

  grid.innerHTML = items.map(function(s) {
    return '<a href="' + s.link + '" class="summary-card" style="text-decoration:none;color:inherit;">' +
      '<div class="summary-icon ' + s.color + '"><i class="fas ' + s.icon + '"></i></div>' +
      '<div class="summary-info"><h4>' + s.value + '</h4><p>' + s.label + '</p></div>' +
    '</a>';
  }).join('');
}


/* ============================================
   CHARTS
   ============================================ */
function renderHealthChart() {
  var healthy = dashData.animals.filter(function(a) { return a.health_status === 'Healthy'; }).length;
  var treatment = dashData.animals.filter(function(a) { return a.health_status === 'Under Treatment'; }).length;
  var critical = dashData.animals.filter(function(a) { return a.health_status === 'Critical'; }).length;
  var total = healthy + treatment + critical;
  var wrap = document.getElementById('healthChartWrap');

  if (typeof Chart === 'undefined') return;

  if (total === 0) {
    if (wrap) wrap.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><i class="fas fa-chart-pie"></i><h3>No animal data yet</h3><p>Add animals to see health distribution.</p></div>';
    return;
  }
  if (wrap && !wrap.querySelector('canvas')) {
    wrap.innerHTML = '<canvas id="healthChart"></canvas>';
  }
  try {
    new Chart(document.getElementById('healthChart'), {
      type: 'doughnut',
      data: { labels: ['Healthy','Under Treatment','Critical'], datasets: [{ data: [healthy, treatment, critical], backgroundColor: ['#2E7D32','#F9A825','#D32F2F'], borderWidth: 0, spacing: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12 } } } } }
    });
  } catch (e) { console.error('Health chart error:', e); }
}

function renderFinanceChart() {
  if (typeof Chart === 'undefined') return;
  var now = new Date();
  var months = [], incomeData = [], expenseData = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleString('default', { month: 'short' }));
    var mf = dashData.finance.filter(function(f) { var fd = new Date(f.date); return fd.getMonth() === d.getMonth() && fd.getFullYear() === d.getFullYear(); });
    incomeData.push(mf.filter(function(f) { return f.type === 'Income'; }).reduce(function(s, f) { return s + (f.amount || 0); }, 0));
    expenseData.push(mf.filter(function(f) { return f.type === 'Expense'; }).reduce(function(s, f) { return s + (f.amount || 0); }, 0));
  }
  var hasData = incomeData.some(function(v) { return v > 0; }) || expenseData.some(function(v) { return v > 0; });
  var wrap = document.getElementById('financeChartWrap');
  if (!hasData) { if (wrap) wrap.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><i class="fas fa-chart-column"></i><h3>No finance data yet</h3><p>Add income or expense records to see trends.</p></div>'; return; }
  if (wrap && !wrap.querySelector('canvas')) wrap.innerHTML = '<canvas id="financeChart"></canvas>';
  try {
    new Chart(document.getElementById('financeChart'), {
      type: 'bar',
      data: { labels: months, datasets: [{ label: 'Income', data: incomeData, backgroundColor: '#2E7D32', borderRadius: 6 }, { label: 'Expenses', data: expenseData, backgroundColor: '#D32F2F', borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } }, plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 12 } } } } }
    });
  } catch (e) { console.error('Finance chart error:', e); }
}

function renderProductionChart() {
  if (typeof Chart === 'undefined') return;
  var now = new Date();
  var months = [], prodData = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleString('default', { month: 'short' }));
    var mp = dashData.production.filter(function(p) { var pd = new Date(p.production_date); return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear(); });
    prodData.push(mp.reduce(function(s, p) { return s + (p.quantity || 0); }, 0));
  }
  var hasData = prodData.some(function(v) { return v > 0; });
  var wrap = document.getElementById('productionChartWrap');
  if (!hasData) { if (wrap) wrap.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><i class="fas fa-chart-line"></i><h3>No production data yet</h3><p>Add milk, egg, or meat records to see trends.</p></div>'; return; }
  if (wrap && !wrap.querySelector('canvas')) wrap.innerHTML = '<canvas id="productionChart"></canvas>';
  try {
    new Chart(document.getElementById('productionChart'), {
      type: 'line',
      data: { labels: months, datasets: [{ label: 'Total Production', data: prodData, borderColor: '#1976D2', backgroundColor: 'rgba(25,118,210,0.1)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#1976D2' }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } }, plugins: { legend: { display: false } } }
    });
  } catch (e) { console.error('Production chart error:', e); }
}


/* ============================================
   RECENT ANIMALS TABLE
   Each row links to animals page context
   ============================================ */
function renderRecentAnimals() {
  var el = document.getElementById('recentAnimals');
  if (!el) return;

  if (dashData.animals.length === 0) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-cow"></i><h3>No animals yet</h3><p><a href="animals.html" style="color:var(--primary);font-weight:600;">Add your first animal</a> to get started.</p></div>';
    return;
  }

  var sorted = dashData.animals.slice().sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); }).slice(0, 5);

  el.innerHTML = '<div class="table-wrapper"><table class="data-table">' +
    '<thead><tr><th>Tag ID</th><th>Name</th><th>Species</th><th>Breed</th><th>Status</th></tr></thead>' +
    '<tbody>' + sorted.map(function(a) {
      return '<tr style="cursor:pointer;" onclick="window.location.href=\'animals.html\'">' +
        '<td class="fw-600">' + esc(a.tag_id) + '</td>' +
        '<td>' + esc(a.name || '—') + '</td>' +
        '<td>' + esc(a.species) + '</td>' +
        '<td>' + esc(a.breed || '—') + '</td>' +
        '<td>' + statusBadge(a.health_status) + '</td>' +
      '</tr>';
    }).join('') + '</tbody></table></div>';
}


/* ============================================
   UPCOMING TASKS TABLE
   Connected to tasks.html — shows pending tasks,
   marks overdue in red, links to full page.
   "Add" button opens quick-add modal.
   ============================================ */
function renderUpcomingTasks() {
  var el = document.getElementById('upcomingTasks');
  if (!el) return;

  var pending = dashData.tasks.filter(function(t) { return t.status !== 'Completed'; }).slice(0, 5);

  if (pending.length === 0) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard-check"></i><h3>No pending tasks</h3><p>All caught up! <a href="tasks.html" style="color:var(--primary);font-weight:600;">View all tasks</a></p></div>';
    return;
  }

  el.innerHTML = '<div class="table-wrapper"><table class="data-table">' +
    '<thead><tr><th>Task</th><th>Due Date</th><th>Priority</th><th>Status</th></tr></thead>' +
    '<tbody>' + pending.map(function(t) {
      var isOverdue = t.due_date && t.status !== 'Completed' && new Date(t.due_date) < new Date();
      var dateHtml = t.due_date ? new Date(t.due_date).toLocaleDateString() : '—';
      if (isOverdue) dateHtml = '<span style="color:var(--red);font-weight:600;">' + dateHtml + '</span>';

      return '<tr style="cursor:pointer;" onclick="window.location.href=\'tasks.html\'">' +
        '<td class="fw-600">' + esc(t.title) + '</td>' +
        '<td>' + dateHtml + '</td>' +
        '<td>' + priorityBadge(t.priority) + '</td>' +
        '<td>' + statusBadge(t.status) + '</td>' +
      '</tr>';
    }).join('') + '</tbody></table></div>';
}


/* ============================================
   HEALTH ALERTS TABLE
   Connected to health.html
   ============================================ */
function renderHealthAlerts() {
  var el = document.getElementById('healthAlerts');
  if (!el) return;

  var alerts = dashData.health
    .filter(function(h) { return h.status === 'Under Treatment' || h.status === 'Critical'; })
    .sort(function(a, b) { return new Date(b.check_date) - new Date(a.check_date); })
    .slice(0, 5);

  if (alerts.length === 0) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-shield-heart"></i><h3>No health alerts</h3><p>All animals are healthy.</p></div>';
    return;
  }

  el.innerHTML = '<div class="table-wrapper"><table class="data-table">' +
    '<thead><tr><th>Tag ID</th><th>Disease</th><th>Treatment</th><th>Status</th></tr></thead>' +
    '<tbody>' + alerts.map(function(h) {
      return '<tr style="cursor:pointer;" onclick="window.location.href=\'health.html\'">' +
        '<td class="fw-600">' + esc(h.tag_id || '—') + '</td>' +
        '<td>' + esc(h.disease || '—') + '</td>' +
        '<td>' + esc(h.treatment || '—') + '</td>' +
        '<td>' + statusBadge(h.status) + '</td>' +
      '</tr>';
    }).join('') + '</tbody></table></div>';
}


/* ============================================
   BIND DASHBOARD EVENTS
   Quick-add task from dashboard
   ============================================ */
function bindDashEvents() {
  var addBtn = document.getElementById('dashAddTaskBtn');
  if (addBtn) {
    addBtn.addEventListener('click', function() {
      /* Clear the form */
      var titleEl = document.getElementById('dashTask_title');
      var descEl = document.getElementById('dashTask_description');
      var dateEl = document.getElementById('dashTask_due_date');
      var prioEl = document.getElementById('dashTask_priority');
      if (titleEl) titleEl.value = '';
      if (descEl) descEl.value = '';
      if (dateEl) dateEl.value = '';
      if (prioEl) prioEl.value = 'Medium';
      openModal('dashTaskModal');
    });
  }

  var saveBtn = document.getElementById('dashSaveTaskBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', quickAddTask);
  }
}


/* ============================================
   QUICK ADD TASK FROM DASHBOARD
   Saves to Supabase, then refreshes the
   tasks table and summary card.
   ============================================ */
async function quickAddTask() {
  var title = (document.getElementById('dashTask_title') || {}).value || '';
  var description = (document.getElementById('dashTask_description') || {}).value || '';
  var due_date = (document.getElementById('dashTask_due_date') || {}).value || null;
  var priority = (document.getElementById('dashTask_priority') || {}).value || 'Medium';

  title = title.trim();
  if (!title) {
    showToast('Task title is required.', 'error');
    return;
  }

  try {
    var result = await supabase.from('tasks').insert([{
      user_id: dashData.user.id,
      title: title,
      description: description.trim(),
      due_date: due_date,
      priority: priority,
      status: 'Pending'
    }]);

    if (result.error) {
      showToast('Failed to add task: ' + result.error.message, 'error');
      return;
    }

    showToast('Task added!', 'success');
    closeModal('dashTaskModal');

    /* Re-fetch tasks and re-render only what changed */
    var taskResult = await supabase.from('tasks').select('*').eq('user_id', dashData.user.id).order('due_date', { ascending: true, nullsFirst: false });
    dashData.tasks = taskResult.data || [];

    renderSummaryCards();
    renderUpcomingTasks();

  } catch (err) {
    console.error('DASHBOARD: Quick add task error:', err);
    showToast('Failed to add task.', 'error');
  }
}


/* ============================================
   HELPERS
   ============================================ */
function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function statusBadge(s) {
  var m = { 'Healthy':'badge-green', 'Under Treatment':'badge-orange', 'Critical':'badge-red', 'Pregnant':'badge-purple', 'Completed':'badge-green', 'Pending':'badge-orange', 'In Progress':'badge-blue', 'Recovered':'badge-green', 'Not Confirmed':'badge-gray' };
  return '<span class="badge ' + (m[s] || 'badge-gray') + '">' + esc(s) + '</span>';
}

function priorityBadge(p) {
  var m = { 'High':'badge-red', 'Medium':'badge-orange', 'Low':'badge-blue' };
  return '<span class="badge ' + (m[p] || 'badge-gray') + '">' + esc(p || 'Medium') + '</span>';
}

function openModal(id) { var el = document.getElementById(id); if (el) el.classList.add('show'); }
function closeModal(id) { var el = document.getElementById(id); if (el) el.classList.remove('show'); }