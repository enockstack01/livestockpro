import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useRepository } from '../db/repository';
import { useSync } from '../sync/SyncProvider';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../lib/haptics';
import Icon from '../components/Icon';
import { Button, Card, CardBody, CardHeader, Muted, Page, PageHeader, Spinner } from '../ui/kit';
import { CALENDAR_KINDS, KIND, buildCalendarEvents, eventsByDay, isoDay, monthGrid, weekdayNames } from '../../../shared/calendarEvents';

const TABLES = ['tasks', 'health_records', 'breeding_records', 'feeding_records'];

/* Twin of client/src/pages/Calendar.jsx: a month calendar of tasks, health
   checks and follow ups, breeding, births and feeding, coloured by kind
   (dots on each day), the chosen day's events below it, and the next 30
   days. Reads the phone's own copy, so it works offline. */
export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const repo = useRepository();
  const { lastSyncedAt, triggerSync } = useSync();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [kinds, setKinds] = useState(() => new Set(CALENDAR_KINDS.map((k) => k.key)));
  const todayIso = isoDay(new Date());
  const [selected, setSelected] = useState(todayIso);

  const load = useCallback(async () => {
    const rows = await Promise.all(TABLES.map((k) => repo.list(k)));
    setData(Object.fromEntries(TABLES.map((k, i) => [k, rows[i] || []])));
  }, [repo]);
  useEffect(() => { load(); }, [load, lastSyncedAt]);

  const events = useMemo(() => (data ? buildCalendarEvents(data, t) : []), [data, t]);
  const byDay = useMemo(() => eventsByDay(events, kinds), [events, kinds]);
  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const weekdays = useMemo(() => weekdayNames(i18n.language, 'narrow'), [i18n.language]);
  const upcoming = useMemo(() => {
    const end = isoDay(new Date(Date.now() + 30 * 86400000));
    return events.filter((ev) => kinds.has(ev.kind) && !ev.done && ev.date >= todayIso && ev.date <= end).slice(0, 12);
  }, [events, kinds, todayIso]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
  const move = (delta) => { haptics.select(); setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; }); };
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setSelected(todayIso); };
  const fmtDay = (iso, opts) => new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, opts);
  const toggle = (key) => setKinds((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const open = (path) => { haptics.select(); router.replace(path); };

  async function onRefresh() {
    setRefreshing(true);
    await triggerSync();
    await load();
    setRefreshing(false);
  }

  if (!data) return <Page><Spinner /></Page>;
  const dayList = byDay[selected] || [];

  return (
    <Page refreshing={refreshing} onRefresh={onRefresh}>
      <PageHeader title={t('calendar.title')} subtitle={t('calendar.subtitle')}>
        <Button icon="plus" title={t('tasksPage.addTask')} onPress={() => router.replace(`/tasks?new=1&due=${selected}`)} />
      </PageHeader>

      <Card style={{ marginBottom: 14 }}>
        <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => move(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('calendar.previous')} style={styles.navBtn}><Icon name="chevron-left" size={15} color={colors.text} /></Pressable>
          <Text style={[styles.month, { color: colors.primary }]}>{monthLabel}</Text>
          <Pressable onPress={() => move(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('calendar.next')} style={styles.navBtn}><Icon name="chevron-right" size={15} color={colors.text} /></Pressable>
          <Pressable onPress={goToday} style={[styles.today, { borderColor: colors.border }]} accessibilityRole="button"><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{t('calendar.today')}</Text></Pressable>
        </View>
        <View style={styles.grid}>
          {weekdays.map((w, i) => <Text key={i} style={[styles.weekday, { color: colors.textLight }]}>{w}</Text>)}
          {cells.map((c) => {
            const list = byDay[c.date] || [];
            const isSel = c.date === selected;
            return (
              <Pressable
                key={c.date}
                onPress={() => { haptics.select(); setSelected(c.date); if (!c.inMonth) setCursor({ y: Number(c.date.slice(0, 4)), m: Number(c.date.slice(5, 7)) - 1 }); }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${fmtDay(c.date, { dateStyle: 'full' })}: ${t('calendar.eventsCount', { count: list.length })}`}
                style={[styles.cell, isSel && { backgroundColor: colors.bg }]}
              >
                <View style={[styles.dayCircle, c.today && { backgroundColor: colors.primary }, isSel && !c.today && { borderWidth: 1.5, borderColor: colors.primary }]}>
                  <Text style={[styles.dayNum, { color: c.today ? '#FFFFFF' : c.inMonth ? colors.text : colors.textLight, opacity: c.inMonth ? 1 : 0.55 }]}>{c.day}</Text>
                </View>
                <View style={styles.dots}>
                  {list.slice(0, 4).map((ev) => <View key={ev.id} style={[styles.dot, { backgroundColor: KIND[ev.kind].color }]} />)}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.legend, { borderTopColor: colors.border }]}>
          {CALENDAR_KINDS.map((k) => (
            <Pressable key={k.key} onPress={() => toggle(k.key)} accessibilityRole="checkbox" accessibilityState={{ checked: kinds.has(k.key) }} style={[styles.legendItem, { borderColor: colors.border, opacity: kinds.has(k.key) ? 1 : 0.45 }]}>
              <View style={[styles.dot, { backgroundColor: k.color }]} />
              <Text style={{ color: colors.text, fontSize: 12 }}>{t(`calendar.kinds.${k.key}`)}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <CardHeader title={fmtDay(selected, { weekday: 'long', day: 'numeric', month: 'long' })} icon="calendar-day" />
        <CardBody>
          {dayList.length === 0 ? <Muted>{t('calendar.nothingThisDay')}</Muted> : dayList.map((ev) => <EventRow key={ev.id} ev={ev} onPress={() => open(ev.path)} />)}
          <Button variant="secondary" size="sm" icon="plus" title={t('calendar.addTaskOnDay')} onPress={() => router.replace(`/tasks?new=1&due=${selected}`)} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('calendar.upcoming')} icon="calendar-week" />
        <CardBody>
          {upcoming.length === 0 ? <Muted>{t('calendar.nothingUpcoming')}</Muted> : upcoming.map((ev) => <EventRow key={ev.id} ev={ev} date={fmtDay(ev.date, { day: 'numeric', month: 'short' })} onPress={() => open(ev.path)} />)}
        </CardBody>
      </Card>
    </Page>
  );
}

function EventRow({ ev, date, onPress }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const k = KIND[ev.kind];
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.event, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.bg }]}>
      {date ? <Text style={[styles.eventDate, { color: colors.textLight }]}>{date}</Text> : null}
      <View style={[styles.eventIcon, { backgroundColor: k.color }]}><Icon name={k.icon} size={12} color={k.ink} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{ev.title}</Text>
        <Text style={{ color: colors.textLight, fontSize: 12, marginTop: 1 }}>{t(`calendar.kinds.${ev.kind}`)}{ev.sub ? ` · ${ev.sub}` : ''}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1 },
  navBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  month: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', textTransform: 'capitalize' },
  today: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4, paddingBottom: 6 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '700', paddingVertical: 8 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4, borderRadius: 8, minHeight: 50 },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 13, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 3, marginTop: 3, minHeight: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10, borderTopWidth: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  eventDate: { width: 52, fontSize: 12, fontWeight: '700' },
  eventIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }
});
