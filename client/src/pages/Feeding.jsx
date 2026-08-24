import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { fmtDate } from '../lib/badges.jsx';
import { useGeoCapture, LocationCaptureBadge } from '../lib/geolocation.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { feed_type: '', quantity: '', unit: 'kg', cost: '', feeding_date: '', animal_group: '', notes: '' };

export default function Feeding() {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const geo = useGeoCapture();
  const label = t('tables.feeding_records.label');
  const singular = t('tables.feeding_records.singular');

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch(t('records.searchPlaceholder', { label: label.toLowerCase() }), setSearch);

  async function load() {
    const { data, error } = await api.list('feeding_records', { order: 'feeding_date.desc' });
    if (error) { showToast(t('records.loadFailedSimple', { label: label.toLowerCase() }), 'error'); return; }
    setRecords(data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = records.filter((f) => {
    const q = search.toLowerCase();
    return !q || (f.feed_type || '').toLowerCase().includes(q) || (f.animal_group || '').toLowerCase().includes(q);
  });

  const lowStockAlerts = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent = records.filter((f) => new Date(f.feeding_date) >= thirtyDaysAgo);
    const groups = {};
    recent.forEach((f) => {
      if (!groups[f.feed_type]) groups[f.feed_type] = { totalQty: 0, count: 0 };
      groups[f.feed_type].totalQty += f.quantity || 0;
      groups[f.feed_type].count++;
    });
    return Object.entries(groups).filter(([, info]) => info.count <= 2).map(([type, info]) => ({ type, count: info.count }));
  }, [records]);

  function openAdd() { setEditingId(null); setForm(EMPTY_FORM); geo.capture(); setModalOpen(true); }
  function openEdit(f) {
    setEditingId(f.id);
    setForm({ feed_type: f.feed_type || '', quantity: f.quantity ?? '', unit: f.unit || 'kg', cost: f.cost ?? '', feeding_date: f.feeding_date || '', animal_group: f.animal_group || '', notes: f.notes || '' });
    geo.reset();
    setModalOpen(true);
  }

  async function save() {
    if (!form.feed_type) { showToast(t('records.fieldRequired', { field: t('tables.feeding_records.fields.feed_type') }), 'error'); return; }
    const payload = { ...form, quantity: parseFloat(form.quantity) || 0, cost: parseFloat(form.cost) || 0 };
    if (editingId) {
      const { error } = await api.update('feeding_records', editingId, payload);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.updated', { item: singular }), 'success');
    } else {
      if (geo.status === 'success') { payload.latitude = geo.coords.latitude; payload.longitude = geo.coords.longitude; }
      const { error } = await api.insert('feeding_records', [payload]);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.added', { item: singular }), 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('feeding_records', deletingId);
    if (error) { showToast(t('records.deleteFailed', { item: singular }), 'error'); return; }
    showToast(t('records.deleted', { item: singular }), 'success');
    setDeleteOpen(false);
    await load();
  }

  return (
    <>
      <div className="page-header">
        <div><h1>{t('feedingPage.title')}</h1><p>{t('feedingPage.subtitle')}</p></div>
        <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> {t('feedingPage.addRecord')}</button>
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3><i className="fas fa-triangle-exclamation text-orange"></i> {t('feedingPage.stockAlerts')}</h3></div>
        <div className="card-body">
          {lowStockAlerts.length === 0
            ? <span className="badge badge-green"><i className="fas fa-check"></i> {t('feedingPage.allFeedLevelsNormal')}</span>
            : lowStockAlerts.map(({ type, count }) => (
              <span key={type} className="badge badge-orange" style={{ marginRight: 8 }}><i className="fas fa-exclamation-triangle"></i> {t('feedingPage.lowUsageDetected', { type, count })}</span>
            ))}
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>{t('tables.feeding_records.fields.feed_type')}</th><th>{t('tables.feeding_records.fields.quantity')}</th><th>{t('tables.feeding_records.fields.cost')}</th><th>{t('tables.feeding_records.fields.feeding_date')}</th><th>{t('tables.feeding_records.fields.animal_group')}</th><th>{t('tables.feeding_records.fields.notes')}</th><th>{t('adminDashboard.colActions')}</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><i className="fas fa-wheat-awn"></i><h3>{t('common.noneFound', { label })}</h3><p>{t('records.emptyListWeb', { label: label.toLowerCase() })}</p></div></td></tr>
                ) : filtered.map((f) => (
                  <tr key={f.id}>
                    <td className="fw-600">{f.feed_type}</td>
                    <td>{f.quantity || '—'} {f.unit ? t(`enums.feedingUnit.${f.unit}`, f.unit) : ''}</td>
                    <td>${(f.cost || 0).toFixed(2)}</td>
                    <td>{fmtDate(f.feeding_date)}</td>
                    <td>{f.animal_group || '—'}</td>
                    <td>{f.notes || '—'}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn-icon" title={t('common.edit')} onClick={() => openEdit(f)}><i className="fas fa-pen-to-square"></i></button>
                        <button className="btn-icon danger" title={t('common.delete')} onClick={() => confirmDelete(f.id)}><i className="fas fa-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                ))}
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
        <div className="form-group"><label>{t('tables.feeding_records.fields.feed_type')} *</label><input type="text" className="form-control" placeholder={t('feedingPage.feedTypePlaceholder')} value={form.feed_type} onChange={(e) => setForm({ ...form, feed_type: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.feeding_records.fields.quantity')}</label><input type="number" className="form-control" placeholder="0" step="0.1" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          <div className="form-group">
            <label>{t('tables.feeding_records.fields.unit')}</label>
            <select className="form-control" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="kg">{t('enums.feedingUnit.kg')}</option><option value="lbs">{t('enums.feedingUnit.lbs')}</option><option value="tons">{t('enums.feedingUnit.tons')}</option><option value="bags">{t('enums.feedingUnit.bags')}</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.feeding_records.fields.cost')} ($)</label><input type="number" className="form-control" placeholder="0.00" step="0.01" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
          <div className="form-group"><label>{t('tables.feeding_records.fields.feeding_date')}</label><input type="date" className="form-control" value={form.feeding_date} onChange={(e) => setForm({ ...form, feeding_date: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>{t('tables.feeding_records.fields.animal_group')}</label><input type="text" className="form-control" placeholder={t('feedingPage.animalGroupPlaceholder')} value={form.animal_group} onChange={(e) => setForm({ ...form, animal_group: e.target.value })} /></div>
        <div className="form-group"><label>{t('tables.feeding_records.fields.notes')}</label><textarea className="form-control" placeholder={t('common.notesPlaceholder')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('common.confirmDelete')} maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> {t('common.delete')}</button></>}
      >
        <p className="text-muted">{t('feedingPage.confirmDeleteMessage')}</p>
      </Modal>
    </>
  );
}
