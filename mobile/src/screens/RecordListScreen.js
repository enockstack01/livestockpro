import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRepository } from '../db/repository';
import { useSync } from '../sync/SyncProvider';
import { useGeoCapture } from '../hooks/useGeoCapture';
import { useToast } from '../lib/toast';
import { useConfirm } from '../lib/confirm';
import { useTheme } from '../theme/ThemeProvider';
import Icon from '../components/Icon';
import ResponsiveScreen from '../components/ResponsiveScreen';
import RNModal from '../components/Modal';
import RecordForm, { emptyValues } from '../components/RecordForm';
import SelectField from '../components/SelectField';
import { StatusBadge, PriorityBadge, PregnancyBadge } from '../components/Badges';

const BADGE_COMPONENTS = { status: StatusBadge, pregnancy: PregnancyBadge };

/* Config-driven CRUD screen shared by all 7 record-type routes (see
   mobile/src/config/tables.js and app/(app)/{animals,health,...}.js).
   Local-first: reads/writes go through src/db/repository.js (instant,
   optimistic), sync happens in the background via src/sync/SyncProvider.js.
   config/tables.js carries only canonical English field keys/option values —
   every label and option shown here is resolved through i18next at render
   time (tables.<table>.label/singular/fields.<key>, enums.<i18nEnum>.<value>),
   so this one screen implementation is already fully translated for all 7
   record types and every supported language. */
export default function RecordListScreen({ config }) {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius, shadow), [colors, radius, shadow]);
  const repo = useRepository();
  const { lastSyncedAt, syncing, triggerSync } = useSync();
  const showToast = useToast();
  const confirm = useConfirm();
  const geo = useGeoCapture();

  const label = t(`tables.${config.table}.label`);
  const singular = t(`tables.${config.table}.singular`);
  const fieldLabel = useCallback((key) => t(`tables.${config.table}.fields.${key}`), [t, config.table]);

  const localizedFields = useMemo(() => config.fields.map((f) => ({
    ...f,
    label: fieldLabel(f.key),
    options: f.options ? f.options.map((opt) => ({ value: opt, label: f.i18nEnum ? t(`enums.${f.i18nEnum}.${opt}`) : opt })) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [config.fields, fieldLabel, t]);

  const localizedFilters = useMemo(() => config.filters.map((f) => ({
    ...f,
    label: fieldLabel(f.key),
    options: f.options.map((opt) => ({ value: opt, label: f.i18nEnum ? t(`enums.${f.i18nEnum}.${opt}`) : opt })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [config.filters, fieldLabel, t]);

  const GEO_MESSAGES = {
    loading: t('geo.capturing'),
    denied: t('geo.denied'),
    error: t('geo.error'),
    unsupported: t('geo.unsupported'),
  };

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState({});
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
  const [editingId, setEditingId] = useState(null);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const rows = await repo.list(config.table, { order: 'created_at DESC' });
    setRecords(rows);
    setLoading(false);
  }, [repo, config.table]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (lastSyncedAt) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncedAt]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await triggerSync();
    await load();
    setRefreshing(false);
  }, [triggerSync, load]);

  const filtered = useMemo(() => {
    let rows = records;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => config.searchFields.some((f) => String(r[f] || '').toLowerCase().includes(q)));
    Object.entries(activeFilter).forEach(([key, val]) => {
      if (val) rows = rows.filter((r) => r[key] === val);
    });
    return rows;
  }, [records, search, activeFilter, config.searchFields]);

  function openAdd() {
    setModalMode('add');
    setEditingId(null);
    setValues(emptyValues(config.fields));
    geo.reset();
    geo.capture();
  }

  function openEdit(record) {
    setModalMode('edit');
    setEditingId(record.id);
    const v = {};
    config.fields.forEach((f) => { v[f.key] = record[f.key] ?? ''; });
    setValues(v);
  }

  function closeModal() {
    setModalMode(null);
    setEditingId(null);
  }

  async function handleSave() {
    const missing = config.fields.find((f) => f.required && !String(values[f.key] || '').trim());
    if (missing) {
      showToast(t('records.fieldRequired', { field: fieldLabel(missing.key) }), 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...values };
      config.fields.forEach((f) => {
        if (f.type === 'number') payload[f.key] = payload[f.key] === '' || payload[f.key] === null ? null : Number(payload[f.key]);
      });

      if (modalMode === 'add') {
        if (geo.status === 'success') {
          payload.latitude = geo.latitude;
          payload.longitude = geo.longitude;
        }
        await repo.insert(config.table, payload);
        showToast(t('records.added', { item: singular }), 'success');
      } else {
        await repo.update(config.table, editingId, payload);
        showToast(t('records.updated', { item: singular }), 'success');
      }
      closeModal();
      await load();
    } catch (err) {
      showToast(t('records.saveFailed', { message: err.message }), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record) {
    const ok = await confirm({
      title: t('confirmDialogs.deleteRecordTitle', { item: singular.toLowerCase() }),
      message: t('confirmDialogs.cannotBeUndone'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!ok) return;
    await repo.remove(config.table, record.id);
    showToast(t('records.deleted', { item: singular }), 'success');
    await load();
  }

  const BadgeComp = config.badgeField ? BADGE_COMPONENTS[config.badgeField.kind] : null;

  return (
    <ResponsiveScreen>
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Icon name={config.icon} size={16} color={colors.primary} />
        </View>
        <Text style={styles.headerTitle}>{label}</Text>
      </View>

      <View style={styles.searchRow}>
        <Icon name="magnifying-glass" size={16} color={colors.placeholder} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('records.searchPlaceholder', { label: label.toLowerCase() })}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={colors.placeholder}
        />
      </View>

      {localizedFilters.map((f) => (
        <View key={f.key} style={styles.filterWrap}>
          <SelectField
            value={activeFilter[f.key] || ''}
            options={[{ value: '', label: t('records.all', { label: f.label }) }, ...f.options]}
            onChange={(v) => setActiveFilter((prev) => ({ ...prev, [f.key]: v }))}
          />
        </View>
      ))}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing || syncing} onRefresh={onRefresh} colors={[colors.primary]} />}
          ListEmptyComponent={<Text style={styles.empty}>{t('records.emptyList', { label: label.toLowerCase() })}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openEdit(item)}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item[config.titleField] || t('common.untitled')}</Text>
                  {item.sync_state === 'pending' && <View style={styles.pendingDot} />}
                </View>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {config.subtitleFields.map((f) => item[f]).filter(Boolean).join(' · ') || '—'}
                </Text>
                {config.priorityField ? <PriorityBadge priority={item[config.priorityField]} /> : null}
              </View>
              <View style={styles.cardActions}>
                {BadgeComp ? <BadgeComp status={item[config.badgeField.key]} /> : null}
                <Pressable hitSlop={10} onPress={() => handleDelete(item)}>
                  <Icon name="trash-can" size={16} color={colors.textLight} />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}

      <Pressable style={styles.fab} onPress={openAdd}>
        <Icon name="plus" size={24} color={colors.white} />
      </Pressable>

      <RNModal
        open={modalMode !== null}
        onClose={closeModal}
        title={modalMode === 'add' ? t('records.addTitle', { item: singular }) : t('records.editTitle', { item: singular })}
        footer={
          <>
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={closeModal}>
              <Text style={styles.btnSecondaryText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.btnPrimaryText}>{t('common.save')}</Text>}
            </Pressable>
          </>
        }
      >
        <RecordForm fields={localizedFields} values={values} onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))} />
        {modalMode === 'add' && geo.status !== 'idle' ? (
          <Pressable onPress={geo.status !== 'loading' ? geo.capture : undefined} style={styles.geoLine}>
            {geo.status === 'loading' ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="location-dot" size={14} color={geo.status === 'success' ? colors.primary : colors.orange} />}
            <Text style={styles.geoText}>
              {geo.status === 'success' ? t('geo.captured', { lat: geo.latitude.toFixed(3), lng: geo.longitude.toFixed(3) }) : GEO_MESSAGES[geo.status]}
              {geo.status !== 'loading' && geo.status !== 'success' ? t('geo.tapToRetry') : ''}
            </Text>
          </Pressable>
        ) : null}
      </RNModal>
    </View>
    </ResponsiveScreen>
  );
}

function makeStyles(colors, radius, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 16 },
    headerIcon: { width: 30, height: 30, borderRadius: radius.button, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.primaryDark },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, margin: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border },
    searchInput: { flex: 1, fontSize: 15, color: colors.text },
    filterWrap: { paddingHorizontal: 16, marginBottom: 4 },
    listContent: { padding: 16, paddingTop: 8, paddingBottom: 100, gap: 10 },
    empty: { textAlign: 'center', color: colors.textLight, marginTop: 40, fontSize: 14 },
    card: {
      flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.card, padding: 14, gap: 10,
      shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation,
    },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryDark, flexShrink: 1 },
    cardSubtitle: { fontSize: 13, color: colors.textLight },
    pendingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.orange },
    cardActions: { alignItems: 'flex-end', gap: 10, justifyContent: 'space-between' },
    fab: {
      position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
      shadowColor: shadow.color, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5,
    },
    btn: { flex: 1, paddingVertical: 13, borderRadius: radius.button, alignItems: 'center' },
    btnPrimary: { backgroundColor: colors.primary },
    btnPrimaryText: { color: colors.white, fontWeight: '700' },
    btnSecondary: { backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border },
    btnSecondaryText: { color: colors.text, fontWeight: '700' },
    geoLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingVertical: 8 },
    geoText: { flex: 1, fontSize: 12, color: colors.textLight },
  });
}
