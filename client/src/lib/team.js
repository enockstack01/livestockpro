import { relativeDay } from '../../../shared/dashboardFeed';

/* A readable message for a team API error (server/lib/farmTeam.js codes). */
export function teamErrorText(t, error) {
  if (!error) return '';
  if (error.code && t(`team.errors.${error.code}`, { defaultValue: '' })) return t(`team.errors.${error.code}`);
  return error.message || t('auth.somethingWentWrong');
}

/* "Today", "2 days ago", or "Not yet" for a collector who has recorded nothing. */
export const lastActive = (iso, t) => (iso ? relativeDay(iso, t) : t('team.notYet'));
