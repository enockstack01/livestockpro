import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { fmtDate, downloadCSV, csvCell } from '../lib/badges.jsx';
import { useGeoCapture, LocationCaptureBadge } from '../lib/geolocation.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { tag_id: '', production_type: 'Milk', quantity: '', unit: 'liters', production_date: '', notes: '' };
const TYPE_ICON = { Milk: 'fa-glass-water', Eggs: 'fa-egg', Meat: 'fa-drumstick-bite' };
const TYPE_BADGE = { Milk: 'badge-blue', Eggs: 'badge-orange', Meat: 'badge-green' };
const UNIT_MAP = { Milk: 'liters', Eggs: 'units', Meat: 'kg' };

export default function Production() {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const geo = useGeoCapture();
  const label = t('tables.production_records.label');
  const singular = t('tables.production_records.singular');

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch(t('records.searchPlaceholder', { label: label.toLowerCase() }), setSearch);

  async function load() {
    const { data, error } = await api.list('production_records', { order: 'production_date.desc' });
    if (error) { showToast(t('records.loadFailedSimple', { label: label.toLowerCase() }), 'error'); return; }
    setRecords(data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = records.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (p.tag_id || '').toLowerCase().includes(q) || (p.production_type || '').toLowerCase().includes(q);
    const matchType = !typeFilter || p.production_type === typeFilter;
    return matchSearch && matchType;
  });

  const summary = useMemo(() => {
    const now = new Date();
    const thisMonth = records.filter((p) => { const d = new Date(p.production_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const milk = thisMonth.filter((p) => p.production_type === 'Milk').reduce((s, p) => s + (p.quantity || 0), 0);
    const eggs = thisMonth.filter((p) => p.production_type === 'Eggs').reduce((s, p) => s + (p.quantity || 0), 0);
    const meat = thisMonth.filter((p) => p.production_type === 'Meat').reduce((s, p) => s + (p.quantity || 0), 0);
    return { milk, eggs, meat };
  }, [records]);

  function openAdd() { setEditingId(null); setForm(EMPTY_FORM); geo.capture(); setModalOpen(true); }
  function openEdit(p) {
    setEditingId(p.id);
    setForm({ tag_id: p.tag_id || '', production_type: p.production_type || 'Milk', quantity: p.quantity ?? '', unit: p.unit || 'liters', production_date: p.production_date || '', notes: p.notes || '' });
    geo.reset();
    setModalOpen(true);
  }

  async function save() {
    if (!form.production_type) { showToast(t('records.fieldRequired', { field: t('tables.production_records.fields.production_type') }), 'error'); return; }
    const payload = { ...form, quantity: parseFloat(form.quantity) || 0 };
    if (editingId) {
      const { error } = await api.update('production_records', editingId, payload);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.updated', { item: singular }), 'success');
    } else {
      if (geo.status === 'success') { payload.latitude = geo.coords.latitude; payload.longitude = geo.coords.longitude; }
      const { error } = await api.insert('production_records', [payload]);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.added', { item: singular }), 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('production_records', deletingId);
    if (error) { showToast(t('records.deleteFailed', { item: singular }), 'error'); return; }
    showToast(t('records.deleted', { item: singular }), 'success');
    setDeleteOpen(false);
    await load();
  }

  function exportCSV() {
    if (records.length === 0) { showToast(t('records.noRecordsToExport', { label: label.toLowerCase() }), 'warning'); return; }
    const headers = ['tag_id', 'production_type', 'quantity', 'unit', 'production_date', 'notes'];
    const csv = [headers.join(',')].concat(records.map((p) => headers.map((c) => csvCell(p[c])).join(','))).join('\n');
    downloadCSV(csv, 'production_records_export.csv');
    showToast(t('records.exported', { label }), 'success');
  }

  return (
    <>
      <div className="page-header">
        <div><h1>{t('productionPage.title')}</h1><p>{t('productionPage.subtitle')}</p></div>
        <div className="d-flex gap-16 flex-wrap">
          <button className="btn btn-secondary" onClick={exportCSV}><i className="fas fa-file-export"></i> {t('reports.exportCsv')}</button>
          <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> {t('productionPage.addRecord')}</button>
        </div>
      </div>

      <div className="finance-summary">
        <div className="finance-card"><h4>{t('productionPage.milkThisMonth')}</h4><div className="amount income">{summary.milk.toFixed(1)} L</div></div>
        <div className="finance-card"><h4>{t('productionPage.eggsThisMonth')}</h4><div className="amount" style={{ color: 'var(--orange)' }}>{summary.eggs} units</div></div>
        <div className="finance-card"><h4>{t('productionPage.meatThisMonth')}</h4><div className="amount" style={{ color: 'var(--primary)' }}>{summary.meat.toFixed(1)} kg</div></div>
      </div>

      <div className="filter-bar">
        <select className="form-control" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">{t('productionPage.allTypes')}</option><option value="Milk">{t('enums.productionType.Milk')}</option><option value="Eggs">{t('enums.productionType.Eggs')}</option><option value="Meat">{t('enums.productionType.Meat')}</option>
        </select>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>{t('tables.production_records.fields.production_type')}</th><th>{t('tables.production_records.fields.tag_id')}</th><th>{t('tables.production_records.fields.quantity')}</th><th>{t('tables.production_records.fields.production_date')}</th><th>{t('tables.production_records.fields.notes')}</th><th>{t('adminDashboard.colActions')}</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><i className="fas fa-gauge-high"></i><h3>{t('common.noneFound', { label })}</h3><p>{t('records.emptyListWeb', { label: label.toLowerCase() })}</p></div></td></tr>
                ) : filtered.map((p) => {
                  const notes = p.notes || '';
                  return (
                    <tr key={p.id}>
                      <td><span className={`badge ${TYPE_BADGE[p.production_type] || 'badge-green'}`}><i className={`fas ${TYPE_ICON[p.production_type] || 'fa-box'}`}></i> {t(`enums.productionType.${p.production_type}`, p.production_type)}</span></td>
                      <td>{p.tag_id || '—'}</td>
                      <td className="fw-600">{p.quantity || 0} {p.unit ? t(`enums.productionUnit.${p.unit}`, p.unit) : ''}</td>
                      <td>{fmtDate(p.production_date)}</td>
                      <td>{notes.substring(0, 35)}{notes.length > 35 ? '...' : ''}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn-icon" title={t('common.edit')} onClick={() => openEdit(p)}><i className="fas fa-pen-to-square"></i></button>
                          <button className="btn-icon danger" title={t('common.delete')} onClick={() => confirmDelete(p.id)}><i className="fas fa-trash"></i></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? t('records.editTitle', { item: singular }) : t('records.addTitle', { item: singular })}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button><button className="btn btn-primary" onClick={save}><i className="fas fa-check"></i> {t('common.save')}</button></>}
      >
        {!editingId && <LocationCaptureBadge geo={geo} />}
        <div className="form-row">
          <div className="form-group">
            <label>{t('tables.production_records.fields.production_type')} *</label>
            <select className="form-control" value={form.production_type} onChange={(e) => setForm({ ...form, production_type: e.target.value, unit: UNIT_MAP[e.target.value] || 'units' })}>
              <option value="Milk">{t('enums.productionType.Milk')}</option><option value="Eggs">{t('enums.productionType.Eggs')}</option><option value="Meat">{t('enums.productionType.Meat')}</option>
            </select>
          </div>
          <div className="form-group"><label>{t('tables.production_records.fields.tag_id')}</label><input type="text" className="form-control" placeholder={t('animalsPage.tagIdPlaceholder')} value={form.tag_id} onChange={(e) => setForm({ ...form, tag_id: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.production_records.fields.quantity')}</label><input type="number" className="form-control" placeholder="0" step="0.1" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          <div className="form-group">
            <label>{t('tables.production_records.fields.unit')}</label>
            <select className="form-control" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="liters">{t('enums.productionUnit.liters')}</option><option value="units">{t('enums.productionUnit.units')}</option><option value="kg">{t('enums.productionUnit.kg')}</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label>{t('tables.production_records.fields.production_date')}</label><input type="date" className="form-control" value={form.production_date} onChange={(e) => setForm({ ...form, production_date: e.target.value })} /></div>
        <div className="form-group"><label>{t('tables.production_records.fields.notes')}</label><textarea className="form-control" placeholder={t('common.notesPlaceholder')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('common.confirmDelete')} maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> {t('common.delete')}</button></>}
      >
        <p className="text-muted">{t('productionPage.confirmDeleteMessage')}</p>
      </Modal>
    </>
  );
}
