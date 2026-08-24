import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import { StatusBadge, calcAge, fmtDate, downloadCSV, csvCell } from '../lib/badges.jsx';
import { useGeoCapture, LocationCaptureBadge } from '../lib/geolocation.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { tag_id: '', name: '', species: '', breed: '', sex: '', date_of_birth: '', location: '', health_status: 'Healthy', notes: '' };
const SPECIES_OPTIONS = ['Cattle', 'Sheep', 'Goat', 'Pig', 'Poultry', 'Horse', 'Donkey', 'Rabbit', 'Other'];

export default function Animals() {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const fileInputRef = useRef(null);
  const geo = useGeoCapture();
  const label = t('tables.animals.label');
  const singular = t('tables.animals.singular');

  const [animals, setAnimals] = useState([]);
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingTag, setDeletingTag] = useState('');

  const [csvModalOpen, setCsvModalOpen] = useState(false);

  useTopbarSearch(t('records.searchPlaceholder', { label: label.toLowerCase() }), setSearch);

  async function load() {
    const { data, error } = await api.list('animals', { eq: {}, order: 'created_at.desc' });
    if (error) { showToast(t('records.loadFailed', { label: label.toLowerCase(), message: error.message }), 'error'); return; }
    setAnimals(data || []);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const speciesOptions = useMemo(() => [...new Set(animals.map((a) => a.species).filter(Boolean))], [animals]);

  const filtered = animals.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [a.tag_id, a.name, a.species, a.breed].some((v) => (v || '').toLowerCase().includes(q));
    const matchSpecies = !speciesFilter || a.species === speciesFilter;
    const matchStatus = !statusFilter || a.health_status === statusFilter;
    return matchSearch && matchSpecies && matchStatus;
  });

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    geo.capture();
    setModalOpen(true);
  }

  function openEdit(a) {
    setEditingId(a.id);
    setForm({ tag_id: a.tag_id || '', name: a.name || '', species: a.species || '', breed: a.breed || '', sex: a.sex || '', date_of_birth: a.date_of_birth || '', location: a.location || '', health_status: a.health_status || 'Healthy', notes: a.notes || '' });
    geo.reset();
    setModalOpen(true);
  }

  async function save() {
    if (!form.tag_id || !form.species) { showToast(t('animalsPage.tagAndSpeciesRequired'), 'error'); return; }
    if (editingId) {
      const { error } = await api.update('animals', editingId, form);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.updated', { item: singular }), 'success');
    } else {
      const payload = geo.status === 'success' ? { ...form, latitude: geo.coords.latitude, longitude: geo.coords.longitude } : form;
      const { error } = await api.insert('animals', [payload]);
      if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
      showToast(t('records.added', { item: singular }), 'success');
    }
    setModalOpen(false);
    await load();
  }

  function confirmDelete(a) {
    setDeletingId(a.id);
    setDeletingTag(a.tag_id);
    setDeleteOpen(true);
  }

  async function doDelete() {
    if (!deletingId) return;
    const { error } = await api.remove('animals', deletingId);
    if (error) { showToast(t('records.deleteFailed', { item: singular }), 'error'); return; }
    showToast(t('records.deleted', { item: singular }), 'success');
    setDeleteOpen(false);
    setDeletingId(null);
    await load();
  }

  function exportCSV() {
    if (animals.length === 0) { showToast(t('records.noRecordsToExport', { label: label.toLowerCase() }), 'warning'); return; }
    const headers = ['tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth', 'location', 'health_status', 'last_check_date', 'notes'];
    const csv = [headers.join(',')].concat(animals.map((a) => headers.map((h) => csvCell(a[h])).join(','))).join('\n');
    downloadCSV(csv, 'animals_export.csv');
    showToast(t('records.exported', { label }), 'success');
  }

  /* Splits one CSV line respecting double-quoted fields (so a quoted value
     containing a comma, e.g. exportCSV's own `"Pasture A, north side"`,
     round-trips correctly instead of being split mid-field). */
  function parseCsvLine(line) {
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        values.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    values.push(cur);
    return values;
  }

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
      return obj;
    });
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rows = parseCSV(ev.target.result);
        if (rows.length === 0) { showToast(t('animalsPage.csvEmpty'), 'error'); return; }
        // Same required fields the manual "Add Animal" form enforces (see save() above).
        const validRows = rows.filter((row) => row.tag_id && row.species);
        const skipped = rows.length - validRows.length;
        if (validRows.length === 0) { showToast(t('animalsPage.noValidRows'), 'error'); return; }
        const records = validRows.map((row) => ({
          tag_id: row.tag_id, name: row.name || '', species: row.species, breed: row.breed || '',
          sex: row.sex || '', date_of_birth: row.date_of_birth || null, location: row.location || '',
          health_status: row.health_status || 'Healthy', notes: row.notes || ''
        }));
        const { error } = await api.insert('animals', records);
        if (error) { showToast(t('records.saveFailed', { message: error.message }), 'error'); return; }
        showToast(t('animalsPage.importedSuccess', { count: records.length }) + (skipped ? t('animalsPage.skippedRows', { count: skipped }) : ''), 'success');
        setCsvModalOpen(false);
        await load();
      } catch (err) {
        showToast(t('animalsPage.csvParseError', { message: err.message }), 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <>
      <div className="page-header">
        <div><h1>{t('animalsPage.title')}</h1><p>{t('animalsPage.subtitle')}</p></div>
        <div className="d-flex gap-16 flex-wrap">
          <button className="btn btn-secondary" onClick={() => setCsvModalOpen(true)}><i className="fas fa-file-import"></i> {t('animalsPage.importCsv')}</button>
          <button className="btn btn-secondary" onClick={exportCSV}><i className="fas fa-file-export"></i> {t('reports.exportCsv')}</button>
          <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> {t('animalsPage.addAnimal')}</button>
        </div>
      </div>

      <div className="filter-bar">
        <select className="form-control" value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value)}>
          <option value="">{t('animalsPage.allSpecies')}</option>
          {speciesOptions.map((s) => <option key={s} value={s}>{t(`enums.species.${s}`, s)}</option>)}
        </select>
        <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t('animalsPage.allStatuses')}</option>
          <option value="Healthy">{t('enums.animalHealthStatus.Healthy')}</option>
          <option value="Under Treatment">{t('enums.animalHealthStatus.Under Treatment')}</option>
          <option value="Critical">{t('enums.animalHealthStatus.Critical')}</option>
          <option value="Deceased">{t('enums.animalHealthStatus.Deceased')}</option>
        </select>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>{t('tables.animals.fields.tag_id')}</th><th>{t('tables.animals.fields.name')}</th><th>{t('tables.animals.fields.species')}</th><th>{t('tables.animals.fields.breed')}</th><th>{t('tables.animals.fields.sex')}</th><th>{t('common.age')}</th><th>{t('tables.animals.fields.location')}</th><th>{t('tables.animals.fields.health_status')}</th><th>{t('common.lastCheck')}</th><th>{t('adminDashboard.colActions')}</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10}><div className="empty-state"><i className="fas fa-cow"></i><h3>{t('common.noneFound', { label })}</h3><p>{t('animalsPage.addOrAdjustFilters')}</p></div></td></tr>
                ) : filtered.map((a) => (
                  <tr key={a.id}>
                    <td className="fw-600">{a.tag_id}</td>
                    <td>{a.name || '—'}</td>
                    <td>{t(`enums.species.${a.species}`, a.species)}</td>
                    <td>{a.breed || '—'}</td>
                    <td>{a.sex ? t(`enums.sex.${a.sex}`, a.sex) : '—'}</td>
                    <td>{calcAge(a.date_of_birth)}</td>
                    <td>{a.location || '—'}</td>
                    <td><StatusBadge status={a.health_status} /></td>
                    <td>{fmtDate(a.last_check_date)}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn-icon" title={t('common.edit')} onClick={() => openEdit(a)}><i className="fas fa-pen-to-square"></i></button>
                        <button className="btn-icon danger" title={t('common.delete')} onClick={() => confirmDelete(a)}><i className="fas fa-trash"></i></button>
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
        open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? t('animalsPage.editAnimal') : t('animalsPage.addNewAnimal')}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button><button className="btn btn-primary" onClick={save}><i className="fas fa-check"></i> {t('common.save')}</button></>}
      >
        {!editingId && <LocationCaptureBadge geo={geo} />}
        <div className="form-group"><label>{t('tables.animals.fields.tag_id')} *</label><input type="text" className="form-control" placeholder={t('animalsPage.tagIdPlaceholder')} value={form.tag_id} onChange={(e) => setForm({ ...form, tag_id: e.target.value })} /></div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.animals.fields.name')}</label><input type="text" className="form-control" placeholder={t('animalsPage.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="form-group">
            <label>{t('tables.animals.fields.species')} *</label>
            <select className="form-control" value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })}>
              <option value="">{t('animalsPage.selectSpecies')}</option>
              {SPECIES_OPTIONS.map((s) => <option key={s} value={s}>{t(`enums.species.${s}`, s)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.animals.fields.breed')}</label><input type="text" className="form-control" placeholder={t('animalsPage.breedPlaceholder')} value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} /></div>
          <div className="form-group">
            <label>{t('tables.animals.fields.sex')}</label>
            <select className="form-control" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
              <option value="">{t('animalsPage.selectSex')}</option><option value="Male">{t('enums.sex.Male')}</option><option value="Female">{t('enums.sex.Female')}</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>{t('tables.animals.fields.date_of_birth')}</label><input type="date" className="form-control" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
          <div className="form-group"><label>{t('tables.animals.fields.location')}</label><input type="text" className="form-control" placeholder={t('animalsPage.locationPlaceholder')} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
        </div>
        <div className="form-group">
          <label>{t('tables.animals.fields.health_status')}</label>
          <select className="form-control" value={form.health_status} onChange={(e) => setForm({ ...form, health_status: e.target.value })}>
            <option value="Healthy">{t('enums.animalHealthStatus.Healthy')}</option><option value="Under Treatment">{t('enums.animalHealthStatus.Under Treatment')}</option><option value="Critical">{t('enums.animalHealthStatus.Critical')}</option><option value="Deceased">{t('enums.animalHealthStatus.Deceased')}</option>
          </select>
        </div>
        <div className="form-group"><label>{t('tables.animals.fields.notes')}</label><textarea className="form-control" placeholder={t('common.notesPlaceholder')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('common.confirmDelete')} maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> {t('common.delete')}</button></>}
      >
        <p className="text-muted">{t('animalsPage.confirmDeleteAnimal', { tag: deletingTag })}</p>
      </Modal>

      <Modal open={csvModalOpen} onClose={() => setCsvModalOpen(false)} title={t('animalsPage.importAnimalsCsv')}>
        <p className="text-muted mb-16" style={{ fontSize: 13 }}>
          {t('animalsPage.importInstructions')}
        </p>
        <div className="csv-drop-zone" onClick={() => fileInputRef.current?.click()}>
          <i className="fas fa-cloud-arrow-up"></i>
          <p><span className="browse-link">{t('animalsPage.clickToBrowse')}</span> {t('animalsPage.orDragDrop')}</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>{t('animalsPage.csvOnly')}</p>
        </div>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
      </Modal>
    </>
  );
}
