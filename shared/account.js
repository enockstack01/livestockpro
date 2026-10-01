/* Account types offered on the account request form, and the rules both
   clients use to show a user's name. Mirrors server/lib/accounts.js's
   ACCOUNT_TYPES (the server is the authority). */

export const ACCOUNT_TYPES = ['farmer', 'veterinarian', 'extension_officer', 'cooperative', 'researcher', 'student', 'other'];

/* Font Awesome names (the mobile Icon component maps the same names). */
export const ACCOUNT_TYPE_ICONS = {
  farmer: 'tractor',
  veterinarian: 'stethoscope',
  extension_officer: 'chalkboard-user',
  cooperative: 'people-group',
  researcher: 'flask',
  student: 'graduation-cap',
  other: 'user'
};

/* Statuses as the client sees them: 'none' means no request submitted yet. */
export const ACCOUNT_STATUS = { NONE: 'none', PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', ON_HOLD: 'on_hold' };

/* By default a user is called by their account type ("Farmer"); admins
   without a request on file are called by their role instead. */
export function accountDisplayName(t, account, role) {
  if (account && account.accountType) return t(`account.types.${account.accountType}`);
  if (role === 'super_admin') return t('adminDashboard.roleSuperAdmin');
  if (role === 'admin') return t('adminDashboard.roleAdmin');
  return t('account.types.farmer');
}
