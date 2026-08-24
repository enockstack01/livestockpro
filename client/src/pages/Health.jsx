import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { StatusBadge, fmtDate, downloadCSV, csvCell } from '../lib/badges.jsx';
import { useGeoCapture, LocationCaptureBadge } from '../lib/geolocation.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { tag_id: '', disease: '', treatment: '', medicine: '', vet_name: '', check_date: '', next_check_date: '', status: 'Under Treatment', notes: '' };

export default function Health() {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const geo = useGeoCapture();
  const label = t('tables.health_records.label');
  const singular = t('tables.health_records.singular');

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch(t('records.searchPlaceholder', { label: label.toLowerCase() }), setSearch);

  async function load() {
    const { data, error } = await api.list('health_records', { order: 'check_date.desc' });
    if (error) { showToast(t('records.loadFailed', { label: label.toLowerCase(), message: error.message }), 'error'); return; }
    setRecords(data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = records.filter((h) => {
    const q = search.toLowerCase();
    return !q || [h.tag_id, h.disease, h.treatment, h.vet_name].some((v) => (v || '').toLowerCase().includes(q));
  });

  function openAdd() { setEditingId(null); setForm(EMPTY_FORM); geo.capture(); setModalOpen(true); }
  function openEdit(h) {
    setEditingId(h.id);
    setForm({ tag_id: h.tag_id || '', disease: h.disease || '', treatment: h.treatment || '', medicine: h.medicine || '', vet_name: h.vet_name || '', check_date: h.check_date || '', next_check_date: h.next_check_date || '', status: h.status || 'Under Treatment', notes: h.notes || '' });
    geo.reset();
    setModalOpen(true);
  }

  async function save() {
    if (!form.tag_id) { showToast(t('records.fieldRequired', { field: t('tables.animals.fields.tag_id') }), 'error'); return; }
    if (editingId) {
      const { error } = await api.update('health_records', editingId, form);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.updated', { item: singular }), 'success');
    } else {
      const payload = geo.status === 'success' ? { ...form, latitude: geo.coords.latitude, longitude: geo.coords.longitude } : form;
      const { error } = await api.insert('health_records', [payload]);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.added', { item: singular }), 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('health_records', deletingId);
    if (error) { showToast(t('records.deleteFailed', { item: singular }), 'error'); return; }
    showToast(t('records.deleted', { item: singular }), 'success');
    setDeleteOpen(false);
    await load();
  }

  function exportCSV() {
    if (records.length === 0) { showToast(t('records.noRecordsToExport', { label: label.toLowerCase() }), 'warning'); return; }
    const headers = ['tag_id', 'disease', 'treatment', 'medicine', 'vet_name', 'check_date', 'next_check_date', 'status', 'notes'];
    const csv = headers.join(',') + '\n' + records.map((h) => headers.map((c) => csvCell(h[c])).join(',')).join('\n');
    downloadCSV(csv, 'health_records_export.csv');
    showToast(t('records.exported', { label }), 'success');
  }

  return (
    <>
      <div className="page-header">
        <div><h1>{t('healthPage.title')}</h1><p>{t('healthPage.subtitle')}</p></div>
        <div className="d-flex gap-16 flex-wrap">
          <button className="btn btn-secondary" onClick={exportCSV}><i className="fas fa-file-export"></i> {t('reports.exportCsv')}</button>
          <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> {t('healthPage.addRecord')}</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>{t('tables.animals.fields.tag_id')}</th><th>{t('tables.health_records.fields.disease')}</th><th>{t('tables.health_records.fields.treatment')}</th><th>{t('tables.health_records.fields.medicine')}</th><th>{t('tables.health_records.fields.vet_name')}</th><th>{t('tables.health_records.fields.check_date')}</th><th>{t('tables.health_records.fields.next_check_date')}</th><th>{t('tables.health_records.fields.status')}</th><th>{t('adminDashboard.colActions')}</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state"><i className="fas fa-stethoscope"></i><h3>{t('common.noneFound', { label })}</h3><p>{t('records.emptyListWeb', { label: label.toLowerCase() })}</p></div></td></tr>
                ) : filtered.map((h) => (
                  <tr key={h.id}>
                    <td className="fw-600">{h.tag_id || '—'}</td>
                    <td>{h.disease || '—'}</td>
                    <td>{h.treatment || '—'}</td>
                    <td>{h.medicine || '—'}</td>
                    <td>{h.vet_name || '—'}</td>
                    <td>{fmtDate(h.check_date)}</td>
                    <td>{fmtDate(h.next_check_date)}</td>
                    <td><StatusBadge status={h.status} /></td>
                    <td>
                      <div className="table-actions">
                        <button className="btn-icon" title={t('common.edit')} onClick={() => openEdit(h)}><i className="fas fa-pen-to-square"></i></button>
                        <button className="btn-icon danger" title={t('common.delete')} onClick={() => confirmDelete(h.id)}><i className="fas fa-trash"></i></button>
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
        <div className="form-group"><label>{t('tables.health_records.fields.tag_id')} *</label><input type="text" className="form-control" placeholder={t('animalsPage.tagIdPlaceholder')} value={form.tag_id} onChange={(e) => setForm({ ...form, tag_id: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.health_records.fields.disease')}</label><input type="text" className="form-control" placeholder={t('healthPage.diseasePlaceholder')} value={form.disease} onChange={(e) => setForm({ ...form, disease: e.target.value })} /></div>
          <div className="form-group">
            <label>{t('tables.health_records.fields.status')}</label>
            <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Under Treatment">{t('enums.healthRecordStatus.Under Treatment')}</option><option value="Healthy">{t('enums.healthRecordStatus.Healthy')}</option><option value="Critical">{t('enums.healthRecordStatus.Critical')}</option><option value="Recovered">{t('enums.healthRecordStatus.Recovered')}</option><option value="Deceased">{t('enums.healthRecordStatus.Deceased')}</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label>{t('tables.health_records.fields.treatment')}</label><textarea className="form-control" placeholder={t('healthPage.treatmentPlaceholder')} value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })} /></div>
        <div className="form-group"><label>{t('tables.health_records.fields.medicine')}</label><input type="text" className="form-control" placeholder={t('healthPage.medicinePlaceholder')} value={form.medicine} onChange={(e) => setForm({ ...form, medicine: e.target.value })} /></div>
        <div className="form-group"><label>{t('tables.health_records.fields.vet_name')}</label><input type="text" className="form-control" placeholder={t('healthPage.vetNamePlaceholder')} value={form.vet_name} onChange={(e) => setForm({ ...form, vet_name: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.health_records.fields.check_date')}</label><input type="date" className="form-control" value={form.check_date} onChange={(e) => setForm({ ...form, check_date: e.target.value })} /></div>
          <div className="form-group"><label>{t('tables.health_records.fields.next_check_date')}</label><input type="date" className="form-control" value={form.next_check_date} onChange={(e) => setForm({ ...form, next_check_date: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>{t('tables.health_records.fields.notes')}</label><textarea className="form-control" placeholder={t('common.notesPlaceholder')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('common.confirmDelete')} maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> {t('common.delete')}</button></>}
      >
        <p className="text-muted">{t('healthPage.confirmDeleteMessage')}</p>
      </Modal>
    </>
  );
}
