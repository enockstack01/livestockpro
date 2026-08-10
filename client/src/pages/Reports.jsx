import { useEffect, useState } from 'react';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { fmtDate, downloadCSV, csvCell } from '../lib/badges.jsx';

export default function Reports() {
  const api = useApi();
  const showToast = useToast();

  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [animalTag, setAnimalTag] = useState('');

  async function loadAll() {
    const [r1, r2, r3, r4, r5] = await Promise.all([
      api.list('animals'), api.list('health_records'), api.list('breeding_records'),
      api.list('production_records'), api.list('finance_records')
    ]);
    setData({ animals: r1.data || [], health: r2.data || [], breeding: r3.data || [], production: r4.data || [], finance: r5.data || [] });
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
    showToast('Report refreshed.', 'success');
  }

  function exportFullReportCSV() {
    if (!data) return;
    const lines = [];
    lines.push('LIVESTOCKPRO FULL FARM REPORT');
    lines.push('Generated,' + new Date().toLocaleString());
    lines.push('');

    lines.push(`=== ANIMALS (${data.animals.length}) ===`);
    lines.push(['Tag ID', 'Name', 'Species', 'Breed', 'Sex', 'Date of Birth', 'Location', 'Health Status'].join(','));
    data.animals.forEach((a) => lines.push([csvCell(a.tag_id), csvCell(a.name), csvCell(a.species), csvCell(a.breed), csvCell(a.sex), csvCell(a.date_of_birth), csvCell(a.location), csvCell(a.health_status)].join(',')));
    lines.push('');

    lines.push(`=== HEALTH RECORDS (${data.health.length}) ===`);
    lines.push(['Tag ID', 'Disease', 'Treatment', 'Medicine', 'Vet', 'Check Date', 'Next Check', 'Status', 'Notes'].join(','));
    data.health.forEach((h) => lines.push([csvCell(h.tag_id), csvCell(h.disease), csvCell(h.treatment), csvCell(h.medicine), csvCell(h.vet_name), csvCell(h.check_date), csvCell(h.next_check_date), csvCell(h.status), csvCell(h.notes)].join(',')));
    lines.push('');

    lines.push(`=== BREEDING RECORDS (${data.breeding.length}) ===`);
    lines.push(['Tag ID', 'Breeding Date', 'Pregnancy Status', 'Expected Birth', 'Birth Date', 'Newborn Count', 'Newborn Details', 'Notes'].join(','));
    data.breeding.forEach((b) => lines.push([csvCell(b.tag_id), csvCell(b.breeding_date), csvCell(b.pregnancy_status), csvCell(b.expected_birth_date), csvCell(b.birth_date), csvCell(b.newborn_count), csvCell(b.newborn_details), csvCell(b.notes)].join(',')));
    lines.push('');

    lines.push(`=== PRODUCTION RECORDS (${data.production.length}) ===`);
    lines.push(['Type', 'Tag ID', 'Quantity', 'Unit', 'Date', 'Notes'].join(','));
    data.production.forEach((p) => lines.push([csvCell(p.production_type), csvCell(p.tag_id), csvCell(p.quantity), csvCell(p.unit), csvCell(p.production_date), csvCell(p.notes)].join(',')));
    lines.push('');

    lines.push(`=== FINANCE RECORDS (${data.finance.length}) ===`);
    lines.push(['Type', 'Category', 'Amount', 'Date', 'Description'].join(','));
    data.finance.forEach((r) => lines.push([csvCell(r.type), csvCell(r.category), csvCell(r.amount), csvCell(r.date), csvCell(r.description)].join(',')));

    downloadCSV(lines.join('\n'), 'full_farm_report_' + new Date().toISOString().split('T')[0] + '.csv');
    showToast('Full report exported to CSV.', 'success');
  }

  if (!data) return null;

  const filters = { dateFrom, dateTo, animalTag };
  const filterByDateAndTag = (list, dateCol, tagCol) => list.filter((item) => {
    let matchDate = true;
    if (filters.dateFrom && item[dateCol]) matchDate = new Date(item[dateCol]) >= new Date(filters.dateFrom);
    if (filters.dateTo && item[dateCol]) matchDate = matchDate && new Date(item[dateCol]) <= new Date(filters.dateTo);
    const matchTag = !filters.animalTag || (item[tagCol] || '') === filters.animalTag;
    return matchDate && matchTag;
  });
  const filterByDate = (list, dateCol) => list.filter((item) => {
    let matchDate = true;
    if (filters.dateFrom && item[dateCol]) matchDate = new Date(item[dateCol]) >= new Date(filters.dateFrom);
    if (filters.dateTo && item[dateCol]) matchDate = matchDate && new Date(item[dateCol]) <= new Date(filters.dateTo);
    return matchDate;
  });

  const filteredAnimals = data.animals.filter((a) => !filters.animalTag || (a.tag_id || '') === filters.animalTag);
  const filteredHealth = filterByDateAndTag(data.health, 'check_date', 'tag_id');
  const filteredBreeding = filterByDateAndTag(data.breeding, 'breeding_date', 'tag_id');
  const filteredProduction = filterByDateAndTag(data.production, 'production_date', 'tag_id');
  const filteredFinance = filterByDate(data.finance, 'date');

  const totalAnimals = data.animals.length;
  const healthyCount = data.animals.filter((a) => a.health_status === 'Healthy').length;
  const treatmentCount = data.animals.filter((a) => a.health_status === 'Under Treatment').length;
  const criticalCount = data.animals.filter((a) => a.health_status === 'Critical').length;
  const pregnantCount = data.breeding.filter((b) => b.pregnancy_status === 'Pregnant').length;
  const totalIncome = data.finance.filter((r) => r.type === 'Income').reduce((s, r) => s + (r.amount || 0), 0);
  const totalExpense = data.finance.filter((r) => r.type === 'Expense').reduce((s, r) => s + (r.amount || 0), 0);
  const netProfit = totalIncome - totalExpense;
  const milkTotal = data.production.filter((p) => p.production_type === 'Milk').reduce((s, p) => s + (p.quantity || 0), 0);
  const eggsTotal = data.production.filter((p) => p.production_type === 'Eggs').reduce((s, p) => s + (p.quantity || 0), 0);
  const meatTotal = data.production.filter((p) => p.production_type === 'Meat').reduce((s, p) => s + (p.quantity || 0), 0);

  const now = new Date();
  const timestamp = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString();

  return (
    <>
      <div className="page-header">
        <div><h1>Full Farm Report</h1><p>Complete overview of all your farm data</p></div>
        <div className="d-flex gap-16 flex-wrap no-print">
          <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <><i className="fas fa-spinner fa-spin"></i> Loading...</> : <><i className="fas fa-rotate"></i> Refresh</>}
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()}><i className="fas fa-print"></i> Print</button>
          <button className="btn btn-primary" onClick={exportFullReportCSV}><i className="fas fa-file-export"></i> Export CSV</button>
        </div>
      </div>

      <div className="card mb-24 no-print">
        <div className="card-body">
          <div className="filter-bar" style={{ marginBottom: 0 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ marginBottom: 4 }}>From Date</label>
              <input type="date" className="form-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ marginBottom: 4 }}>To Date</label>
              <input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
              <label style={{ marginBottom: 4 }}>Animal Tag</label>
              <input type="text" className="form-control" placeholder="Filter by tag ID" value={animalTag} onChange={(e) => setAnimalTag(e.target.value)} />
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-end', marginTop: 'auto' }} onClick={() => showToast('Filters applied.', 'info')}>
              <i className="fas fa-filter"></i> Apply Filter
            </button>
          </div>
        </div>
      </div>

      <div id="reportOutput">
        <div className="mb-24" style={{ borderBottom: '2px solid var(--primary)', paddingBottom: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary-dark)', marginBottom: 4 }}>LivestockPro Farm Report</h2>
          <p className="text-muted" style={{ fontSize: 13 }}>
            Generated on {timestamp}
            {(dateFrom || dateTo || animalTag) && <> &middot; Filtered: {dateFrom && `From ${dateFrom} `}{dateTo && `To ${dateTo} `}{animalTag && `Tag: ${animalTag}`}</>}
          </p>
        </div>

        <div className="finance-summary mb-24">
          <div className="finance-card"><h4>Total Animals</h4><div className="amount" style={{ color: 'var(--text)' }}>{totalAnimals}</div></div>
          <div className="finance-card"><h4>Healthy</h4><div className="amount income">{healthyCount}</div></div>
          <div className="finance-card"><h4>Under Treatment</h4><div className="amount expense">{treatmentCount}</div></div>
          <div className="finance-card"><h4>Critical</h4><div className="amount loss">{criticalCount}</div></div>
          <div className="finance-card"><h4>Pregnant</h4><div className="amount" style={{ color: 'var(--purple)' }}>{pregnantCount}</div></div>
          <div className="finance-card"><h4>Total Income</h4><div className="amount income">${totalIncome.toLocaleString()}</div></div>
          <div className="finance-card"><h4>Total Expenses</h4><div className="amount expense">${totalExpense.toLocaleString()}</div></div>
          <div className="finance-card"><h4>Net Profit</h4><div className={`amount ${netProfit >= 0 ? 'profit' : 'loss'}`}>${netProfit.toLocaleString()}</div></div>
        </div>

        <div className="finance-summary mb-24">
          <div className="finance-card"><h4>Milk Produced</h4><div className="amount income">{milkTotal.toFixed(1)} L</div></div>
          <div className="finance-card"><h4>Eggs Collected</h4><div className="amount" style={{ color: 'var(--orange)' }}>{eggsTotal} units</div></div>
          <div className="finance-card"><h4>Meat Produced</h4><div className="amount" style={{ color: 'var(--primary)' }}>{meatTotal.toFixed(1)} kg</div></div>
        </div>

        <ReportSection title="Animals" icon="fa-cow" count={filteredAnimals.length}
          headers={['Tag ID', 'Name', 'Species', 'Breed', 'Sex', 'Date of Birth', 'Location', 'Health Status']}
          rows={filteredAnimals.map((a) => [a.tag_id, a.name || '—', a.species, a.breed || '—', a.sex || '—', fmtDate(a.date_of_birth), a.location || '—', a.health_status])} />

        <ReportSection title="Health Records" icon="fa-stethoscope" count={filteredHealth.length}
          headers={['Tag ID', 'Disease', 'Treatment', 'Medicine', 'Vet', 'Check Date', 'Next Check', 'Status']}
          rows={filteredHealth.map((h) => [h.tag_id || '—', h.disease || '—', h.treatment || '—', h.medicine || '—', h.vet_name || '—', fmtDate(h.check_date), fmtDate(h.next_check_date), h.status || '—'])} />

        <ReportSection title="Breeding Records" icon="fa-venus-mars" count={filteredBreeding.length}
          headers={['Tag ID', 'Breeding Date', 'Pregnancy Status', 'Expected Birth', 'Birth Date', 'Newborns', 'Details']}
          rows={filteredBreeding.map((b) => [b.tag_id || '—', fmtDate(b.breeding_date), b.pregnancy_status || '—', fmtDate(b.expected_birth_date), fmtDate(b.birth_date), b.newborn_count || '—', (b.newborn_details || '—').substring(0, 50)])} />

        <ReportSection title="Production Records" icon="fa-gauge" count={filteredProduction.length}
          headers={['Type', 'Tag ID', 'Quantity', 'Unit', 'Date', 'Notes']}
          rows={filteredProduction.map((p) => [p.production_type || '—', p.tag_id || '—', p.quantity || 0, p.unit || '—', fmtDate(p.production_date), (p.notes || '—').substring(0, 50)])} />

        <ReportSection title="Finance Records" icon="fa-coins" count={filteredFinance.length}
          headers={['Type', 'Category', 'Amount', 'Date', 'Description']}
          rows={filteredFinance.map((r) => [r.type || '—', r.category || '—', '$' + (r.amount || 0).toLocaleString(), fmtDate(r.date), (r.description || '—').substring(0, 50)])} />
      </div>
    </>
  );
}

function ReportSection({ title, icon, count, headers, rows }) {
  return (
    <div className="card mb-24">
      <div className="card-header">
        <h3><i className={`fas ${icon}`} style={{ marginRight: 8, color: 'var(--primary)' }}></i>{title}</h3>
        <span className="badge badge-green">{count} records</span>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        {count === 0 ? (
          <div className="empty-state" style={{ padding: '30px 20px' }}>
            <i className="fas fa-inbox"></i>
            <h3>No {title.toLowerCase()} found</h3>
            <p>No records match your current filters.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
