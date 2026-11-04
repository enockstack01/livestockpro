import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal as RNModal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useRepository } from '../db/repository';
import { useLanguage } from '../i18n/LanguageProvider';
import { haptics } from '../lib/haptics';
import { Modal } from './kit';
import { SEARCH_TABLES, searchLink, searchRecords } from '../../../shared/globalSearch';

/* Header tools on the phone (twins of the web top bar): search across every
   farm record, and the language menu. */

/* Full screen search over the phone's own copy of the records (works
   offline). Tapping a result opens its section filtered by the search. */
export function SearchPanel({ open, onClose, onGo }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const repo = useRepository();
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const input = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    Promise.all(SEARCH_TABLES.map((k) => repo.list(k))).then((rs) => setData(Object.fromEntries(SEARCH_TABLES.map((k, i) => [k, rs[i] || []]))));
    const id = setTimeout(() => input.current && input.current.focus(), 250);
    return () => clearTimeout(id);
  }, [open, repo]);

  const groups = useMemo(() => (data ? searchRecords(data, query, t, { perSection: 5 }) : []), [data, query, t]);
  const go = (path) => { haptics.select(); onClose(); onGo(path); };

  return (
    <RNModal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.full, { backgroundColor: colors.bg }]}>
        <View style={{ height: insets.top, backgroundColor: colors.appBar }} />
        <View style={[styles.bar, { backgroundColor: colors.appBar }]}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.barBtn}>
            <Icon name="arrow-left" size={18} color="#FFFFFF" />
          </Pressable>
          <View style={[styles.field, { backgroundColor: colors.card }]}>
            <Icon name="magnifying-glass" size={13} color={colors.placeholder} />
            <TextInput
              ref={input}
              style={[styles.input, { color: colors.text }]}
              placeholder={t('search.placeholder')}
              placeholderTextColor={colors.placeholder}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {query ? <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel={t('search.clear')}><Icon name="circle-xmark" size={14} color={colors.placeholder} /></Pressable> : null}
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          {query.trim().length < 2 ? null : !data ? (
            <Text style={[styles.empty, { color: colors.textLight }]}>{t('common.loading')}</Text>
          ) : groups.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textLight }]}>{t('search.none', { query: query.trim() })}</Text>
          ) : groups.map((g) => (
            <View key={g.key} style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable onPress={() => go(searchLink(g, query))} style={styles.groupHead} accessibilityRole="button">
                <View style={[styles.groupIcon, { backgroundColor: colors.leaf || '#2E7D32' }]}><Icon name={g.icon} size={12} color="#FFFFFF" /></View>
                <Text style={[styles.groupTitle, { color: colors.text }]}>{t(g.labelKey)}</Text>
                <Text style={[styles.count, { color: colors.leaf || '#2E7D32' }]}>{t('search.viewAll', { count: g.total })}</Text>
              </Pressable>
              {g.items.map((it) => (
                <Pressable key={it.id} onPress={() => go(searchLink(g, it.title.split(' · ')[0]))} style={({ pressed }) => [styles.item, { borderTopColor: colors.border }, pressed && { backgroundColor: colors.bg }]}>
                  <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{it.title}</Text>
                  {it.sub ? <Text style={[styles.itemSub, { color: colors.textLight }]} numberOfLines={1}>{it.sub}</Text> : null}
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </RNModal>
  );
}

/* Language menu: every interface language by its own name, in a bottom
   sheet (a dialog on tablets). */
export function LanguagePanel({ open, onClose }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { language, setLanguage, languages, rtlRestartNeeded } = useLanguage();
  const code = String(language || 'en').slice(0, 2);
  return (
    <Modal open={open} onClose={onClose} title={t('settings.language')} maxWidth={420}>
      {languages.map((l, i) => (
        <Pressable
          key={l.code}
          onPress={() => { haptics.select(); setLanguage(l.code); onClose(); }}
          accessibilityRole="radio"
          accessibilityState={{ checked: code === l.code }}
          style={({ pressed }) => [styles.lang, { borderBottomColor: colors.border }, i === languages.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: colors.primaryLight }]}
        >
          <Text style={[styles.langName, { color: code === l.code ? colors.primary : colors.text, fontWeight: code === l.code ? '700' : '400' }]}>{l.nativeLabel}</Text>
          {code === l.code ? <Icon name="check" size={14} color={colors.primary} /> : <Text style={{ color: colors.textLight, fontSize: 12 }}>{l.code.toUpperCase()}</Text>}
        </Pressable>
      ))}
      {rtlRestartNeeded ? <Text style={{ color: colors.textLight, fontSize: 12, marginTop: 10 }}>{t('settings.rtlRestartNotice')}</Text> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingRight: 12, minHeight: 64 },
  barBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 16, minHeight: 44 },
  input: { flex: 1, fontSize: 15, paddingVertical: 8 },
  empty: { textAlign: 'center', marginTop: 30, fontSize: 14 },
  group: { borderWidth: 1, borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  groupIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  count: { fontSize: 12, fontWeight: '700' },
  item: { paddingVertical: 10, paddingHorizontal: 14, paddingLeft: 48, borderTopWidth: 1 },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  itemSub: { fontSize: 12, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 14, padding: 16, maxWidth: 420, width: '100%', alignSelf: 'center' },
  sheetTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  lang: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  langName: { fontSize: 15 }
});
