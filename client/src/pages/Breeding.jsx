import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { PregnancyBadge, fmtDate } from '../lib/badges.jsx';
import { useGeoCapture, LocationCaptureBadge } from '../lib/geolocation.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { tag_id: '', breeding_date: '', pregnancy_status: 'Not Confirmed', expected_birth_date: '', birth_date: '', newborn_count: '', newborn_details: '', notes: '' };

export default function Breeding() {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const geo = useGeoCapture();
  const label = t('tables.breeding_records.label');
  const singular = t('tables.breeding_records.singular');

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch(t('records.searchPlaceholder', { label: label.toLowerCase() }), setSearch);

  async function load() {
    const { data, error } = await api.list('breeding_records', { order: 'breeding_date.desc' });
    if (error) { showToast(t('records.loadFailedSimple', { label: label.toLowerCase() }), 'error'); return; }
    setRecords(data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = records.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (b.tag_id || '').toLowerCase().includes(q) || (b.pregnancy_status || '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || b.pregnancy_status === statusFilter;
    return matchSearch && matchStatus;
  });

  function openAdd() { setEditingId(null); setForm(EMPTY_FORM); geo.capture(); setModalOpen(true); }
  function openEdit(b) {
    setEditingId(b.id);
    setForm({ tag_id: b.tag_id || '', breeding_date: b.breeding_date || '', pregnancy_status: b.pregnancy_status || 'Not Confirmed', expected_birth_date: b.expected_birth_date || '', birth_date: b.birth_date || '', newborn_count: b.newborn_count ?? '', newborn_details: b.newborn_details || '', notes: b.notes || '' });
    geo.reset();
    setModalOpen(true);
  }

  async function save() {
    if (!form.tag_id) { showToast(t('records.fieldRequired', { field: t('tables.breeding_records.fields.tag_id') }), 'error'); return; }
    const payload = { ...form, newborn_count: parseInt(form.newborn_count, 10) || 0 };
    if (editingId) {
      const { error } = await api.update('breeding_records', editingId, payload);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.updated', { item: singular }), 'success');
    } else {
      if (geo.status === 'success') { payload.latitude = geo.coords.latitude; payload.longitude = geo.coords.longitude; }
      const { error } = await api.insert('breeding_records', [payload]);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.added', { item: singular }), 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('breeding_records', deletingId);
    if (error) { showToast(t('records.deleteFailed', { item: singular }), 'error'); return; }
    showToast(t('records.deleted', { item: singular }), 'success');
    setDeleteOpen(false);
    await load();
  }

  return (
    <>
      <div className="page-header">
        <div><h1>{t('breedingPage.title')}</h1><p>{t('breedingPage.subtitle')}</p></div>
        <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> {t('breedingPage.addRecord')}</button>
      </div>

      <div className="filter-bar">
        <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t('breedingPage.allStatuses')}</option>
          <option value="Pregnant">{t('enums.pregnancyStatus.Pregnant')}</option>
          <option value="Not Confirmed">{t('enums.pregnancyStatus.Not Confirmed')}</option>
          <option value="Not Pregnant">{t('enums.pregnancyStatus.Not Pregnant')}</option>
          <option value="Delivered">{t('enums.pregnancyStatus.Delivered')}</option>
        </select>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>{t('tables.breeding_records.fields.tag_id')}</th><th>{t('tables.breeding_records.fields.breeding_date')}</th><th>{t('tables.breeding_records.fields.pregnancy_status')}</th><th>{t('tables.breeding_records.fields.expected_birth_date')}</th><th>{t('tables.breeding_records.fields.birth_date')}</th><th>{t('tables.breeding_records.fields.newborn_count')}</th><th>{t('tables.breeding_records.fields.newborn_details')}</th><th>{t('adminDashboard.colActions')}</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state"><i className="fas fa-venus-mars"></i><h3>{t('common.noneFound', { label })}</h3><p>{t('records.emptyListWeb', { label: label.toLowerCase() })}</p></div></td></tr>
                ) : filtered.map((b) => {
                  const details = (b.newborn_details || '');
                  return (
                    <tr key={b.id}>
                      <td className="fw-600">{b.tag_id || '—'}</td>
                      <td>{fmtDate(b.breeding_date)}</td>
                      <td><PregnancyBadge status={b.pregnancy_status} /></td>
                      <td>{fmtDate(b.expected_birth_date)}</td>
                      <td>{fmtDate(b.birth_date)}</td>
                      <td>{b.newborn_count || '—'}</td>
                      <td>{details.substring(0, 40)}{details.length > 40 ? '...' : ''}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn-icon" title={t('common.edit')} onClick={() => openEdit(b)}><i className="fas fa-pen-to-square"></i></button>
                          <button className="btn-icon danger" title={t('common.delete')} onClick={() => confirmDelete(b.id)}><i className="fas fa-trash"></i></button>
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
        <div className="form-group"><label>{t('tables.breeding_records.fields.tag_id')} *</label><input type="text" className="form-control" placeholder={t('animalsPage.tagIdPlaceholder')} value={form.tag_id} onChange={(e) => setForm({ ...form, tag_id: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.breeding_records.fields.breeding_date')}</label><input type="date" className="form-control" value={form.breeding_date} onChange={(e) => setForm({ ...form, breeding_date: e.target.value })} /></div>
          <div className="form-group">
            <label>{t('tables.breeding_records.fields.pregnancy_status')}</label>
            <select className="form-control" value={form.pregnancy_status} onChange={(e) => setForm({ ...form, pregnancy_status: e.target.value })}>
              <option value="Not Confirmed">{t('enums.pregnancyStatus.Not Confirmed')}</option><option value="Pregnant">{t('enums.pregnancyStatus.Pregnant')}</option><option value="Not Pregnant">{t('enums.pregnancyStatus.Not Pregnant')}</option><option value="Delivered">{t('enums.pregnancyStatus.Delivered')}</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.breeding_records.fields.expected_birth_date')}</label><input type="date" className="form-control" value={form.expected_birth_date} onChange={(e) => setForm({ ...form, expected_birth_date: e.target.value })} /></div>
          <div className="form-group"><label>{t('tables.breeding_records.fields.birth_date')}</label><input type="date" className="form-control" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>{t('tables.breeding_records.fields.newborn_count')}</label><input type="number" className="form-control" placeholder="0" min="0" value={form.newborn_count} onChange={(e) => setForm({ ...form, newborn_count: e.target.value })} /></div>
        <div className="form-group"><label>{t('tables.breeding_records.fields.newborn_details')}</label><textarea className="form-control" placeholder={t('breedingPage.newbornDetailsPlaceholder')} value={form.newborn_details} onChange={(e) => setForm({ ...form, newborn_details: e.target.value })} /></div>
        <div className="form-group"><label>{t('tables.breeding_records.fields.notes')}</label><textarea className="form-control" placeholder={t('common.notesPlaceholder')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('common.confirmDelete')} maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> {t('common.delete')}</button></>}
      >
        <p className="text-muted">{t('breedingPage.confirmDeleteMessage')}</p>
      </Modal>
    </>
  );
}
