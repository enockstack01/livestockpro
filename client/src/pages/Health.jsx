import { useEffect, useState } from 'react';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { StatusBadge, fmtDate, downloadCSV, csvCell } from '../lib/badges.jsx';
import { useGeoCapture, LocationCaptureBadge } from '../lib/geolocation.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { tag_id: '', disease: '', treatment: '', medicine: '', vet_name: '', check_date: '', next_check_date: '', status: 'Under Treatment', notes: '' };

export default function Health() {
  const api = useApi();
  const showToast = useToast();
  const geo = useGeoCapture();

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch('Search health records...', setSearch);

  async function load() {
    const { data, error } = await api.list('health_records', { order: 'check_date.desc' });
    if (error) { showToast('Failed to load: ' + error.message, 'error'); return; }
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
    if (!form.tag_id) { showToast('Tag ID is required.', 'error'); return; }
    if (editingId) {
      const { error } = await api.update('health_records', editingId, form);
      if (error) { showToast('Update failed: ' + error.message, 'error'); return; }
      showToast('Health record updated.', 'success');
    } else {
      const payload = geo.status === 'success' ? { ...form, latitude: geo.coords.latitude, longitude: geo.coords.longitude } : form;
      const { error } = await api.insert('health_records', [payload]);
      if (error) { showToast('Insert failed: ' + error.message, 'error'); return; }
      showToast('Health record added.', 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('health_records', deletingId);
    if (error) { showToast('Delete failed.', 'error'); return; }
    showToast('Health record deleted.', 'success');
    setDeleteOpen(false);
    await load();
  }

  function exportCSV() {
    if (records.length === 0) { showToast('No records to export.', 'warning'); return; }
    const headers = ['tag_id', 'disease', 'treatment', 'medicine', 'vet_name', 'check_date', 'next_check_date', 'status', 'notes'];
    const csv = headers.join(',') + '\n' + records.map((h) => headers.map((c) => csvCell(h[c])).join(',')).join('\n');
    downloadCSV(csv, 'health_records_export.csv');
    showToast('Health records exported.', 'success');
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Health Records</h1><p>Track diseases, treatments, and veterinary visits</p></div>
        <div className="d-flex gap-16 flex-wrap">
          <button className="btn btn-secondary" onClick={exportCSV}><i className="fas fa-file-export"></i> Export CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> Add Record</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Tag ID</th><th>Disease</th><th>Treatment</th><th>Medicine</th><th>Vet</th><th>Check Date</th><th>Next Check</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state"><i className="fas fa-stethoscope"></i><h3>No health records</h3><p>Add a health record to get started.</p></div></td></tr>
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
                        <button className="btn-icon" title="Edit" onClick={() => openEdit(h)}><i className="fas fa-pen-to-square"></i></button>
                        <button className="btn-icon danger" title="Delete" onClick={() => confirmDelete(h.id)}><i className="fas fa-trash"></i></button>
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
        open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Health Record' : 'Add Health Record'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save}><i className="fas fa-check"></i> Save</button></>}
      >
        {!editingId && <LocationCaptureBadge geo={geo} />}
        <div className="form-group"><label>Animal Tag ID *</label><input type="text" className="form-control" placeholder="e.g. COW-001" value={form.tag_id} onChange={(e) => setForm({ ...form, tag_id: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>Disease / Condition</label><input type="text" className="form-control" placeholder="e.g. Mastitis" value={form.disease} onChange={(e) => setForm({ ...form, disease: e.target.value })} /></div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Under Treatment">Under Treatment</option><option value="Healthy">Healthy</option><option value="Critical">Critical</option><option value="Recovered">Recovered</option><option value="Deceased">Deceased</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label>Treatment</label><textarea className="form-control" placeholder="Treatment description..." value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })} /></div>
        <div className="form-group"><label>Medicine Used</label><input type="text" className="form-control" placeholder="e.g. Penicillin 500mg" value={form.medicine} onChange={(e) => setForm({ ...form, medicine: e.target.value })} /></div>
        <div className="form-group"><label>Vet Name</label><input type="text" className="form-control" placeholder="Veterinarian name" value={form.vet_name} onChange={(e) => setForm({ ...form, vet_name: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>Check Date</label><input type="date" className="form-control" value={form.check_date} onChange={(e) => setForm({ ...form, check_date: e.target.value })} /></div>
          <div className="form-group"><label>Next Check Date</label><input type="date" className="form-control" value={form.next_check_date} onChange={(e) => setForm({ ...form, next_check_date: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>Notes</label><textarea className="form-control" placeholder="Additional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Confirm Delete" maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> Delete</button></>}
      >
        <p className="text-muted">Are you sure you want to delete this health record?</p>
      </Modal>
    </>
  );
}
