/* Status -> tone-name mapping lives in shared/statusMaps.js, imported by both
   this file and mobile/src/components/Badges.js, so the two clients can never
   quietly drift on "what color is a Critical animal". Each client still maps
   tone-name -> its own rendering (this file: a CSS class; mobile: a hex pair)
   since a React Native <View> and a <span className> aren't the same kind of
   thing to share further than that. */
import { useTranslation } from 'react-i18next';
import { STATUS_TONE, PRIORITY_TONE, PREGNANCY_TONE } from '../../../shared/statusMaps';

export function StatusBadge({ status }) {
  const { t } = useTranslation();
  if (!status) return null;
  return <span className={`badge badge-${STATUS_TONE[status] || 'gray'}`}>{t(`enums.statusBadge.${status}`, status)}</span>;
}

export function PriorityBadge({ priority }) {
  const { t } = useTranslation();
  const value = priority || 'Medium';
  return <span className={`badge badge-${PRIORITY_TONE[value] || 'gray'}`}>{t(`enums.taskPriority.${value}`, value)}</span>;
}

export function PregnancyBadge({ status }) {
  const { t } = useTranslation();
  if (!status) return null;
  return <span className={`badge badge-${PREGNANCY_TONE[status] || 'gray'}`}>{t(`enums.pregnancyStatus.${status}`, status)}</span>;
}

export { fmtDate, calcAge } from '../../../shared/format';

