import { useTranslation } from 'react-i18next';
import { useChartTheme } from '../../lib/chartTheme.js';
import { fmtMoney } from '../../../../shared/chartPalette';
import TileGrid from './TileGrid.jsx';
import { MiniColumns, Meter, SeriesValues, Sparkline, SparkDot } from './MicroViz.jsx';
import { formatCompact, formatMoneyCompact } from '../../../../shared/currency';

/* "Farm at a glance": each headline number with a small chart of what's
   behind it (6-month trend, share of the whole, or month-by-month result)
   instead of a bare figure. Same tiles as the mobile app
   (mobile/src/screens/dashboard/GlanceTiles.js); data from
   shared/analytics.js computeGlance(). */

function Tile({ icon, tone, label, value, badge, onClick, wide, title, children }) {
  return (
    <button type="button" className={`glance-tile${wide ? ' wide' : ''}`} onClick={onClick} title={title}>
      <span className="glance-head">
        <span className={`glance-icon tone-${tone}`}><i className={`fas fa-${icon}`} /></span>
        <span className="glance-label">{label}</span>
      </span>
      <span className="glance-value-row">
        <span className="glance-value">{value}</span>
        {badge}
      </span>
      <span className="glance-viz">{children}</span>
    </button>
  );
}

const Badge = ({ tone, icon, children, title }) => (
  <span className={`glance-badge tone-${tone}`} title={title}><i className={`fas fa-${icon}`} />{children}</span>
);

export default function GlanceTiles({ g, onOpen }) {
  const { t } = useTranslation();
  const ct = useChartTheme();
  const L = g.labels;
  const spark = (values, color, fmt, compact) => (
    <>
      <span className="spark-wrap"><Sparkline values={values} color={color} labels={L} fmt={fmt} /><SparkDot values={values} color={color} /></span>
      <SeriesValues values={values} fmt={compact} months={g.monthNames} />
    </>
  );
  const monthName = L[L.length - 1];

  return (
    <TileGrid className="glance-grid" minTile={150}>
      <Tile icon="cow" tone="green" label={t('dashboardPage.totalAnimals')} value={g.animals.total.toLocaleString()} onClick={() => onOpen('/animals')}
        badge={g.animals.addedThisMonth > 0 && <Badge tone="green" icon="arrow-up" title={monthName}>{g.animals.addedThisMonth}</Badge>}>
        {spark(g.animals.series, ct.brand, (v) => v.toLocaleString(), formatCompact)}
      </Tile>

      <Tile icon="paw" tone="purple" label={t('dashboardPage.pregnant')} value={g.pregnant.count} onClick={() => onOpen('/breeding')}
        badge={g.pregnant.females > 0 && <span className="glance-muted" title={t('analytics.part.female')}><i className="fas fa-venus" /> {g.pregnant.females}</span>}>
        <Meter value={g.pregnant.count} max={Math.max(g.pregnant.count, g.pregnant.females)} color={ct.series[6]} title={`${g.pregnant.count} / ${g.pregnant.females}`} />
        <span className="glance-caption">{g.pregnant.females > 0 ? Math.round((g.pregnant.count / g.pregnant.females) * 100) : 0}%</span>
      </Tile>

      <Tile icon="baby" tone="blue" label={t('dashboardPage.newborns')} value={g.newborns.total} onClick={() => onOpen('/breeding')}>
        <MiniColumns values={g.newborns.series} color={ct.series[0]} labels={L} />
        <span className="glance-axis">{g.monthNames.map((m, i) => <span key={i}>{m}</span>)}</span>
      </Tile>

      <Tile icon="list-check" tone={g.tasks.overdue > 0 ? 'red' : 'orange'} label={t('dashboardPage.pendingTasks')} value={g.tasks.pending} onClick={() => onOpen('/tasks')}
        badge={g.tasks.overdue > 0 && <Badge tone="red" icon="clock" title={t('dashboardPage.overdue')}>{g.tasks.overdue}</Badge>}>
        <Meter value={g.tasks.done} max={g.tasks.total} color={ct.brand} title={`${g.tasks.done} / ${g.tasks.total} ${t('enums.taskStatus.Completed')}`} />
        <span className="glance-caption"><i className="fas fa-circle-check" style={{ color: ct.brand }} /> {g.tasks.done} / {g.tasks.total}</span>
      </Tile>

      <Tile icon="arrow-trend-up" tone="blue" label={t('dashboardPage.monthlyIncome')} value={fmtMoney(g.income.month)} onClick={() => onOpen('/finance')}>
        {spark(g.income.series, ct.positive, fmtMoney, formatCompact)}
      </Tile>

      <Tile icon="arrow-trend-down" tone="red" label={t('dashboardPage.monthlyExpenses')} value={fmtMoney(g.expense.month)} onClick={() => onOpen('/finance')}>
        {spark(g.expense.series, ct.negative, fmtMoney, formatCompact)}
      </Tile>

      <Tile wide icon="scale-balanced" tone={g.net.month >= 0 ? 'blue' : 'red'} label={t('dashboardPage.profitLoss')} value={fmtMoney(g.net.month)} onClick={() => onOpen('/finance')}
        badge={<span className="glance-muted">{t('dashboardPage.sixMonths')}: <b>{fmtMoney(g.net.total)}</b></span>}>
        <MiniColumns values={g.net.series} color={ct.positive} negColor={ct.negative} labels={L} fmt={fmtMoney} valueFmt={(v) => formatMoneyCompact(v)} height={48} />
        <span className="glance-axis">{g.monthNames.map((m, i) => <span key={i}>{m}</span>)}</span>
      </Tile>
    </TileGrid>
  );
}
