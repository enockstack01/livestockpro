const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireRole, getRole, primaryEmail, clerkClient } = require('../authMiddleware');

const router = express.Router();

const RESOURCE_COLLECTIONS = ['animals', 'health_records', 'feeding_records', 'breeding_records', 'production_records', 'finance_records', 'tasks'];
const VALID_ROLES = ['user', 'admin', 'super_admin'];

router.use(requireAuth);

/* GET /api/admin/role — any authenticated user; lets the frontend decide
   whether to show admin UI at all, without exposing admin data to them. */
router.get('/role', async (req, res) => {
  try {
    const role = await getRole(req.user.id);
    res.json({ data: { role }, error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

/* Everything below requires at least 'admin'. */
router.use(requireRole('admin'));

/* GET /api/admin/stats — platform-wide totals */
router.get('/stats', async (req, res) => {
  try {
    const db = getDb();

    async function groupCounts(collection, field) {
      const rows = await db.collection(collection).aggregate([
        { $group: { _id: { $ifNull: [`$${field}`, 'Unspecified'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();
      const out = {};
      rows.forEach((r) => { out[r._id] = r.count; });
      return out;
    }

    const [userList, healthBreakdown, speciesBreakdown, taskBreakdown, ...counts] = await Promise.all([
      clerkClient.users.getUserList({ limit: 500 }),
      groupCounts('animals', 'health_status'),
      groupCounts('animals', 'species'),
      groupCounts('tasks', 'status'),
      ...RESOURCE_COLLECTIONS.map((name) => db.collection(name).countDocuments({}))
    ]);

    const byCollection = {};
    RESOURCE_COLLECTIONS.forEach((name, i) => { byCollection[name] = counts[i]; });
    const totalRecords = counts.reduce((s, c) => s + c, 0);

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newUsersLast7Days = userList.data.filter((u) => u.createdAt >= sevenDaysAgo).length;
    const bannedUsers = userList.data.filter((u) => u.banned).length;

    res.json({
      data: {
        totalUsers: userList.totalCount,
        totalRecords,
        byCollection,
        newUsersLast7Days,
        bannedUsers,
        healthBreakdown,
        speciesBreakdown,
        taskBreakdown
      },
      error: null
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

const COLLECTION_LABELS = {
  animals: 'Animal', health_records: 'Health Record', feeding_records: 'Feeding Record',
  breeding_records: 'Breeding Record', production_records: 'Production Record',
  finance_records: 'Finance Record', tasks: 'Task'
};
const DATE_FIELD = {
  animals: 'last_check_date', health_records: 'check_date', feeding_records: 'feeding_date',
  breeding_records: 'breeding_date', production_records: 'production_date', finance_records: 'date', tasks: 'due_date'
};
const TITLE_FIELD = {
  animals: (d) => d.tag_id || d.name, health_records: (d) => (d.tag_id || '—') + (d.disease ? ` — ${d.disease}` : ''),
  feeding_records: (d) => d.feed_type, breeding_records: (d) => d.tag_id,
  production_records: (d) => (d.tag_id ? `${d.tag_id} — ` : '') + (d.production_type || ''),
  finance_records: (d) => (d.category || d.type || 'Transaction'), tasks: (d) => d.title
};

/* GET /api/admin/spatial — every georeferenced record on the platform, for
   the map. Includes which farm/user each point belongs to. */
router.get('/spatial', async (req, res) => {
  try {
    const db = getDb();
    const [userList, ...collectionDocs] = await Promise.all([
      clerkClient.users.getUserList({ limit: 500 }),
      ...RESOURCE_COLLECTIONS.map((name) => db.collection(name).find({
        latitude: { $exists: true, $ne: null }, longitude: { $exists: true, $ne: null }
      }).toArray())
    ]);

    const profiles = await db.collection('profiles').find({}).toArray();
    const farmByUser = {};
    profiles.forEach((p) => { farmByUser[p.user_id] = p.farm_name || ''; });
    const emailByUser = {};
    userList.data.forEach((u) => { emailByUser[u.id] = primaryEmail(u); });

    const points = [];
    RESOURCE_COLLECTIONS.forEach((name, i) => {
      collectionDocs[i].forEach((doc) => {
        points.push({
          id: doc._id,
          collection: name,
          type: COLLECTION_LABELS[name],
          latitude: doc.latitude,
          longitude: doc.longitude,
          district: doc.district || '',
          title: (TITLE_FIELD[name] && TITLE_FIELD[name](doc)) || name,
          date: doc[DATE_FIELD[name]] || null,
          status: doc.health_status || doc.status || doc.pregnancy_status || null,
          userEmail: emailByUser[doc.user_id] || 'Unknown',
          farmName: farmByUser[doc.user_id] || ''
        });
      });
    });

    res.json({ data: points, error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

/* GET /api/admin/users — every platform user + their resource footprint */
router.get('/users', async (req, res) => {
  try {
    const db = getDb();
    const list = await clerkClient.users.getUserList({ limit: 500 });
    const sorted = list.data.slice().sort((a, b) => b.createdAt - a.createdAt);

    const users = await Promise.all(sorted.map(async (u) => {
      const [profile, ...counts] = await Promise.all([
        db.collection('profiles').findOne({ user_id: u.id }),
        ...RESOURCE_COLLECTIONS.map((name) => db.collection(name).countDocuments({ user_id: u.id }))
      ]);
      const byCollection = {};
      RESOURCE_COLLECTIONS.forEach((name, i) => { byCollection[name] = counts[i]; });
      return {
        id: u.id,
        email: primaryEmail(u),
        createdAt: u.createdAt,
        lastSignInAt: u.lastSignInAt,
        banned: !!u.banned,
        role: (u.publicMetadata && u.publicMetadata.role) || 'user',
        farmName: (profile && profile.farm_name) || '',
        location: (profile && profile.location) || '',
        recordCount: counts.reduce((s, c) => s + c, 0),
        byCollection
      };
    }));

    res.json({ data: users, error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

/* PATCH /api/admin/users/:id/status  { banned } — admin or super_admin.
   A plain admin may only act on regular users; only a super_admin may
   ban/unban another admin. */
router.patch('/users/:id/status', async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      return res.status(400).json({ error: { message: 'You cannot change your own account status.' } });
    }
    const targetRole = await getRole(targetId);
    if (targetRole !== 'user' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: "Only a super admin can change an admin's status." } });
    }
    const banned = !!req.body.banned;
    if (banned) await clerkClient.users.banUser(targetId);
    else await clerkClient.users.unbanUser(targetId);
    res.json({ data: { id: targetId, banned }, error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

/* PATCH /api/admin/users/:id/role  { role }
   - super_admin: may set any role on anyone (except themselves).
   - admin: may ONLY promote a plain 'user' to 'admin' — cannot touch an
     existing admin/super_admin, and cannot grant super_admin to anyone. */
router.patch('/users/:id/role', async (req, res) => {
  try {
    const targetId = req.params.id;
    const role = req.body.role;
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: { message: 'Invalid role.' } });
    }
    if (targetId === req.user.id) {
      return res.status(400).json({ error: { message: 'You cannot change your own role.' } });
    }

    if (req.user.role !== 'super_admin') {
      const targetRole = await getRole(targetId);
      if (targetRole !== 'user' || role !== 'admin') {
        return res.status(403).json({ error: { message: 'Admins can only promote a regular user to admin. Only a super admin can change other roles.' } });
      }
    }

    if (role !== 'super_admin') {
      const list = await clerkClient.users.getUserList({ limit: 500 });
      const superAdmins = list.data.filter((u) => u.publicMetadata && u.publicMetadata.role === 'super_admin');
      if (superAdmins.length <= 1 && superAdmins.some((u) => u.id === targetId)) {
        return res.status(400).json({ error: { message: 'Cannot remove the last super admin.' } });
      }
    }
    await clerkClient.users.updateUserMetadata(targetId, { publicMetadata: { role } });
    res.json({ data: { id: targetId, role }, error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

/* ── One Health intelligence ───────────────────────────────────────────────
   Computed on demand from live health_records/animals data — no separate
   store, no background job. Priority watchlist of zoonotic and major
   transboundary livestock diseases, matched against the free-text `disease`
   field; not exhaustive, meant as a sensible starting point. */
const ONE_HEALTH_WATCHLIST = [
  { disease: 'Anthrax', keywords: ['anthrax'], zoonotic: true, severity: 'critical' },
  { disease: 'Rabies', keywords: ['rabies', 'rabid'], zoonotic: true, severity: 'critical' },
  { disease: 'Highly Pathogenic Avian Influenza', keywords: ['avian influenza', 'bird flu', 'h5n1', 'h5n8', 'hpai'], zoonotic: true, severity: 'critical' },
  { disease: 'Rift Valley Fever', keywords: ['rift valley fever', 'rvf'], zoonotic: true, severity: 'critical' },
  { disease: 'Brucellosis', keywords: ['brucellosis', 'brucella'], zoonotic: true, severity: 'high' },
  { disease: 'Bovine Tuberculosis', keywords: ['bovine tuberculosis', 'bovine tb'], zoonotic: true, severity: 'high' },
  { disease: 'Q Fever', keywords: ['q fever', 'coxiella'], zoonotic: true, severity: 'high' },
  { disease: 'Leptospirosis', keywords: ['leptospirosis', 'leptospira'], zoonotic: true, severity: 'high' },
  { disease: 'Trypanosomiasis', keywords: ['trypanosomiasis', 'nagana'], zoonotic: true, severity: 'medium' },
  { disease: 'Foot-and-Mouth Disease', keywords: ['foot-and-mouth', 'foot and mouth', 'fmd'], zoonotic: false, severity: 'high' },
  { disease: 'Peste des Petits Ruminants', keywords: ['peste des petits ruminants', 'ppr'], zoonotic: false, severity: 'high' },
  { disease: 'African Swine Fever', keywords: ['african swine fever', 'asf'], zoonotic: false, severity: 'high' },
  { disease: 'Newcastle Disease', keywords: ['newcastle disease'], zoonotic: false, severity: 'medium' },
  { disease: 'Lumpy Skin Disease', keywords: ['lumpy skin disease'], zoonotic: false, severity: 'medium' },
  { disease: 'Contagious Bovine Pleuropneumonia', keywords: ['contagious bovine pleuropneumonia', 'cbpp'], zoonotic: false, severity: 'medium' }
];

const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
function bumpSeverity(base, extra) {
  const order = ['low', 'medium', 'high', 'critical'];
  return order[Math.min(order.length - 1, SEVERITY_RANK[base] + Math.max(0, Math.floor(extra / 3)))];
}
function isoDate(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/* GET /api/admin/onehealth — disease risk alerts computed live from this
   farm network's health records. admin or super_admin only. */
router.get('/onehealth', async (req, res) => {
  try {
    const db = getDb();
    const since30 = isoDate(30);
    const since7 = isoDate(7);
    const since14 = isoDate(14);

    const [records, criticalAnimals, userList, profiles] = await Promise.all([
      db.collection('health_records').find({ check_date: { $gte: since30 } }).toArray(),
      db.collection('animals').find({ health_status: 'Critical' }).toArray(),
      clerkClient.users.getUserList({ limit: 500 }),
      db.collection('profiles').find({}).toArray()
    ]);

    const farmByUser = {};
    profiles.forEach((p) => { farmByUser[p.user_id] = p.farm_name || ''; });
    const emailByUser = {};
    userList.data.forEach((u) => { emailByUser[u.id] = primaryEmail(u); });
    const farmLabel = (userId) => farmByUser[userId] || emailByUser[userId] || 'Unknown farm';

    const alerts = new Map();
    const upsert = (key, alert) => {
      const existing = alerts.get(key);
      if (!existing) { alerts.set(key, alert); return; }
      existing.farms = [...new Set([...existing.farms, ...alert.farms])];
      existing.count += alert.count;
      existing.recordIds = [...new Set([...existing.recordIds, ...alert.recordIds])];
      if (SEVERITY_RANK[alert.severity] > SEVERITY_RANK[existing.severity]) existing.severity = alert.severity;
      if (alert.detectedAt > existing.detectedAt) existing.detectedAt = alert.detectedAt;
    };

    /* 1) Watchlist keyword matches on disease/notes text */
    records.forEach((r) => {
      const text = `${r.disease || ''} ${r.notes || ''}`.toLowerCase();
      if (!text.trim()) return;
      ONE_HEALTH_WATCHLIST.forEach((entry) => {
        if (!entry.keywords.some((k) => text.includes(k))) return;
        upsert(`watchlist:${entry.disease}:${r.user_id}`, {
          type: 'watchlist',
          disease: entry.disease,
          zoonotic: entry.zoonotic,
          severity: entry.severity,
          title: `${entry.disease} suspected — ${farmLabel(r.user_id)}`,
          description: `${entry.disease}${entry.zoonotic ? ' (zoonotic)' : ''} matched on a health record${r.district ? ` in ${r.district}` : ''}.`,
          farms: [farmLabel(r.user_id)],
          count: 1,
          district: r.district || null,
          detectedAt: r.check_date || since30,
          recordIds: [r._id]
        });
      });
    });

    /* 2) Critical-status clustering per farm — this schema has no death/mortality
       field, so a burst of Critical statuses is the closest available severity signal */
    const criticalByFarm = new Map();
    const pushCritical = (userId, item) => {
      if (!criticalByFarm.has(userId)) criticalByFarm.set(userId, []);
      criticalByFarm.get(userId).push(item);
    };
    criticalAnimals.filter((a) => (a.last_check_date || '') >= since7).forEach((a) => pushCritical(a.user_id, a));
    records.filter((r) => r.status === 'Critical' && (r.check_date || '') >= since7).forEach((r) => pushCritical(r.user_id, r));
    criticalByFarm.forEach((items, userId) => {
      if (items.length < 3) return;
      upsert(`critical:${userId}`, {
        type: 'critical_cluster',
        disease: null,
        zoonotic: false,
        severity: bumpSeverity('medium', items.length - 3),
        title: `Critical health cluster — ${farmLabel(userId)}`,
        description: `${items.length} animals/records marked Critical at this farm in the last 7 days.`,
        farms: [farmLabel(userId)],
        count: items.length,
        district: items.find((i) => i.district)?.district || null,
        detectedAt: isoDate(0),
        recordIds: items.map((i) => i._id)
      });
    });

    /* 3) Cross-farm disease clustering by district — the strongest early signal
       of a possible outbreak, since it needs no diagnosis on the watchlist */
    const byDistrictDisease = new Map();
    records.filter((r) => (r.check_date || '') >= since14 && r.disease && r.disease.trim()).forEach((r) => {
      const district = r.district || 'Unknown district';
      const key = `${district}::${r.disease.trim().toLowerCase()}`;
      if (!byDistrictDisease.has(key)) byDistrictDisease.set(key, []);
      byDistrictDisease.get(key).push(r);
    });
    byDistrictDisease.forEach((items, key) => {
      const farmSet = new Set(items.map((r) => r.user_id));
      if (farmSet.size < 3) return;
      const district = key.split('::')[0];
      const label = items[0].disease.trim();
      const latest = items.reduce((a, b) => ((b.check_date || '') > (a.check_date || '') ? b : a));
      upsert(`cluster:${key}`, {
        type: 'outbreak_cluster',
        disease: label,
        zoonotic: false,
        severity: bumpSeverity('medium', farmSet.size - 3),
        title: `Possible outbreak cluster — "${label}" in ${district}`,
        description: `"${label}" reported across ${farmSet.size} different farms in ${district} within the last 14 days.`,
        farms: [...farmSet].map(farmLabel),
        count: items.length,
        district,
        detectedAt: latest.check_date || since14,
        recordIds: items.map((i) => i._id)
      });
    });

    const list = [...alerts.values()].sort((a, b) => (b.detectedAt || '').localeCompare(a.detectedAt || ''));
    res.json({
      data: {
        alerts: list,
        summary: {
          total: list.length,
          zoonotic: list.filter((a) => a.zoonotic).length,
          bySeverity: {
            critical: list.filter((a) => a.severity === 'critical').length,
            high: list.filter((a) => a.severity === 'high').length,
            medium: list.filter((a) => a.severity === 'medium').length,
            low: list.filter((a) => a.severity === 'low').length
          },
          recordsScanned: records.length
        }
      },
      error: null
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

/* DELETE /api/admin/users/:id — super_admin only. Wipes the user's Mongo
   documents and their Clerk account entirely. */
router.delete('/users/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      return res.status(400).json({ error: { message: 'Use Settings to delete your own account.' } });
    }
    const db = getDb();
    await Promise.all(['profiles', ...RESOURCE_COLLECTIONS].map((name) => db.collection(name).deleteMany({ user_id: targetId })));
    await clerkClient.users.deleteUser(targetId);
    res.json({ data: {}, error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

module.exports = router;
