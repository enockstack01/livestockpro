import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRepository } from '../../src/db/repository';
import { useToast } from '../../src/lib/toast';
import { fmtDate } from '../../src/lib/shared';
import { csvCell, shareCsv } from '../../src/lib/shareCsv';
import { buildReportHtml, printHtml } from '../../src/lib/printReport';
import { LIGHT_COLORS } from '../../src/lib/shared';
import { useTheme } from '../../src/theme/ThemeProvider';
import DateField from '../../src/components/DateField';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, FilterBar, FinanceCard, FormGroup, Input, Page, PageHeader, Spinner } from '../../src/ui/kit';
import { Grid, useBreakpoint } from '../../src/ui/layout';
import DataTable from '../../src/ui/DataTable';
import { formatMoney } from '../../../shared/currency';

/* Port of client/src/pages/Reports.jsx: date-range / animal-tag filters,
   the headline figures as finance cards, then one table card per record
   type. "Export CSV" writes the same full-farm-report file as the web,
   handed to the share sheet (or downloaded when running in a browser);
   "Print" sends a paper version of the same report to the system print
   dialog (which also offers Save as PDF), like the web's Print button. */
export default function ReportsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useBreakpoint();
  const repo = useRepository();
  const showToast = useToast();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [animalTag, setAnimalTag] = useState('');
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    const [animals, health, breeding, production, finance] = await Promise.all([
      repo.list('animals'), repo.list('health_records'), repo.list('breeding_records'), repo.list('production_records'), repo.list('finance_records'),
    ]);
    setData({ animals, health, breeding, production, finance });
  }, [repo]);
  useEffect(() => { load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    showToast(t('reportsPage.reportRefreshed'), 'success');
  }

  async function exportFullReport() {
    if (!data) return;
    const lines = ['LIVESTOCKPRO FULL FARM REPORT', 'Generated,' + new Date().toLocaleString(), ''];
    const section = (title, rows, headers, fields) => {
      lines.push(`=== ${title} (${rows.length}) ===`, headers.join(','));
      rows.forEach((r) => lines.push(fields.map((f) => csvCell(r[f])).join(',')));
      lines.push('');
    };
    section('ANIMALS', data.animals, ['Tag ID', 'Name', 'Species', 'Breed', 'Sex', 'Date of Birth', 'Location', 'Health Status'], ['tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth', 'location', 'health_status']);
    section('HEALTH RECORDS', data.health, ['Tag ID', 'Disease', 'Treatment', 'Medicine', 'Vet', 'Check Date', 'Next Check', 'Status', 'Notes'], ['tag_id', 'disease', 'treatment', 'medicine', 'vet_name', 'check_date', 'next_check_date', 'status', 'notes']);
    section('BREEDING RECORDS', data.breeding, ['Tag ID', 'Breeding Date', 'Pregnancy Status', 'Expected Birth', 'Birth Date', 'Newborn Count', 'Newborn Details', 'Notes'], ['tag_id', 'breeding_date', 'pregnancy_status', 'expected_birth_date', 'birth_date', 'newborn_count', 'newborn_details', 'notes']);
    section('PRODUCTION RECORDS', data.production, ['Type', 'Tag ID', 'Quantity', 'Unit', 'Date', 'Notes'], ['production_type', 'tag_id', 'quantity', 'unit', 'production_date', 'notes']);
    section('FINANCE RECORDS', data.finance, ['Type', 'Category', 'Amount', 'Date', 'Description'], ['type', 'category', 'amount', 'date', 'description']);
    try {
      if (!(await shareCsv(lines.join('\n'), 'full_farm_report_' + new Date().toISOString().split('T')[0] + '.csv'))) { showToast(t('reports.sharingUnavailable'), 'error'); return; }
      showToast(t('reportsPage.fullReportExported'), 'success');
    } catch (err) {
      showToast(t('reports.exportFailed', { message: err.message }), 'error');
    }
  }

  if (!data) return <Spinner />;

  const inDates = (item, col) => (!dateFrom || !item[col] || item[col] >= dateFrom) && (!dateTo || !item[col] || item[col] <= dateTo);
  const byTag = (item, col) => !animalTag || (item[col] || '') === animalTag;
  const fAnimals = data.animals.filter((a) => byTag(a, 'tag_id'));
  const fHealth = data.health.filter((h) => inDates(h, 'check_date') && byTag(h, 'tag_id'));
  const fBreeding = data.breeding.filter((b) => inDates(b, 'breeding_date') && byTag(b, 'tag_id'));
  const fProduction = data.production.filter((p) => inDates(p, 'production_date') && byTag(p, 'tag_id'));
  const fFinance = data.finance.filter((r) => inDates(r, 'date'));

  const count = (list, pred) => list.filter(pred).length;
  const sumOf = (list, pred, field) => list.filter(pred).reduce((s, r) => s + (Number(r[field]) || 0), 0);
  const income = sumOf(data.finance, (r) => r.type === 'Income', 'amount');
  const expense = sumOf(data.finance, (r) => r.type === 'Expense', 'amount');
  const net = income - expense;
  const prod = (type) => sumOf(data.production, (p) => p.production_type === type, 'quantity');
  const now = new Date();
  const cols = width <= 480 ? 1 : width <= 768 ? 2 : undefined;

  const reportTitle = `${t('auth.brandName')} ${t('reportsPage.title')}`;
  const reportSubtitle = t('reportsPage.generatedOn', { time: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}` })
    + (dateFrom || dateTo || animalTag ? ` · ${t('reportsPage.filteredLabel')}${dateFrom ? t('reportsPage.filteredFrom', { date: dateFrom }) : ''}${dateTo ? t('reportsPage.filteredTo', { date: dateTo }) : ''}${animalTag ? t('reportsPage.filteredTag', { tag: animalTag }) : ''}` : '');

  // One description of the report feeds both the screen and the printout.
  // `tone` names a palette color so print can use the light palette.
  const cardRows = [
    [
      { label: t('reportsPage.totalAnimals'), value: String(data.animals.length), tone: 'text' },
      { label: t('reports.healthy'), value: String(count(data.animals, (a) => a.health_status === 'Healthy')), tone: 'primary' },
      { label: t('reports.underTreatment'), value: String(count(data.animals, (a) => a.health_status === 'Under Treatment')), tone: 'red' },
      { label: t('reports.criticalStatus'), value: String(count(data.animals, (a) => a.health_status === 'Critical')), tone: 'red' },
      { label: t('dashboardPage.pregnant'), value: String(count(data.breeding, (b) => b.pregnancy_status === 'Pregnant')), tone: 'purple' },
      { label: t('reportsPage.totalIncome'), value: formatMoney(income), tone: 'primary' },
      { label: t('reportsPage.totalExpenses'), value: formatMoney(expense), tone: 'red' },
      { label: t('reportsPage.netProfit'), value: formatMoney(net), tone: net >= 0 ? 'blue' : 'red' },
    ],
    [
      { label: t('reportsPage.milkProduced'), value: `${prod('Milk').toFixed(1)} L`, tone: 'primary' },
      { label: t('reportsPage.eggsCollected'), value: `${prod('Eggs')} units`, tone: 'orange' },
      { label: t('reportsPage.meatProduced'), value: `${prod('Meat').toFixed(1)} kg`, tone: 'primary' },
    ],
  ];

  const sections = [
    { title: t('tables.animals.label'), icon: 'cow', rows: fAnimals, columns: [
      { key: 'tag_id', label: t('tables.animals.fields.tag_id'), strong: true }, { key: 'name', label: t('tables.animals.fields.name') },
      { key: 'species', label: t('tables.animals.fields.species') }, { key: 'breed', label: t('tables.animals.fields.breed') }, { key: 'sex', label: t('tables.animals.fields.sex') },
      { key: 'date_of_birth', label: t('tables.animals.fields.date_of_birth'), render: (a) => fmtDate(a.date_of_birth) }, { key: 'location', label: t('tables.animals.fields.location') },
      { key: 'health_status', label: t('tables.animals.fields.health_status') },
    ] },
    { title: t('healthPage.title'), icon: 'stethoscope', rows: fHealth, columns: [
      { key: 'tag_id', label: t('tables.animals.fields.tag_id'), strong: true }, { key: 'disease', label: t('tables.health_records.fields.disease') },
      { key: 'treatment', label: t('tables.health_records.fields.treatment') }, { key: 'medicine', label: t('tables.health_records.fields.medicine') },
      { key: 'vet_name', label: t('tables.health_records.fields.vet_name') }, { key: 'check_date', label: t('tables.health_records.fields.check_date'), render: (h) => fmtDate(h.check_date) },
      { key: 'next_check_date', label: t('tables.health_records.fields.next_check_date'), render: (h) => fmtDate(h.next_check_date) }, { key: 'status', label: t('tables.health_records.fields.status') },
    ] },
    { title: t('tables.breeding_records.singular'), icon: 'venus-mars', rows: fBreeding, columns: [
      { key: 'tag_id', label: t('tables.animals.fields.tag_id'), strong: true }, { key: 'breeding_date', label: t('tables.breeding_records.fields.breeding_date'), render: (b) => fmtDate(b.breeding_date) },
      { key: 'pregnancy_status', label: t('tables.breeding_records.fields.pregnancy_status') }, { key: 'expected_birth_date', label: t('tables.breeding_records.fields.expected_birth_date'), render: (b) => fmtDate(b.expected_birth_date) },
      { key: 'birth_date', label: t('tables.breeding_records.fields.birth_date'), render: (b) => fmtDate(b.birth_date) }, { key: 'newborn_count', label: t('tables.breeding_records.fields.newborn_count'), render: (b) => (b.newborn_count ? String(b.newborn_count) : '—') },
      { key: 'newborn_details', label: t('tables.breeding_records.fields.newborn_details'), render: (b) => (b.newborn_details || '—').substring(0, 50) },
    ] },
    { title: t('tables.production_records.singular'), icon: 'gauge', rows: fProduction, columns: [
      { key: 'production_type', label: t('tables.production_records.fields.production_type'), strong: true }, { key: 'tag_id', label: t('tables.animals.fields.tag_id') },
      { key: 'quantity', label: t('tables.production_records.fields.quantity'), render: (p) => String(p.quantity || 0) }, { key: 'unit', label: t('tables.production_records.fields.unit') },
      { key: 'production_date', label: t('tables.production_records.fields.production_date'), render: (p) => fmtDate(p.production_date) }, { key: 'notes', label: t('tables.production_records.fields.notes'), render: (p) => (p.notes || '—').substring(0, 50) },
    ] },
    { title: t('tables.finance_records.singular'), icon: 'coins', rows: fFinance, columns: [
      { key: 'type', label: t('tables.finance_records.fields.type'), strong: true }, { key: 'category', label: t('tables.finance_records.fields.category') },
      { key: 'amount', label: t('tables.finance_records.fields.amount'), render: (r) => formatMoney(r.amount) },
      { key: 'date', label: t('tables.finance_records.fields.date'), render: (r) => fmtDate(r.date) }, { key: 'description', label: t('tables.finance_records.fields.description'), render: (r) => (r.description || '—').substring(0, 50) },
    ] },
  ];

  async function print() {
    setPrinting(true);
    try {
      await printHtml(buildReportHtml({
        title: reportTitle,
        subtitle: reportSubtitle,
        // Paper is white: always print with the light palette, whatever the app theme.
        cardRows: cardRows.map((row) => row.map((c) => ({ ...c, color: LIGHT_COLORS[c.tone] }))),
        sections,
        recordsLabel: (n) => t('reportsPage.recordsCount', { count: n }),
        emptyLabel: (section) => t('reportsPage.noRecordsFound', { section: section.toLowerCase() }),
      }));
    } catch (err) {
      showToast(t('reports.exportFailed', { message: err.message }), 'error');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Page>
      <PageHeader title={t('reportsPage.title')} subtitle={t('reportsPage.subtitle')}>
        <Button variant="secondary" icon="rotate" title={refreshing ? t('common.loading') : t('common.refresh')} onPress={refresh} loading={refreshing} />
        <Button variant="secondary" icon="print" title={t('reportsPage.print')} onPress={print} loading={printing} />
        <Button icon="file-export" title={t('reports.exportCsv')} onPress={exportFullReport} />
      </PageHeader>

      <Card style={{ marginBottom: 24 }}>
        <CardBody>
          <FilterBar>
            <FormGroup label={t('reportsPage.fromDate')} style={{ marginBottom: 0, minWidth: 160 }}><DateField value={dateFrom} onChange={setDateFrom} /></FormGroup>
            <FormGroup label={t('reportsPage.toDate')} style={{ marginBottom: 0, minWidth: 160 }}><DateField value={dateTo} onChange={setDateTo} /></FormGroup>
            <FormGroup label={t('reportsPage.animalTag')} style={{ marginBottom: 0, minWidth: 160 }}><Input placeholder={t('reportsPage.animalTagPlaceholder')} value={animalTag} onChangeText={setAnimalTag} autoCapitalize="characters" /></FormGroup>
            <Button icon="filter" title={t('reportsPage.applyFilter')} onPress={() => showToast(t('reportsPage.filtersApplied'), 'info')} style={{ alignSelf: width <= 768 ? 'stretch' : 'flex-end' }} />
          </FilterBar>
        </CardBody>
      </Card>

      <View style={{ borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 16, marginBottom: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primaryDark, marginBottom: 4 }}>{reportTitle}</Text>
        <Text style={{ fontSize: 13, color: colors.textLight }}>{reportSubtitle}</Text>
      </View>

      {cardRows.map((row, i) => (
        <Grid key={i} minItemWidth={200} columns={cols} fit fillLast style={{ marginBottom: 24 }}>
          {row.map((c) => <FinanceCard key={c.label} label={c.label} value={c.value} color={colors[c.tone]} />)}
        </Grid>
      ))}

      {sections.map((sec) => <ReportSection key={sec.title} title={sec.title} icon={sec.icon} rows={sec.rows} columns={sec.columns} />)}
    </Page>
  );
}

function ReportSection({ title, icon, rows, columns }) {
  const { t } = useTranslation();
  return (
    <Card style={{ marginBottom: 24 }}>
      <CardHeader title={title} icon={icon} right={<Badge color="green" label={t('reportsPage.recordsCount', { count: rows.length })} />} />
      <CardBody flush>
        <DataTable rows={rows} columns={columns} empty={<EmptyState icon="inbox" title={t('reportsPage.noRecordsFound', { section: title.toLowerCase() })} message={t('reportsPage.noRecordsMatchFilters')} compact />} />
      </CardBody>
    </Card>
  );
}
