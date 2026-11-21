const express = require('express');
const { requireAuth, clerkClient } = require('../authMiddleware');
const { requireApproved } = require('../lib/accounts');
const { isOrgAccount } = require('../lib/orgs');
const T = require('../lib/farmTeam');

const router = express.Router();
router.use(requireAuth);
router.use(requireApproved);

/* /api/team — the farm manager's team of data collectors. */

/* Only a farm manager (a farmer account that is not itself a collector or
   an organization member) manages a team. */
async function managerOnly(req, res, next) {
  try {
    const scope = await T.farmScope(req.user.id);
    if (scope.role !== 'manager' || (await isOrgAccount(req.user.id))) {
      return res.status(403).json({ error: { message: 'Only a farm manager can manage a team.', code: 'MANAGER_ONLY' } });
    }
    next();
  } catch (err) { T.sendTeamError(res, err); }
}

router.get('/', managerOnly, async (req, res) => {
  try { res.json({ data: await T.teamOverview(req.user.id), error: null }); } catch (err) { T.sendTeamError(res, err); }
});

router.get('/activity', managerOnly, async (req, res) => {
  try { res.json({ data: await T.teamActivity(req.user.id, Math.min(Number(req.query.limit) || 30, 100)), error: null }); } catch (err) { T.sendTeamError(res, err); }
});

router.post('/invites', managerOnly, async (req, res) => {
  try { res.json({ data: await T.inviteCollector({ ownerId: req.user.id, details: req.body || {}, clerkClient }), error: null }); } catch (err) { T.sendTeamError(res, err); }
});

router.delete('/invites/:id', managerOnly, async (req, res) => {
  try { await T.revokeInvite({ ownerId: req.user.id, inviteId: req.params.id, clerkClient }); res.json({ data: null, error: null }); } catch (err) { T.sendTeamError(res, err); }
});

router.delete('/members/:id', managerOnly, async (req, res) => {
  try { await T.removeCollector({ ownerId: req.user.id, memberId: req.params.id }); res.json({ data: null, error: null }); } catch (err) { T.sendTeamError(res, err); }
});

module.exports = router;
