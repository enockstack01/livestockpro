import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { useAccount } from '../../account/AccountProvider';
import { ORG_STATUS_TONE, ORG_TYPE_ICONS } from '../../../../shared/org';

/* Mobile twins of client/src/lib/org.jsx: the signed-in organization member,
   GET loading, and the organization banner and usage meter (Agricoders
   brand: Pine banner, solid Leaf, Amber and Alert Red fills). */
export function useOrgMember() {
  const { account } = useAccount();
  const org = account && account.organization && account.organization.as === 'member' ? account.organization : null;
  return {
    orgId: org ? org.id : null,
    role: org ? org.role : null,
    name: org ? org.name : '',
    isAdmin: Boolean(org && org.role === 'org_admin'),
    readOnly: Boolean(org && org.status !== 'active')
  };
}

export function useOrgData(api, path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  /* Keyed on the path only: the api helper can be a new object on each
     render (Clerk's getToken), which must not trigger another fetch. */
  const apiRef = useRef(api);
  apiRef.current = api;
  const reload = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await apiRef.current.http('GET', path);
    setState({ data, error, loading: false });
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export function orgErrorText(t, error) {
  if (!error) return '';
  if (error.networkError) return t('org.mobile.offline');
  if (error.code && t(`org.errors.${error.code}`, { defaultValue: '' })) return t(`org.errors.${error.code}`);
  return error.message || t('auth.somethingWentWrong');
}

/* Re-renders every second, for live countdowns. */
export function useTick(active = true) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function UsageMeter({ used, limit, onDark }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const bar = pct >= 100 ? colors.red : pct >= 80 ? colors.orange : onDark ? '#FFFFFF' : colors.leaf;
  const ink = onDark ? '#FFFFFF' : colors.text;
  return (
    <View style={{ gap: 5, minWidth: 150 }}>
      <Text style={{ color: ink, fontSize: 13 }}><Text style={{ fontWeight: '800', fontSize: 17 }}>{t('org.usage.of', { used, limit })}</Text> {t('org.usage.farmers')}</Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: onDark ? 'rgba(255,255,255,0.25)' : colors.bg, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: bar }} />
      </View>
      {pct >= 80 ? <Text style={{ fontSize: 11.5, fontWeight: '700', color: pct >= 100 ? (onDark ? '#FFFFFF' : colors.red) : colors.orange }}>{pct >= 100 ? t('org.usage.full') : t('org.usage.nearly')}</Text> : null}
    </View>
  );
}

const TONE_BG = { green: '#1B5E20', orange: '#F9A825', red: '#C62828', gray: '#5B6B5D' };

export function Pill({ tone = 'green', label }) {
  return (
    <View style={[styles.pill, { backgroundColor: TONE_BG[tone] || TONE_BG.gray }]}>
      <Text style={[styles.pillText, { color: tone === 'orange' ? '#1C2B1E' : '#FFFFFF' }]}>{label}</Text>
    </View>
  );
}

export function OrgBanner({ org, children }) {
  const { t } = useTranslation();
  return (
    <View style={styles.banner}>
      <View style={styles.bannerRow}>
        <View style={styles.bannerMark}><Icon name={ORG_TYPE_ICONS[org.type] || 'building'} size={20} color="#14532D" /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.bannerEyebrow} numberOfLines={1}>{t(`org.types.${org.type}`)}{org.district ? ` · ${org.district}` : ''}</Text>
          <Text style={styles.bannerName} numberOfLines={2}>{org.name}</Text>
        </View>
        <Pill tone={ORG_STATUS_TONE[org.status]} label={t(`org.status.${org.status}`)} />
      </View>
      {children ? <View style={{ marginTop: 14 }}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700' },
  banner: { backgroundColor: '#14532D', borderRadius: 12, padding: 16, marginBottom: 14 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerMark: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  bannerEyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  bannerName: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' }
});
