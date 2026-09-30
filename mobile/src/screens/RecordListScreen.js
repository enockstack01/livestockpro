import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRepository } from '../db/repository';
import { csvCell, shareCsv } from '../lib/shareCsv';
import { useSync } from '../sync/SyncProvider';
import { useGeoCapture } from '../hooks/useGeoCapture';
import { useToast } from '../lib/toast';
import { useConfirm } from '../lib/confirm';
import { useTheme } from '../theme/ThemeProvider';
import { isOverdueTask, isThisMonth } from '../lib/shared';
import Icon from '../components/Icon';
import RecordForm, { emptyValues } from '../components/RecordForm';
import CsvImportModal from '../components/CsvImportModal';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, FilterBar, FinanceCard, IconButton, Modal, Page, PageHeader, Select, Spinner, SummaryCard, Tabs } from '../ui/kit';
import { Grid, useBreakpoint } from '../ui/layout';
import DataTable from '../ui/DataTable';
import { useTopbarSearch } from '../ui/AppShell';
import { RECORD_PAGES } from '../config/recordPages';

/* One screen for all seven record types, laid out exactly like the matching
   web page (client/src/pages/*.jsx): page header with Export CSV / Add
   buttons, the page's own summary block, tabs and filter dropdowns, a card
   holding the data table (edit/delete buttons per row), the add/edit form
   modal and a delete-confirmation modal. Local-first: reads/writes go
   through src/db/repository.js and sync in the background. */
export default function RecordListScreen({ config }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useBreakpoint();
  const repo = useRepository();
  const { lastSyncedAt, syncing, triggerSync } = useSync();
  const showToast = useToast();
  const confirm = useConfirm();
  const geo = useGeoCapture();
  const page = RECORD_PAGES[config.table];

  const label = t(`tables.${config.table}.label`);
  const singular = t(`tables.${config.table}.singular`);
  const fieldLabel = useCallback((key) => t(`tables.${config.table}.fields.${key}`), [t, config.table]);

  const [records, setRecords] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState(null); // 'add' | 'edit' | null
  const [editingId, setEditingId] = useState(null);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const inlineSearch = useTopbarSearch(t('records.searchPlaceholder', { label: label.toLowerCase() }), setSearch);

  const load = useCallback(async () => {
    setRecords(await repo.list(config.table, { order: 'created_at DESC' }));
  }, [repo, config.table]);
  useEffect(() => { load(); }, [load, lastSyncedAt]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await triggerSync();
    await load();
    setRefreshing(false);
  }, [triggerSync, load]);

  const localizedFields = useMemo(() => config.fields.map((f) => ({
    ...f,
    label: fieldLabel(f.key),
    options: f.options ? f.options.map((opt) => ({ value: opt, label: f.i18nEnum ? t(`enums.${f.i18nEnum}.${opt}`) : opt })) : undefined,
  })), [config.fields, fieldLabel, t]);

  const rows = records || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !config.searchFields.some((f) => String(r[f] || '').toLowerCase().includes(q))) return false;
      if (page.tabs && tab !== 'all' && r[page.tabs.key] !== tab) return false;
      return Object.entries(filters).every(([k, v]) => !v || r[k] === v);
    });
  }, [rows, search, filters, tab, config.searchFields, page.tabs]);

  function openAdd() {
    setModal('add');
    setEditingId(null);
    setValues(emptyValues(config.fields));
    geo.reset();
    geo.capture();
  }

  function openEdit(record) {
    const v = {};
    config.fields.forEach((f) => { v[f.key] = record[f.key] ?? ''; });
    setValues(v);
    setEditingId(record.id);
    setModal('edit');
  }

  async function save() {
    const missing = config.fields.find((f) => f.required && !String(values[f.key] || '').trim());
    if (missing) { showToast(t('records.fieldRequired', { field: fieldLabel(missing.key) }), 'error'); return; }
    setSaving(true);
    try {
      const payload = { ...values };
      config.fields.forEach((f) => {
        if (f.type === 'number') payload[f.key] = payload[f.key] === '' || payload[f.key] === null ? null : Number(payload[f.key]);
      });
      if (modal === 'add') {
        if (geo.status === 'success') { payload.latitude = geo.latitude; payload.longitude = geo.longitude; }
        await repo.insert(config.table, payload);
        showToast(t('records.added', { item: singular }), 'success');
      } else {
        await repo.update(config.table, editingId, payload);
        showToast(t('records.updated', { item: singular }), 'success');
      }
      setModal(null);
      await load();
    } catch (err) {
      showToast(t('records.saveFailed', { message: err.message }), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(record) {
    const ok = await confirm({ title: t('common.confirmDelete'), message: t('confirmDialogs.cannotBeUndone'), confirmLabel: t('common.delete'), destructive: true });
    if (!ok) return;
    await repo.remove(config.table, record.id);
    showToast(t('records.deleted', { item: singular }), 'success');
    await load();
  }

  async function exportCsv() {
    if (rows.length === 0) { showToast(t('records.noRecordsToExport', { label: label.toLowerCase() }), 'warning'); return; }
    const csv = [page.exportFields.join(','), ...rows.map((r) => page.exportFields.map((h) => csvCell(r[h])).join(','))].join('\n');
    try {
      if (!(await shareCsv(csv, `${config.table}_export.csv`))) { showToast(t('reports.sharingUnavailable'), 'error'); return; }
      showToast(t('records.exported', { label }), 'success');
    } catch (err) {
      showToast(t('reports.exportFailed', { message: err.message }), 'error');
    }
  }

  if (!records) return <Spinner />;

  const columns = page.columns(t, colors);
  const pendingDot = (r) => (r.sync_state === 'pending' ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.orange }} /> : null);
  const firstCol = { ...columns[0], render: (r) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {columns[0].render ? columns[0].render(r) : <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{r[columns[0].key] || '—'}</Text>}
      {pendingDot(r)}
    </View>
  ) };

  return (
    <Page refreshing={refreshing || syncing} onRefresh={onRefresh}>
      <PageHeader title={t(`${page.page}.title`)} subtitle={t(`${page.page}.subtitle`)}>
        {page.importable ? <Button variant="secondary" icon="file-import" title={t('animalsPage.importCsv')} onPress={() => setImportOpen(true)} /> : null}
        {page.exportable ? <Button variant="secondary" icon="file-export" title={t('reports.exportCsv')} onPress={exportCsv} /> : null}
        <Button icon="plus" title={t(page.addKey)} onPress={openAdd} />
      </PageHeader>

      {inlineSearch}

      <PageExtra kind={page.extra} rows={rows} t={t} colors={colors} width={width} />

      {page.tabs ? (
        <Tabs value={tab} onChange={setTab} items={[{ value: 'all', label: t('common.all') }, ...page.tabs.values.map((v) => ({ value: v, label: t(page.tabs.labelKey(v)) }))]} />
      ) : null}

      {page.filters.length ? (
        <FilterBar>
          {page.filters.map((f) => {
            const opts = f.fromData ? [...new Set(rows.map((r) => r[f.key]).filter(Boolean))] : f.options;
            return (
              <Select key={f.key} compact value={filters[f.key] || ''} placeholder={t(f.allKey)} onChange={(v) => setFilters((p) => ({ ...p, [f.key]: v }))}
                options={[{ value: '', label: t(f.allKey) }, ...opts.map((o) => ({ value: o, label: t(`enums.${f.enumGroup}.${o}`, o) }))]} />
            );
          })}
        </FilterBar>
      ) : null}

      <Card>
        <CardBody flush>
          <DataTable
            rows={filtered}
            columns={[firstCol, ...columns.slice(1)]}
            actionsLabel={t('adminDashboard.colActions')}
            actions={(r) => (
              <>
                <IconButton icon="pen-to-square" label={t('common.edit')} onPress={() => openEdit(r)} />
                <IconButton icon="trash" danger label={t('common.delete')} onPress={() => remove(r)} />
              </>
            )}
            empty={<EmptyState icon={page.emptyIcon} title={t('common.noneFound', { label })} message={t('records.emptyListWeb', { label: label.toLowerCase() })} />}
          />
        </CardBody>
      </Card>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'add' ? t('records.addTitle', { item: singular }) : t('records.editTitle', { item: singular })}
        footer={<>
          <Button variant="secondary" title={t('common.cancel')} onPress={() => setModal(null)} />
          <Button icon="check" title={t('common.save')} onPress={save} loading={saving} />
        </>}
      >
        {modal === 'add' && geo.status !== 'idle' ? <LocationBadge geo={geo} t={t} colors={colors} /> : null}
        <RecordForm fields={localizedFields} values={values} onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))} />
      </Modal>

      {page.importable ? <CsvImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} /> : null}
    </Page>
  );
}

/* The block each web page shows between the header and the table. */
function PageExtra({ kind, rows, t, colors, width }) {
  if (kind === 'financeSummary') {
    const month = rows.filter((f) => isThisMonth(f.date));
    const income = month.filter((f) => f.type === 'Income').reduce((s, f) => s + (Number(f.amount) || 0), 0);
    const expense = month.filter((f) => f.type === 'Expense').reduce((s, f) => s + (Number(f.amount) || 0), 0);
    const pl = income - expense;
    return (
      <Grid minItemWidth={200} columns={width <= 480 ? 1 : width <= 768 ? 2 : undefined} fit fillLast style={{ marginBottom: 24 }}>
        <FinanceCard label={t('financePage.monthlyIncome')} value={`$${income.toLocaleString()}`} color={colors.primary} />
        <FinanceCard label={t('financePage.monthlyExpenses')} value={`$${expense.toLocaleString()}`} color={colors.red} />
        <FinanceCard label={t('financePage.profitLoss')} value={`${pl < 0 ? '-' : ''}$${Math.abs(pl).toLocaleString()}`} color={pl >= 0 ? colors.blue : colors.red} />
      </Grid>
    );
  }
  if (kind === 'productionSummary') {
    const month = rows.filter((p) => isThisMonth(p.production_date));
    const total = (type) => month.filter((p) => p.production_type === type).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    return (
      <Grid minItemWidth={200} columns={width <= 480 ? 1 : width <= 768 ? 2 : undefined} fit fillLast style={{ marginBottom: 24 }}>
        <FinanceCard label={t('productionPage.milkThisMonth')} value={`${total('Milk').toFixed(1)} L`} color={colors.primary} />
        <FinanceCard label={t('productionPage.eggsThisMonth')} value={`${total('Eggs')} units`} color={colors.orange} />
        <FinanceCard label={t('productionPage.meatThisMonth')} value={`${total('Meat').toFixed(1)} kg`} color={colors.primary} />
      </Grid>
    );
  }
  if (kind === 'taskSummary') {
    const count = (st) => rows.filter((x) => x.status === st).length;
    const small = width <= 768;
    return (
      <Grid minItemWidth={small ? 160 : 220} columns={width <= 480 ? 2 : undefined} gap={small ? 10 : 16} style={{ marginBottom: 24 }}>
        <SummaryCard icon="list-check" color="blue" value={rows.length} label={t('tasksPage.totalTasks')} />
        <SummaryCard icon="clock" color="orange" value={count('Pending')} label={t('enums.taskStatus.Pending')} />
        <SummaryCard icon="spinner" color="green" value={count('In Progress')} label={t('enums.taskStatus.In Progress')} />
        <SummaryCard icon="circle-check" color="green" value={count('Completed')} label={t('enums.taskStatus.Completed')} />
        <SummaryCard icon="triangle-exclamation" color="red" value={rows.filter(isOverdueTask).length} label={t('tasksPage.overdue')} />
      </Grid>
    );
  }
  if (kind === 'feedAlerts') {
    // Same rule as the web: a feed used at most twice in 30 days is flagged.
    const since = new Date(Date.now() - 30 * 86400000);
    const groups = {};
    rows.filter((f) => new Date(f.feeding_date) >= since).forEach((f) => { groups[f.feed_type] = (groups[f.feed_type] || 0) + 1; });
    const low = Object.entries(groups).filter(([, c]) => c <= 2);
    return (
      <Card style={{ marginBottom: 24 }}>
        <CardHeader title={t('feedingPage.stockAlerts')} icon="triangle-exclamation" iconColor={colors.orange} />
        <CardBody>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {low.length === 0
              ? <Badge color="green" icon="check" label={t('feedingPage.allFeedLevelsNormal')} />
              : low.map(([type, count]) => <Badge key={type} color="orange" icon="triangle-exclamation" label={t('feedingPage.lowUsageDetected', { type, count })} />)}
          </View>
        </CardBody>
      </Card>
    );
  }
  return null;
}

/* The web's LocationCaptureBadge: GPS status shown at the top of the add form. */
function LocationBadge({ geo, t, colors }) {
  const messages = { loading: t('geo.capturing'), denied: t('geo.denied'), error: t('geo.error'), unsupported: t('geo.unsupported') };
  const ok = geo.status === 'success';
  return (
    <Pressable onPress={geo.status !== 'loading' && !ok ? geo.capture : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, marginBottom: 16, backgroundColor: ok ? colors.primaryLight : colors.bg }}>
      {geo.status === 'loading' ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="location-dot" size={13} color={ok ? colors.primary : colors.orange} />}
      <Text style={{ flex: 1, fontSize: 12, color: ok ? colors.primary : colors.textLight, fontWeight: '500' }}>
        {ok ? t('geo.captured', { lat: geo.latitude.toFixed(4), lng: geo.longitude.toFixed(4) }) : messages[geo.status]}
        {geo.status !== 'loading' && !ok ? t('geo.tapToRetry') : ''}
      </Text>
    </Pressable>
  );
}
