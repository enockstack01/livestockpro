import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRepository } from '../../src/db/repository';
import { useSync } from '../../src/sync/SyncProvider';
import { useToast } from '../../src/lib/toast';
import { fmtDate, isOverdueTask } from '../../src/lib/shared';
import { StatusBadge, PriorityBadge } from '../../src/components/Badges';
import { Button, Card, CardBody, CardHeader, EmptyState, FormGroup, Input, Modal, Page, PageHeader, Select, Spinner, SummaryCard } from '../../src/ui/kit';
import { Grid, useBreakpoint } from '../../src/ui/layout';
import { BarChart, DonutChart, useChartColors } from '../../src/ui/charts';
import DataTable from '../../src/ui/DataTable';
import DateField from '../../src/components/DateField';
import FarmAnalytics from '../../src/screens/FarmAnalytics';
import { computeDashboardSummary, monthBuckets, ym } from '../../../shared/analytics';
import { fmtMoney } from '../../../shared/chartPalette';

/* Port of client/src/pages/Dashboard.jsx: the ten summary cards, the three
   headline charts, Farm Analytics & Insights, recent animals / upcoming
   tasks, and recent health alerts — same order, same styling. */
export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const repo = useRepository();
  const router = useRouter();
  const showToast = useToast();
  const cc = useChartColors();
  const { width } = useBreakpoint();
  const { syncing, lastSyncedAt, triggerSync } = useSync();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', due_date: '', priority: 'Medium' });

  const load = useCallback(async () => {
    const [animals, health, finance, production, tasks, breeding, feeding] = await Promise.all([
      repo.list('animals'), repo.list('health_records'), repo.list('finance_records'), repo.list('production_records'),
      repo.list('tasks', { order: 'due_date ASC' }), repo.list('breeding_records'), repo.list('feeding_records'),
    ]);
    setData({ animals, health, finance, production, tasks, breeding, feeding });
  }, [repo]);

  useEffect(() => { load(); }, [load, lastSyncedAt]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await triggerSync();
    await load();
    setRefreshing(false);
  }, [triggerSync, load]);

  async function saveQuickTask() {
    const title = taskForm.title.trim();
    if (!title) { showToast(t('tasksPage.taskTitleRequired'), 'error'); return; }
    await repo.insert('tasks', { title, description: taskForm.description.trim(), due_date: taskForm.due_date || null, priority: taskForm.priority, status: 'Pending' });
    showToast(t('records.added', { item: t('tables.tasks.singular') }), 'success');
    setTaskOpen(false);
    load();
  }

  if (!data) return <Spinner />;

  const sum = computeDashboardSummary(data);
  const summaryItems = [
    { icon: 'cow', color: 'green', label: t('dashboardPage.totalAnimals'), value: sum.totalAnimals, link: '/animals' },
    { icon: 'heart-pulse', color: 'green', label: t('dashboardPage.healthy'), value: sum.healthy, link: '/animals' },
    { icon: 'stethoscope', color: 'orange', label: t('dashboardPage.underTreatment'), value: sum.underTreatment, link: '/health' },
    { icon: 'triangle-exclamation', color: 'red', label: t('dashboardPage.criticalCases'), value: sum.critical, link: '/health' },
    { icon: 'paw', color: 'purple', label: t('dashboardPage.pregnant'), value: sum.pregnant, link: '/breeding' },
    { icon: 'egg', color: 'blue', label: t('dashboardPage.newborns'), value: sum.newborns, link: '/breeding' },
    { icon: 'list-check', color: sum.overdueTasks > 0 ? 'red' : 'orange', label: t('dashboardPage.pendingTasks'), value: sum.pendingTasks, link: '/tasks' },
    { icon: 'arrow-trend-up', color: 'green', label: t('dashboardPage.monthlyIncome'), value: fmtMoney(sum.monthIncome), link: '/finance' },
    { icon: 'arrow-trend-down', color: 'red', label: t('dashboardPage.monthlyExpenses'), value: fmtMoney(sum.monthExpense), link: '/finance' },
    { icon: 'chart-line', color: sum.profitLoss >= 0 ? 'blue' : 'red', label: t('dashboardPage.profitLoss'), value: fmtMoney(sum.profitLoss), link: '/finance' },
  ];

  // Income vs expenses, last 6 months.
  const months = monthBuckets(6, i18n.language);
  const monthTotal = (type, key) => data.finance.filter((f) => f.type === type && ym(f.date) === key).reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const incomeSeries = months.map((m) => monthTotal('Income', m.key));
  const expenseSeries = months.map((m) => monthTotal('Expense', m.key));
  const taskCounts = ['Pending', 'In Progress', 'Completed'].map((st) => data.tasks.filter((tk) => tk.status === st).length);

  const recentAnimals = data.animals.slice().sort((x, y) => new Date(y.created_at) - new Date(x.created_at)).slice(0, 5);
  const upcoming = data.tasks.filter((x) => x.status !== 'Completed').slice(0, 5);
  const alerts = data.health.filter((x) => x.status === 'Under Treatment' || x.status === 'Critical')
    .sort((x, y) => new Date(y.check_date) - new Date(x.check_date)).slice(0, 5);

  const small = width <= 768;

  return (
    <Page refreshing={refreshing || syncing} onRefresh={onRefresh}>
      <PageHeader title={t('dashboardPage.title')} subtitle={t('dashboardPage.subtitle')} />

      <Grid minItemWidth={small ? 160 : 220} columns={width <= 480 ? 2 : undefined} gap={small ? 10 : 16} style={{ marginBottom: 24 }}>
        {summaryItems.map((s) => <SummaryCard key={s.label} icon={s.icon} color={s.color} label={s.label} value={s.value} onPress={() => router.replace(s.link)} />)}
      </Grid>

      <Grid minItemWidth={340} gap={20} fillLast style={{ marginBottom: 24 }}>
        <Card>
          <CardHeader title={t('dashboardPage.chartAnimalHealth')} />
          <CardBody>
            {sum.healthy + sum.underTreatment + sum.critical === 0
              ? <EmptyState icon="chart-pie" title={t('dashboardPage.chartNoAnimalData')} message={t('dashboardPage.chartAddAnimals')} compact />
              : <DonutChart labels={[t('enums.animalHealthStatus.Healthy'), t('enums.animalHealthStatus.Under Treatment'), t('enums.animalHealthStatus.Critical')]} data={[sum.healthy, sum.underTreatment, sum.critical]} colors={[cc.status.good, cc.status.warning, cc.status.critical]} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('dashboardPage.chartIncomeExpenses')} />
          <CardBody>
            {incomeSeries.every((v) => v === 0) && expenseSeries.every((v) => v === 0)
              ? <EmptyState icon="chart-column" title={t('dashboardPage.chartNoFinanceData')} message={t('dashboardPage.chartAddFinance')} compact />
              : <BarChart money legend labels={months.map((m) => m.label)} datasets={[{ label: t('enums.financeType.Income'), data: incomeSeries, color: cc.positive }, { label: t('enums.financeType.Expense'), data: expenseSeries, color: cc.negative }]} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('dashboardPage.chartTaskStatus')} />
          <CardBody>
            {taskCounts.every((v) => v === 0)
              ? <EmptyState icon="clipboard-list" title={t('dashboardPage.chartNoTasksYet')} message={t('dashboardPage.chartAddTasks')} compact />
              : <DonutChart labels={[t('enums.taskStatus.Pending'), t('enums.taskStatus.In Progress'), t('enums.taskStatus.Completed')]} data={taskCounts} colors={[cc.series[3], cc.series[0], cc.brand]} />}
          </CardBody>
        </Card>
      </Grid>

      <FarmAnalytics data={data} />

      <Grid minItemWidth={460} gap={20} style={{ marginBottom: 24 }}>
        <Card>
          <CardHeader title={t('dashboardPage.recentAnimals')} right={<Button size="sm" variant="secondary" title={t('common.viewAll')} onPress={() => router.replace('/animals')} />} />
          <CardBody flush>
            <DataTable
              rows={recentAnimals}
              empty={<EmptyState icon="cow" title={t('dashboardPage.noAnimalsYet')} message={t('dashboardPage.addFirstAnimal')} />}
              columns={[
                { key: 'tag_id', label: t('tables.animals.fields.tag_id'), strong: true },
                { key: 'name', label: t('tables.animals.fields.name') },
                { key: 'species', label: t('tables.animals.fields.species'), render: (a) => t(`enums.species.${a.species}`, a.species) },
                { key: 'breed', label: t('tables.animals.fields.breed') },
                { key: 'health_status', label: t('tables.animals.fields.health_status'), render: (a) => <StatusBadge status={a.health_status} /> },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title={t('dashboardPage.upcomingTasks')}
            right={
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button size="sm" icon="plus" title={t('dashboardPage.add')} onPress={() => { setTaskForm({ title: '', description: '', due_date: '', priority: 'Medium' }); setTaskOpen(true); }} />
                <Button size="sm" variant="secondary" title={t('common.viewAll')} onPress={() => router.replace('/tasks')} />
              </View>
            }
          />
          <CardBody flush>
            <DataTable
              rows={upcoming}
              empty={<EmptyState icon="clipboard-check" title={t('dashboardPage.noPendingTasks')} message={t('dashboardPage.allCaughtUp')} />}
              columns={[
                { key: 'title', label: t('tables.tasks.fields.title'), strong: true },
                { key: 'due_date', label: t('tables.tasks.fields.due_date'), render: (tk) => (isOverdueTask(tk) ? <DueDate value={tk.due_date} /> : fmtDate(tk.due_date)) },
                { key: 'priority', label: t('tables.tasks.fields.priority'), render: (tk) => <PriorityBadge priority={tk.priority} /> },
                { key: 'status', label: t('tables.tasks.fields.status'), render: (tk) => <StatusBadge status={tk.status} /> },
              ]}
            />
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader title={t('dashboardPage.recentHealthAlerts')} icon="triangle-exclamation" iconColor={cc.status.warning} right={<Button size="sm" variant="secondary" title={t('common.viewAll')} onPress={() => router.replace('/health')} />} />
        <CardBody flush>
          <DataTable
            rows={alerts}
            empty={<EmptyState icon="shield-heart" title={t('dashboardPage.noHealthAlerts')} message={t('dashboardPage.allAnimalsHealthy')} />}
            columns={[
              { key: 'tag_id', label: t('tables.animals.fields.tag_id'), strong: true },
              { key: 'disease', label: t('tables.health_records.fields.disease') },
              { key: 'treatment', label: t('tables.health_records.fields.treatment') },
              { key: 'status', label: t('tables.health_records.fields.status'), render: (h) => <StatusBadge status={h.status} /> },
            ]}
          />
        </CardBody>
      </Card>

      <Modal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        title={t('dashboardPage.quickAddTask')}
        footer={<>
          <Button variant="secondary" title={t('common.cancel')} onPress={() => setTaskOpen(false)} />
          <Button icon="check" title={t('dashboardPage.saveTask')} onPress={saveQuickTask} />
        </>}
      >
        <FormGroup label={t('tables.tasks.fields.title')} required>
          <Input placeholder={t('dashboardPage.taskTitlePlaceholder')} value={taskForm.title} onChangeText={(v) => setTaskForm({ ...taskForm, title: v })} />
        </FormGroup>
        <FormGroup label={t('tables.tasks.fields.description')}>
          <Input multiline placeholder={t('dashboardPage.taskDescPlaceholder')} value={taskForm.description} onChangeText={(v) => setTaskForm({ ...taskForm, description: v })} />
        </FormGroup>
        <FormGroup label={t('tables.tasks.fields.due_date')}>
          <DateField value={taskForm.due_date} onChange={(v) => setTaskForm({ ...taskForm, due_date: v })} />
        </FormGroup>
        <FormGroup label={t('tables.tasks.fields.priority')}>
          <Select value={taskForm.priority} onChange={(v) => setTaskForm({ ...taskForm, priority: v })} placeholder={t('tables.tasks.fields.priority')}
            options={['Low', 'Medium', 'High'].map((p) => ({ value: p, label: t(`enums.taskPriority.${p}`) }))} />
        </FormGroup>
      </Modal>
    </Page>
  );
}

/* Overdue due dates render red and bold, as on the web. */
function DueDate({ value }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.red, fontWeight: '600', fontSize: 13 }}>{fmtDate(value)}</Text>;
}
