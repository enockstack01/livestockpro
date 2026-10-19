const { col } = require('./orgs');

/* The organization dashboard, livestock only, built from farmer_stats
   (refreshed hourly and on join) for the farmers with an ACTIVE link to the
   organization at the moment of the request, so a farmer who leaves stops
   appearing straight away.

   filters: { from, to } months (YYYY-MM) for the activity figures,
            { district, sector, cell } location, { q } farmer search.
   Every headline figure carries the ids of the farmers behind it so the
   apps can drill down to the farmer list. */

const ym = (d) => d.toISOString().slice(0, 7);

function monthRange(from, to, count = 12) {
  const end = to && /^\d{4}-\d{2}$/.test(to) ? new Date(`${to}-01T00:00:00Z`) : new Date();
  const start = from && /^\d{4}-\d{2}$/.test(from) ? new Date(`${from}-01T00:00:00Z`) : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (count - 1), 1));
  const out = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (d <= end && out.length < 36) {
    out.push(ym(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function matchesFilters(s, f) {
  if (f.district && (s.district || '').toLowerCase() !== f.district.toLowerCase()) return false;
  if (f.sector && (s.sector || '').toLowerCase() !== f.sector.toLowerCase()) return false;
  if (f.cell && (s.cell || '').toLowerCase() !== f.cell.toLowerCase()) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (![s.name, s.farm_name, s.email, s.phone, s.district, s.sector].some((v) => (v || '').toLowerCase().includes(q))) return false;
  }
  return true;
}

async function orgFarmers(orgId, { includePending = false } = {}) {
  const statuses = includePending ? ['active', 'pending_consent'] : ['active'];
  const links = await col('farmer_organization').find({ organization_id: orgId, status: { $in: statuses } }).toArray();
  const stats = await col('farmer_stats').find({ farmer_id: { $in: links.map((l) => l.farmer_id) } }).toArray();
  const byId = new Map(stats.map((s) => [s.farmer_id, s]));
  return links.map((l) => ({ link: l, stats: byId.get(l.farmer_id) || { farmer_id: l.farmer_id, name: 'Farmer', herd: { total: 0, by_species: {}, by_status: {} }, months: {} } }));
}

/* One row of the farmer list. */
function farmerRow({ link, stats: s }) {
  const species = Object.entries((s.herd && s.herd.by_species) || {}).sort((a, b) => b[1] - a[1]);
  return {
    farmer_id: link.farmer_id,
    name: s.name,
    farm_name: s.farm_name || '',
    phone: s.phone || '',
    district: s.district || '',
    sector: s.sector || '',
    cell: s.cell || '',
    herd_size: (s.herd && s.herd.total) || 0,
    main_species: species.slice(0, 3).map(([k, v]) => ({ species: k, count: v })),
    open_cases: s.open_cases || 0,
    critical_now: s.critical_now || 0,
    overdue_tasks: s.overdue_tasks || 0,
    joined_at: link.joined_at,
    last_activity: s.last_activity,
    status: link.status,
    detail_access: Boolean(link.detail_access)
  };
}

async function computeDashboard(org, filters = {}) {
  const rows = (await orgFarmers(org._id)).filter((r) => matchesFilters(r.stats, filters));
  const months = monthRange(filters.from, filters.to);
  const thisMonth = ym(new Date());
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const ids = (pred) => rows.filter(pred).map((r) => r.link.farmer_id);

  const sum = (field) => months.map((m) => rows.reduce((n, r) => n + (((r.stats.months || {})[m] || {})[field] || 0), 0));
  const total = (field) => sum(field).reduce((a, b) => a + b, 0);

  const species = {};
  const status = { Healthy: 0, 'Under Treatment': 0, Critical: 0 };
  const locations = {};
  const diseases = {};
  rows.forEach(({ stats: s }) => {
    Object.entries((s.herd && s.herd.by_species) || {}).forEach(([k, v]) => { species[k] = (species[k] || 0) + v; });
    Object.entries((s.herd && s.herd.by_status) || {}).forEach(([k, v]) => { if (status[k] !== undefined) status[k] += v; });
    const loc = [s.district || '', s.sector || ''].filter(Boolean).join(' · ') || '';
    const l = (locations[loc] = locations[loc] || { label: loc, farmers: 0, animals: 0 });
    l.farmers++;
    l.animals += (s.herd && s.herd.total) || 0;
    Object.entries(s.diseases_30d || {}).forEach(([d, n]) => {
      const key = d.toLowerCase();
      const e = (diseases[key] = diseases[key] || { name: d, cases: 0, farmers: 0 });
      e.cases += n;
      e.farmers++;
    });
  });

  const inactive = ids((r) => !r.stats.last_activity || r.stats.last_activity < since30);
  return {
    generated_at: new Date().toISOString(),
    stats_updated_at: rows.reduce((m, r) => (r.stats.updated_at && (!m || r.stats.updated_at < m) ? r.stats.updated_at : m), null),
    months,
    overview: {
      farmers: rows.length,
      new_this_month: ids((r) => (r.link.joined_at || '').slice(0, 7) === thisMonth),
      active_30d: ids((r) => r.stats.last_activity && r.stats.last_activity >= since30),
      limit: org.max_farmers,
      used: org.active_farmers
    },
    herd: {
      animals: rows.reduce((n, r) => n + ((r.stats.herd && r.stats.herd.total) || 0), 0),
      by_species: Object.entries(species).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ species: k, count: v })),
      by_status: status,
      pregnant: rows.reduce((n, r) => n + (r.stats.pregnant || 0), 0)
    },
    health: {
      events: sum('health_events'),
      vaccinations: sum('vaccinations'),
      recovered: sum('recovered'),
      critical: sum('critical'),
      totals: { events: total('health_events'), vaccinations: total('vaccinations'), recovered: total('recovered') },
      open_cases: rows.reduce((n, r) => n + (r.stats.open_cases || 0), 0),
      diseases_30d: Object.values(diseases).sort((a, b) => b.cases - a.cases).slice(0, 8)
    },
    breeding: { births: sum('births'), newborns: sum('newborns'), totals: { births: total('births'), newborns: total('newborns') } },
    production: { milk: sum('milk'), eggs: sum('eggs'), meat: sum('meat'), totals: { milk: total('milk'), eggs: total('eggs'), meat: total('meat') } },
    activity: { records: sum('records'), animals_added: sum('animals_added') },
    locations: Object.values(locations).sort((a, b) => b.farmers - a.farmers),
    points: rows.filter((r) => r.stats.lat != null && r.stats.lng != null).map((r) => ({ farmer_id: r.link.farmer_id, name: r.stats.name, lat: r.stats.lat, lng: r.stats.lng, animals: (r.stats.herd && r.stats.herd.total) || 0 })),
    alerts: {
      inactive,
      critical: ids((r) => (r.stats.critical_now || 0) > 0),
      overdue_tasks: ids((r) => (r.stats.overdue_tasks || 0) > 0),
      disease_reports: ids((r) => Object.keys(r.stats.diseases_30d || {}).length > 0)
    }
  };
}

async function farmerList(org, filters = {}) {
  const rows = (await orgFarmers(org._id, { includePending: true })).filter((r) => matchesFilters(r.stats, filters));
  let list = rows.map(farmerRow);
  if (filters.ids && filters.ids.length) {
    const set = new Set(filters.ids);
    list = list.filter((r) => set.has(r.farmer_id));
  }
  return list.sort((a, b) => (b.joined_at || '').localeCompare(a.joined_at || ''));
}

module.exports = { computeDashboard, farmerList, orgFarmers, monthRange };
