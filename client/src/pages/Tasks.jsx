import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { StatusBadge, PriorityBadge, fmtDate } from '../lib/badges.jsx';
import { useGeoCapture, LocationCaptureBadge } from '../lib/geolocation.jsx';
import Modal from '../components/Modal.jsx';
import { isOverdueTask } from '../../../shared/businessRules';

const EMPTY_FORM = { title: '', description: '', due_date: '', priority: 'Medium', status: 'Pending' };
const FILTER_TABS = ['all', 'Pending', 'In Progress', 'Completed'];

export default function Tasks() {
  const api = useApi();
  const showToast = useToast();
  const geo = useGeoCapture();

  const [tasks, setTasks] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch('Search tasks...', setSearch);

  async function load() {
    const { data, error } = await api.list('tasks', { order: 'due_date.asc' });
    if (error) { showToast('Failed to load tasks: ' + error.message, 'error'); return; }
    setTasks(data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    const pending = tasks.filter((t) => t.status === 'Pending').length;
    const inProgress = tasks.filter((t) => t.status === 'In Progress').length;
    const completed = tasks.filter((t) => t.status === 'Completed').length;
    const overdue = tasks.filter(isOverdueTask).length;
    return { total: tasks.length, pending, inProgress, completed, overdue };
  }, [tasks]);

  const filtered = tasks.filter((t) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
    const matchFilter = filter === 'all' || t.status === filter;
    return matchSearch && matchFilter;
  });

  function openAdd() { setEditingId(null); setForm(EMPTY_FORM); geo.capture(); setModalOpen(true); }
  function openEdit(t) {
    setEditingId(t.id);
    setForm({ title: t.title || '', description: t.description || '', due_date: t.due_date || '', priority: t.priority || 'Medium', status: t.status || 'Pending' });
    geo.reset();
    setModalOpen(true);
  }

  async function save() {
    const title = form.title.trim();
    if (!title) { showToast('Task title is required.', 'error'); return; }
    const payload = { ...form, title, description: form.description.trim(), due_date: form.due_date || null };
    if (editingId) {
      const { error } = await api.update('tasks', editingId, payload);
      if (error) { showToast('Update failed: ' + error.message, 'error'); return; }
      showToast('Task updated.', 'success');
    } else {
      if (geo.status === 'success') { payload.latitude = geo.coords.latitude; payload.longitude = geo.coords.longitude; }
      const { error } = await api.insert('tasks', [payload]);
      if (error) { showToast('Insert failed: ' + error.message, 'error'); return; }
      showToast('Task added.', 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('tasks', deletingId);
    if (error) { showToast('Delete failed.', 'error'); return; }
    showToast('Task deleted.', 'success');
    setDeleteOpen(false);
    await load();
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Tasks</h1><p>Manage your farm to-do list and reminders</p></div>
        <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> Add Task</button>
      </div>

      <div className="summary-grid">
        <div className="summary-card"><div className="summary-icon blue"><i className="fas fa-list-check"></i></div><div className="summary-info"><h4>{summary.total}</h4><p>Total Tasks</p></div></div>
        <div className="summary-card"><div className="summary-icon orange"><i className="fas fa-clock"></i></div><div className="summary-info"><h4>{summary.pending}</h4><p>Pending</p></div></div>
        <div className="summary-card"><div className="summary-icon green"><i className="fas fa-spinner"></i></div><div className="summary-info"><h4>{summary.inProgress}</h4><p>In Progress</p></div></div>
        <div className="summary-card"><div className="summary-icon green"><i className="fas fa-circle-check"></i></div><div className="summary-info"><h4>{summary.completed}</h4><p>Completed</p></div></div>
        <div className="summary-card"><div className="summary-icon red"><i className="fas fa-triangle-exclamation"></i></div><div className="summary-info"><h4>{summary.overdue}</h4><p>Overdue</p></div></div>
      </div>

      <div className="tabs">
        {FILTER_TABS.map((f) => (
          <button key={f} className={`tab-btn${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f}</button>
        ))}
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Task</th><th>Description</th><th>Due Date</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><i className="fas fa-clipboard-check"></i><h3>No tasks found</h3><p>{filter !== 'all' ? `No ${filter.toLowerCase()} tasks.` : 'Add your first task to get started.'}</p></div></td></tr>
                ) : filtered.map((t) => {
                  const isOverdue = isOverdueTask(t);
                  const desc = t.description || '';
                  const completedStyle = t.status === 'Completed' ? { textDecoration: 'line-through', opacity: 0.6 } : undefined;
                  const completedDescStyle = t.status === 'Completed' ? { textDecoration: 'line-through', opacity: 0.5 } : undefined;
                  return (
                    <tr key={t.id}>
                      <td className="fw-600" style={completedStyle}>{t.title}</td>
                      <td style={completedDescStyle}>{desc.substring(0, 60)}{desc.length > 60 ? '...' : ''}</td>
                      <td>{isOverdue ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{fmtDate(t.due_date)} (Overdue)</span> : fmtDate(t.due_date)}</td>
                      <td><PriorityBadge priority={t.priority} /></td>
                      <td><StatusBadge status={t.status} /></td>
                      <td>
                        <div className="table-actions">
                          <button className="btn-icon" title="Edit" onClick={() => openEdit(t)}><i className="fas fa-pen-to-square"></i></button>
                          <button className="btn-icon danger" title="Delete" onClick={() => confirmDelete(t.id)}><i className="fas fa-trash"></i></button>
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
        open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Task' : 'Add Task'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save}><i className="fas fa-check"></i> Save</button></>}
      >
        {!editingId && <LocationCaptureBadge geo={geo} />}
        <div className="form-group"><label>Task Title *</label><input type="text" className="form-control" placeholder="e.g. Vaccinate cattle in Pen B" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="form-group"><label>Description</label><textarea className="form-control" placeholder="Details about this task..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>Due Date</label><input type="date" className="form-control" value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div className="form-group">
            <label>Priority</label>
            <select className="form-control" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Status</label>
          <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="Pending">Pending</option><option value="In Progress">In Progress</option><option value="Completed">Completed</option>
          </select>
        </div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Confirm Delete" maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> Delete</button></>}
      >
        <p className="text-muted">Are you sure you want to delete this task?</p>
      </Modal>
    </>
  );
}
