import { useEffect, useState } from 'react';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { PregnancyBadge, fmtDate } from '../lib/badges.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { tag_id: '', breeding_date: '', pregnancy_status: 'Not Confirmed', expected_birth_date: '', birth_date: '', newborn_count: '', newborn_details: '', notes: '' };

export default function Breeding() {
  const api = useApi();
  const showToast = useToast();

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch('Search breeding records...', setSearch);

  async function load() {
    const { data, error } = await api.list('breeding_records', { order: 'breeding_date.desc' });
    if (error) { showToast('Failed to load breeding records.', 'error'); return; }
    setRecords(data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = records.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (b.tag_id || '').toLowerCase().includes(q) || (b.pregnancy_status || '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || b.pregnancy_status === statusFilter;
    return matchSearch && matchStatus;
  });

  function openAdd() { setEditingId(null); setForm(EMPTY_FORM); setModalOpen(true); }
  function openEdit(b) {
    setEditingId(b.id);
    setForm({ tag_id: b.tag_id || '', breeding_date: b.breeding_date || '', pregnancy_status: b.pregnancy_status || 'Not Confirmed', expected_birth_date: b.expected_birth_date || '', birth_date: b.birth_date || '', newborn_count: b.newborn_count ?? '', newborn_details: b.newborn_details || '', notes: b.notes || '' });
    setModalOpen(true);
  }

  async function save() {
    if (!form.tag_id) { showToast('Tag ID is required.', 'error'); return; }
    const payload = { ...form, newborn_count: parseInt(form.newborn_count, 10) || 0 };
    if (editingId) {
      const { error } = await api.update('breeding_records', editingId, payload);
      if (error) { showToast('Update failed.', 'error'); return; }
      showToast('Breeding record updated.', 'success');
    } else {
      const { error } = await api.insert('breeding_records', [payload]);
      if (error) { showToast('Insert failed.', 'error'); return; }
      showToast('Breeding record added.', 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('breeding_records', deletingId);
    if (error) { showToast('Delete failed.', 'error'); return; }
    showToast('Breeding record deleted.', 'success');
    setDeleteOpen(false);
    await load();
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Breeding</h1><p>Monitor breeding cycles, pregnancies, and births</p></div>
        <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> Add Record</button>
      </div>

      <div className="filter-bar">
        <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="Pregnant">Pregnant</option>
          <option value="Not Confirmed">Not Confirmed</option>
          <option value="Not Pregnant">Not Pregnant</option>
          <option value="Delivered">Delivered</option>
        </select>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Tag ID</th><th>Breeding Date</th><th>Pregnancy</th><th>Expected Birth</th><th>Birth Date</th><th>Newborns</th><th>Details</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state"><i className="fas fa-venus-mars"></i><h3>No breeding records</h3><p>Track your breeding program here.</p></div></td></tr>
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
                          <button className="btn-icon" title="Edit" onClick={() => openEdit(b)}><i className="fas fa-pen-to-square"></i></button>
                          <button className="btn-icon danger" title="Delete" onClick={() => confirmDelete(b.id)}><i className="fas fa-trash"></i></button>
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
        open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Breeding Record' : 'Add Breeding Record'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save}><i className="fas fa-check"></i> Save</button></>}
      >
        <div className="form-group"><label>Animal Tag ID *</label><input type="text" className="form-control" placeholder="e.g. COW-001" value={form.tag_id} onChange={(e) => setForm({ ...form, tag_id: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>Breeding Date</label><input type="date" className="form-control" value={form.breeding_date} onChange={(e) => setForm({ ...form, breeding_date: e.target.value })} /></div>
          <div className="form-group">
            <label>Pregnancy Status</label>
            <select className="form-control" value={form.pregnancy_status} onChange={(e) => setForm({ ...form, pregnancy_status: e.target.value })}>
              <option value="Not Confirmed">Not Confirmed</option><option value="Pregnant">Pregnant</option><option value="Not Pregnant">Not Pregnant</option><option value="Delivered">Delivered</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Expected Birth Date</label><input type="date" className="form-control" value={form.expected_birth_date} onChange={(e) => setForm({ ...form, expected_birth_date: e.target.value })} /></div>
          <div className="form-group"><label>Actual Birth Date</label><input type="date" className="form-control" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>Newborn Count</label><input type="number" className="form-control" placeholder="0" min="0" value={form.newborn_count} onChange={(e) => setForm({ ...form, newborn_count: e.target.value })} /></div>
        <div className="form-group"><label>Newborn Details</label><textarea className="form-control" placeholder="e.g. 2 males, 1 female, all healthy" value={form.newborn_details} onChange={(e) => setForm({ ...form, newborn_details: e.target.value })} /></div>
        <div className="form-group"><label>Notes</label><textarea className="form-control" placeholder="Additional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Confirm Delete" maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> Delete</button></>}
      >
        <p className="text-muted">Are you sure you want to delete this breeding record?</p>
      </Modal>
    </>
  );
}
