/* Single indirection point for the cross-client `shared/` package (repo root,
   sibling to mobile/ and client/) so the rest of mobile/src imports from
   here (short, stable relative paths) instead of each file computing its own
   '../../../shared/...' depth. */
export { fmtDate, calcAge } from '../../../shared/format';
export { TONES, DARK_TONES, statusTone, priorityTone, pregnancyTone } from '../../../shared/statusMaps';
export { isOverdueTask, isThisMonth, todayIso } from '../../../shared/businessRules';
export { SCHEMAS, SYNCED_TABLES } from '../../../shared/schemas';
export { COLORS, LIGHT_COLORS, DARK_COLORS, RADIUS, SHADOW, SHADOW_LG } from '../../../shared/theme';
