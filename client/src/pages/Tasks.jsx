import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const geo = useGeoCapture();
  const label = t('tables.tasks.label');
  const singular = t('tables.tasks.singular');

  const [tasks, setTasks] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useTopbarSearch(t('records.searchPlaceholder', { label: label.toLowerCase() }), setSearch);

  async function load() {
    const { data, error } = await api.list('tasks', { order: 'due_date.asc' });
    if (error) { showToast(t('records.loadFailed', { label: label.toLowerCase(), message: error.message }), 'error'); return; }
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
  function openEdit(tk) {
    setEditingId(tk.id);
    setForm({ title: tk.title || '', description: tk.description || '', due_date: tk.due_date || '', priority: tk.priority || 'Medium', status: tk.status || 'Pending' });
    geo.reset();
    setModalOpen(true);
  }

  async function save() {
    const title = form.title.trim();
    if (!title) { showToast(t('tasksPage.taskTitleRequired'), 'error'); return; }
    const payload = { ...form, title, description: form.description.trim(), due_date: form.due_date || null };
    if (editingId) {
      const { error } = await api.update('tasks', editingId, payload);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.updated', { item: singular }), 'success');
    } else {
      if (geo.status === 'success') { payload.latitude = geo.coords.latitude; payload.longitude = geo.coords.longitude; }
      const { error } = await api.insert('tasks', [payload]);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.added', { item: singular }), 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(id) { setDeletingId(id); setDeleteOpen(true); }
  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('tasks', deletingId);
    if (error) { showToast(t('records.deleteFailed', { item: singular }), 'error'); return; }
    showToast(t('records.deleted', { item: singular }), 'success');
    setDeleteOpen(false);
    await load();
  }

  return (
    <>
      <div className="page-header">
        <div><h1>{t('tasksPage.title')}</h1><p>{t('tasksPage.subtitle')}</p></div>
        <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> {t('tasksPage.addTask')}</button>
      </div>

      <div className="summary-grid">
        <div className="summary-card"><div className="summary-icon blue"><i className="fas fa-list-check"></i></div><div className="summary-info"><h4>{summary.total}</h4><p>{t('tasksPage.totalTasks')}</p></div></div>
        <div className="summary-card"><div className="summary-icon orange"><i className="fas fa-clock"></i></div><div className="summary-info"><h4>{summary.pending}</h4><p>{t('enums.taskStatus.Pending')}</p></div></div>
        <div className="summary-card"><div className="summary-icon green"><i className="fas fa-spinner"></i></div><div className="summary-info"><h4>{summary.inProgress}</h4><p>{t('enums.taskStatus.In Progress')}</p></div></div>
        <div className="summary-card"><div className="summary-icon green"><i className="fas fa-circle-check"></i></div><div className="summary-info"><h4>{summary.completed}</h4><p>{t('enums.taskStatus.Completed')}</p></div></div>
        <div className="summary-card"><div className="summary-icon red"><i className="fas fa-triangle-exclamation"></i></div><div className="summary-info"><h4>{summary.overdue}</h4><p>{t('tasksPage.overdue')}</p></div></div>
      </div>

      <div className="tabs">
        {FILTER_TABS.map((f) => (
          <button key={f} className={`tab-btn${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? t('common.all') : t(`enums.taskStatus.${f}`, f)}</button>
        ))}
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>{t('tables.tasks.fields.title')}</th><th>{t('tables.tasks.fields.description')}</th><th>{t('tables.tasks.fields.due_date')}</th><th>{t('tables.tasks.fields.priority')}</th><th>{t('tables.tasks.fields.status')}</th><th>{t('adminDashboard.colActions')}</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><i className="fas fa-clipboard-check"></i><h3>{t('common.noneFound', { label })}</h3><p>{filter !== 'all' ? t('tasksPage.noStatusTasks', { status: t(`enums.taskStatus.${filter}`, filter).toLowerCase() }) : t('tasksPage.addFirstTask')}</p></div></td></tr>
                ) : filtered.map((tk) => {
                  const isOverdue = isOverdueTask(tk);
                  const desc = tk.description || '';
                  const completedStyle = tk.status === 'Completed' ? { textDecoration: 'line-through', opacity: 0.6 } : undefined;
                  const completedDescStyle = tk.status === 'Completed' ? { textDecoration: 'line-through', opacity: 0.5 } : undefined;
                  return (
                    <tr key={tk.id}>
                      <td className="fw-600" style={completedStyle}>{tk.title}</td>
                      <td style={completedDescStyle}>{desc.substring(0, 60)}{desc.length > 60 ? '...' : ''}</td>
                      <td>{isOverdue ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{fmtDate(tk.due_date)}{t('tasksPage.overdueSuffix')}</span> : fmtDate(tk.due_date)}</td>
                      <td><PriorityBadge priority={tk.priority} /></td>
                      <td><StatusBadge status={tk.status} /></td>
                      <td>
                        <div className="table-actions">
                          <button className="btn-icon" title={t('common.edit')} onClick={() => openEdit(tk)}><i className="fas fa-pen-to-square"></i></button>
                          <button className="btn-icon danger" title={t('common.delete')} onClick={() => confirmDelete(tk.id)}><i className="fas fa-trash"></i></button>
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
        <div className="form-group"><label>{t('tables.tasks.fields.title')} *</label><input type="text" className="form-control" placeholder={t('tasksPage.titlePlaceholder')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="form-group"><label>{t('tables.tasks.fields.description')}</label><textarea className="form-control" placeholder={t('tasksPage.descriptionPlaceholder')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.tasks.fields.due_date')}</label><input type="date" className="form-control" value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div className="form-group">
            <label>{t('tables.tasks.fields.priority')}</label>
            <select className="form-control" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="Low">{t('enums.taskPriority.Low')}</option><option value="Medium">{t('enums.taskPriority.Medium')}</option><option value="High">{t('enums.taskPriority.High')}</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>{t('tables.tasks.fields.status')}</label>
          <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="Pending">{t('enums.taskStatus.Pending')}</option><option value="In Progress">{t('enums.taskStatus.In Progress')}</option><option value="Completed">{t('enums.taskStatus.Completed')}</option>
          </select>
        </div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('common.confirmDelete')} maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> {t('common.delete')}</button></>}
      >
        <p className="text-muted">{t('tasksPage.confirmDeleteMessage')}</p>
      </Modal>
    </>
  );
}
