/* ============================================
   REPORTS MODULE — Full Farm Report
   Shows ALL data: summary, animals, health,
   breeding, production, and finance together.
   ============================================ */

/* Store raw data globally so filters can re-render */
var reportData = {
  animals: [],
  health: [],
  breeding: [],
  production: [],
  finance: []
};

document.addEventListener('DOMContentLoaded', async function() {

  console.log('REPORTS: Starting...');

  /* Step 1: Supabase check */
  if (typeof supabase === 'undefined' || !supabase || !supabase.auth) {
    showPageStatus('Supabase not loaded. Use a local server, not file://', 'error');
    return;
  }

  /* Step 2: Auth check */
  var user = await checkAuthWithStatus();
  if (!user) return;
  console.log('REPORTS: User =', user.email);

  /* Step 3: Topbar user info */
  var nameEl = document.getElementById('userName');
  var avatarEl = document.getElementById('userAvatar');
  if (nameEl) nameEl.textContent = user.email.split('@')[0];
  if (avatarEl) avatarEl.textContent = user.email.substring(0, 2).toUpperCase();

  /* Step 4: Load ALL data */
  await loadAllData(user.id);

  /* Step 5: Bind buttons */
  bindReportButtons();

  /* Step 6: Render the full report */
  renderFullReport();
});


/* ============================================
   LOAD ALL DATA FROM SUPABASE
   ============================================ */
async function loadAllData(userId) {
  console.log('REPORTS: Fetching all data...');

  try {
    var r1 = await supabase.from('animals').select('*').eq('user_id', userId);
    var r2 = await supabase.from('health_records').select('*').eq('user_id', userId);
    var r3 = await supabase.from('breeding_records').select('*').eq('user_id', userId);
    var r4 = await supabase.from('production_records').select('*').eq('user_id', userId);
    var r5 = await supabase.from('finance_records').select('*').eq('user_id', userId);

    if (r1.error) console.error('Animals error:', r1.error.message);
    if (r2.error) console.error('Health error:', r2.error.message);
    if (r3.error) console.error('Breeding error:', r3.error.message);
    if (r4.error) console.error('Production error:', r4.error.message);
    if (r5.error) console.error('Finance error:', r5.error.message);

    reportData.animals    = r1.data || [];
    reportData.health     = r2.data || [];
    reportData.breeding   = r3.data || [];
    reportData.production = r4.data || [];
    reportData.finance    = r5.data || [];

    console.log('REPORTS: Loaded —',
      'Animals:', reportData.animals.length,
      'Health:', reportData.health.length,
      'Breeding:', reportData.breeding.length,
      'Production:', reportData.production.length,
      'Finance:', reportData.finance.length
    );

  } catch (err) {
    console.error('REPORTS: Data load error:', err);
    showPageStatus('Failed to load data: ' + err.message, 'error');
  }
}


/* ============================================
   BIND BUTTON EVENTS
   ============================================ */
function bindReportButtons() {
  var refreshBtn = document.getElementById('refreshReportBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function() {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
      var user = await getCurrentUser();
      if (user) await loadAllData(user.id);
      renderFullReport();
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<i class="fas fa-rotate"></i> Refresh';
      showToast('Report refreshed.', 'success');
    });
  }

  var filterBtn = document.getElementById('applyFilterBtn');
  if (filterBtn) {
    filterBtn.addEventListener('click', function() {
      renderFullReport();
      showToast('Filters applied.', 'info');
    });
  }

  var printBtn = document.getElementById('printReportBtn');
  if (printBtn) {
    printBtn.addEventListener('click', function() { window.print(); });
  }

  var exportBtn = document.getElementById('exportReportCsv');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportFullReportCSV);
  }
}


/* ============================================
   GET FILTER VALUES
   ============================================ */
function getFilters() {
  return {
    dateFrom:  (document.getElementById('reportDateFrom') || {}).value || '',
    dateTo:    (document.getElementById('reportDateTo') || {}).value || '',
    animalTag: (document.getElementById('reportAnimal') || {}).value || ''
  };
}


/* ============================================
   RENDER THE FULL REPORT
   Every section: summary + table
   ============================================ */
function renderFullReport() {
  var f = getFilters();
  var container = document.getElementById('reportOutput');
  if (!container) return;

  var now = new Date();
  var timestamp = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString();

  /* ---- Calculate summaries ---- */
  var totalAnimals = reportData.animals.length;
  var healthyCount = reportData.animals.filter(function(a) { return a.health_status === 'Healthy'; }).length;
  var treatmentCount = reportData.animals.filter(function(a) { return a.health_status === 'Under Treatment'; }).length;
  var criticalCount = reportData.animals.filter(function(a) { return a.health_status === 'Critical'; }).length;
  var pregnantCount = reportData.breeding.filter(function(b) { return b.pregnancy_status === 'Pregnant'; }).length;

  var totalIncome = reportData.finance.filter(function(r) { return r.type === 'Income'; }).reduce(function(s, r) { return s + (r.amount || 0); }, 0);
  var totalExpense = reportData.finance.filter(function(r) { return r.type === 'Expense'; }).reduce(function(s, r) { return s + (r.amount || 0); }, 0);
  var netProfit = totalIncome - totalExpense;

  var milkTotal = reportData.production.filter(function(p) { return p.production_type === 'Milk'; }).reduce(function(s, p) { return s + (p.quantity || 0); }, 0);
  var eggsTotal = reportData.production.filter(function(p) { return p.production_type === 'Eggs'; }).reduce(function(s, p) { return s + (p.quantity || 0); }, 0);
  var meatTotal = reportData.production.filter(function(p) { return p.production_type === 'Meat'; }).reduce(function(s, p) { return s + (p.quantity || 0); }, 0);

  /* ---- Filter data ---- */
  var filteredAnimals    = filterAnimals(reportData.animals, f);
  var filteredHealth     = filterByDateAndTag(reportData.health, 'check_date', 'tag_id', f);
  var filteredBreeding   = filterByDateAndTag(reportData.breeding, 'breeding_date', 'tag_id', f);
  var filteredProduction = filterByDateAndTag(reportData.production, 'production_date', 'tag_id', f);
  var filteredFinance    = filterByDate(reportData.finance, 'date', f);

  /* ---- Build HTML ---- */
  var html = '';

  /* Report Header */
  html += '<div class="mb-24" style="border-bottom:2px solid var(--primary);padding-bottom:16px;">';
  html += '<h2 style="font-size:22px;font-weight:800;color:var(--primary-dark);margin-bottom:4px;">LivestockPro Farm Report</h2>';
  html += '<p class="text-muted" style="font-size:13px;">Generated on ' + timestamp;
  if (f.dateFrom || f.dateTo || f.animalTag) {
    html += ' &middot; Filtered: ';
    if (f.dateFrom) html += 'From ' + f.dateFrom + ' ';
    if (f.dateTo) html += 'To ' + f.dateTo + ' ';
    if (f.animalTag) html += 'Tag: ' + f.animalTag;
  }
  html += '</p></div>';

  /* ===== OVERVIEW SUMMARY ===== */
  html += '<div class="finance-summary mb-24">';
  html += '<div class="finance-card"><h4>Total Animals</h4><div class="amount" style="color:var(--text)">' + totalAnimals + '</div></div>';
  html += '<div class="finance-card"><h4>Healthy</h4><div class="amount income">' + healthyCount + '</div></div>';
  html += '<div class="finance-card"><h4>Under Treatment</h4><div class="amount expense">' + treatmentCount + '</div></div>';
  html += '<div class="finance-card"><h4>Critical</h4><div class="amount loss">' + criticalCount + '</div></div>';
  html += '<div class="finance-card"><h4>Pregnant</h4><div class="amount" style="color:var(--purple)">' + pregnantCount + '</div></div>';
  html += '<div class="finance-card"><h4>Total Income</h4><div class="amount income">$' + totalIncome.toLocaleString() + '</div></div>';
  html += '<div class="finance-card"><h4>Total Expenses</h4><div class="amount expense">$' + totalExpense.toLocaleString() + '</div></div>';
  html += '<div class="finance-card"><h4>Net Profit</h4><div class="amount ' + (netProfit >= 0 ? 'profit' : 'loss') + '">$' + netProfit.toLocaleString() + '</div></div>';
  html += '</div>';

  /* Production Summary */
  html += '<div class="finance-summary mb-24">';
  html += '<div class="finance-card"><h4>Milk Produced</h4><div class="amount income">' + milkTotal.toFixed(1) + ' L</div></div>';
  html += '<div class="finance-card"><h4>Eggs Collected</h4><div class="amount" style="color:var(--orange)">' + eggsTotal + ' units</div></div>';
  html += '<div class="finance-card"><h4>Meat Produced</h4><div class="amount" style="color:var(--primary)">' + meatTotal.toFixed(1) + ' kg</div></div>';
  html += '</div>';

  /* ===== SECTION 1: ANIMALS ===== */
  html += buildSection('Animals', 'fa-cow', filteredAnimals.length,
    ['Tag ID', 'Name', 'Species', 'Breed', 'Sex', 'Date of Birth', 'Location', 'Health Status'],
    filteredAnimals.map(function(a) {
      return [
        a.tag_id,
        a.name || '—',
        a.species,
        a.breed || '—',
        a.sex || '—',
        a.date_of_birth ? new Date(a.date_of_birth).toLocaleDateString() : '—',
        a.location || '—',
        a.health_status
      ];
    })
  );

  /* ===== SECTION 2: HEALTH RECORDS ===== */
  html += buildSection('Health Records', 'fa-stethoscope', filteredHealth.length,
    ['Tag ID', 'Disease', 'Treatment', 'Medicine', 'Vet', 'Check Date', 'Next Check', 'Status'],
    filteredHealth.map(function(h) {
      return [
        h.tag_id || '—',
        h.disease || '—',
        h.treatment || '—',
        h.medicine || '—',
        h.vet_name || '—',
        h.check_date ? new Date(h.check_date).toLocaleDateString() : '—',
        h.next_check_date ? new Date(h.next_check_date).toLocaleDateString() : '—',
        h.status || '—'
      ];
    })
  );

  /* ===== SECTION 3: BREEDING RECORDS ===== */
  html += buildSection('Breeding Records', 'fa-venus-mars', filteredBreeding.length,
    ['Tag ID', 'Breeding Date', 'Pregnancy Status', 'Expected Birth', 'Birth Date', 'Newborns', 'Details'],
    filteredBreeding.map(function(b) {
      return [
        b.tag_id || '—',
        b.breeding_date ? new Date(b.breeding_date).toLocaleDateString() : '—',
        b.pregnancy_status || '—',
        b.expected_birth_date ? new Date(b.expected_birth_date).toLocaleDateString() : '—',
        b.birth_date ? new Date(b.birth_date).toLocaleDateString() : '—',
        b.newborn_count || '—',
        (b.newborn_details || '—').substring(0, 50)
      ];
    })
  );

  /* ===== SECTION 4: PRODUCTION RECORDS ===== */
  html += buildSection('Production Records', 'fa-gauge', filteredProduction.length,
    ['Type', 'Tag ID', 'Quantity', 'Unit', 'Date', 'Notes'],
    filteredProduction.map(function(p) {
      return [
        p.production_type || '—',
        p.tag_id || '—',
        p.quantity || 0,
        p.unit || '—',
        p.production_date ? new Date(p.production_date).toLocaleDateString() : '—',
        (p.notes || '—').substring(0, 50)
      ];
    })
  );

  /* ===== SECTION 5: FINANCE RECORDS ===== */
  html += buildSection('Finance Records', 'fa-coins', filteredFinance.length,
    ['Type', 'Category', 'Amount', 'Date', 'Description'],
    filteredFinance.map(function(r) {
      return [
        r.type || '—',
        r.category || '—',
        '$' + (r.amount || 0).toLocaleString(),
        r.date ? new Date(r.date).toLocaleDateString() : '—',
        (r.description || '—').substring(0, 50)
      ];
    })
  );

  /* Render everything */
  container.innerHTML = html;
  console.log('REPORTS: Full report rendered');
}


/* ============================================
   BUILD A REPORT SECTION (heading + table)
   ============================================ */
function buildSection(title, icon, count, headers, rows) {
  var html = '';

  /* Section heading */
  html += '<div class="card mb-24">';
  html += '<div class="card-header">';
  html += '<h3><i class="fas ' + icon + '" style="margin-right:8px;color:var(--primary);"></i>' + title + '</h3>';
  html += '<span class="badge badge-green">' + count + ' records</span>';
  html += '</div>';
  html += '<div class="card-body" style="padding:0;">';

  if (count === 0) {
    html += '<div class="empty-state" style="padding:30px 20px;">';
    html += '<i class="fas fa-inbox"></i>';
    html += '<h3>No ' + title.toLowerCase() + ' found</h3>';
    html += '<p>No records match your current filters.</p>';
    html += '</div>';
  } else {
    html += '<div class="table-wrapper">';
    html += '<table class="data-table">';
    html += '<thead><tr>';
    headers.forEach(function(h) { html += '<th>' + h + '</th>'; });
    html += '</tr></thead>';
    html += '<tbody>';
    rows.forEach(function(row) {
      html += '<tr>';
      row.forEach(function(cell) { html += '<td>' + esc(cell) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody>';
    html += '</table>';
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}


/* ============================================
   FILTER HELPERS
   ============================================ */

/* Filter animals by tag only (no date column on animals) */
function filterAnimals(list, f) {
  return list.filter(function(a) {
    var matchTag = !f.animalTag || (a.tag_id || '') === f.animalTag;
    return matchTag;
  });
}

/* Filter any list by date range and optional tag column */
function filterByDateAndTag(list, dateCol, tagCol, f) {
  return list.filter(function(item) {
    var matchDate = true;
    if (f.dateFrom && item[dateCol]) {
      matchDate = new Date(item[dateCol]) >= new Date(f.dateFrom);
    }
    if (f.dateTo && item[dateCol]) {
      matchDate = matchDate && new Date(item[dateCol]) <= new Date(f.dateTo);
    }
    var matchTag = !f.animalTag || (item[tagCol] || '') === f.animalTag;
    return matchDate && matchTag;
  });
}

/* Filter by date range only (no tag column) */
function filterByDate(list, dateCol, f) {
  return list.filter(function(item) {
    var matchDate = true;
    if (f.dateFrom && item[dateCol]) {
      matchDate = new Date(item[dateCol]) >= new Date(f.dateFrom);
    }
    if (f.dateTo && item[dateCol]) {
      matchDate = matchDate && new Date(item[dateCol]) <= new Date(f.dateTo);
    }
    return matchDate;
  });
}


/* ============================================
   EXPORT FULL REPORT AS CSV
   Creates one CSV with all sections separated
   by blank rows and section headers.
   ============================================ */
function exportFullReportCSV() {
  var f = getFilters();
  var lines = [];

  /* Header row */
  lines.push('LIVESTOCKPRO FULL FARM REPORT');
  lines.push('Generated,' + new Date().toLocaleString());
  lines.push('');

  /* ---- Animals ---- */
  lines.push('=== ANIMALS (' + reportData.animals.length + ') ===');
  var aHeaders = ['Tag ID','Name','Species','Breed','Sex','Date of Birth','Location','Health Status'];
  lines.push(aHeaders.join(','));
  reportData.animals.forEach(function(a) {
    lines.push([
      csvCell(a.tag_id), csvCell(a.name), csvCell(a.species), csvCell(a.breed),
      csvCell(a.sex), csvCell(a.date_of_birth), csvCell(a.location), csvCell(a.health_status)
    ].join(','));
  });
  lines.push('');

  /* ---- Health ---- */
  lines.push('=== HEALTH RECORDS (' + reportData.health.length + ') ===');
  var hHeaders = ['Tag ID','Disease','Treatment','Medicine','Vet','Check Date','Next Check','Status','Notes'];
  lines.push(hHeaders.join(','));
  reportData.health.forEach(function(h) {
    lines.push([
      csvCell(h.tag_id), csvCell(h.disease), csvCell(h.treatment), csvCell(h.medicine),
      csvCell(h.vet_name), csvCell(h.check_date), csvCell(h.next_check_date),
      csvCell(h.status), csvCell(h.notes)
    ].join(','));
  });
  lines.push('');

  /* ---- Breeding ---- */
  lines.push('=== BREEDING RECORDS (' + reportData.breeding.length + ') ===');
  var bHeaders = ['Tag ID','Breeding Date','Pregnancy Status','Expected Birth','Birth Date','Newborn Count','Newborn Details','Notes'];
  lines.push(bHeaders.join(','));
  reportData.breeding.forEach(function(b) {
    lines.push([
      csvCell(b.tag_id), csvCell(b.breeding_date), csvCell(b.pregnancy_status),
      csvCell(b.expected_birth_date), csvCell(b.birth_date), csvCell(b.newborn_count),
      csvCell(b.newborn_details), csvCell(b.notes)
    ].join(','));
  });
  lines.push('');

  /* ---- Production ---- */
  lines.push('=== PRODUCTION RECORDS (' + reportData.production.length + ') ===');
  var pHeaders = ['Type','Tag ID','Quantity','Unit','Date','Notes'];
  lines.push(pHeaders.join(','));
  reportData.production.forEach(function(p) {
    lines.push([
      csvCell(p.production_type), csvCell(p.tag_id), csvCell(p.quantity),
      csvCell(p.unit), csvCell(p.production_date), csvCell(p.notes)
    ].join(','));
  });
  lines.push('');

  /* ---- Finance ---- */
  lines.push('=== FINANCE RECORDS (' + reportData.finance.length + ') ===');
  var fHeaders = ['Type','Category','Amount','Date','Description'];
  lines.push(fHeaders.join(','));
  reportData.finance.forEach(function(r) {
    lines.push([
      csvCell(r.type), csvCell(r.category), csvCell(r.amount),
      csvCell(r.date), csvCell(r.description)
    ].join(','));
  });

  /* Download */
  var csvContent = lines.join('\n');
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'full_farm_report_' + new Date().toISOString().split('T')[0] + '.csv';
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Full report exported to CSV.', 'success');
}

/* Wrap a CSV cell in quotes and escape internal quotes */
function csvCell(value) {
  if (value === null || value === undefined) return '""';
  var str = String(value).replace(/"/g, '""');
  return '"' + str + '"';
}


/* ============================================
   HELPERS
   ============================================ */
function esc(s) {
  if (s === null || s === undefined) return '—';
  var div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}