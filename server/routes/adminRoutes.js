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
