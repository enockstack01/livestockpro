import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuth } from '@clerk/expo';
import Icon from '../components/Icon';
import { available as deviceModelAvailable, detectPhotos } from '../ml/detector';
import { findDisease, GUIDE_DISCLAIMER } from '../ml/diseases';
import { listScans, saveScan, subscribeScans } from '../sync/aiScans';
import { useApi } from '../api/client';
import { useRepository } from '../db/repository';
import { useToast } from '../lib/toast';
import { printHtml } from '../lib/printReport';
import PhotoPicker, { usePhotos } from '../components/PhotoPicker';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, CardBody, CardHeader, EmptyState, FormGroup, Input, Muted, Page, PageHeader, Select, Tabs } from '../ui/kit';
import { aiReportFileName, aiReportHtml } from '../../../shared/aiReportHtml';
import { aiResetTime, getAiUsage, subscribeAiUsage } from '../../../shared/aiUsage';

/* Mobile twin of client/src/pages/Assistant.jsx: Ask LivestockPro, the farm
   advisor, AI diagnosis and saved reports. AI runs on the server, so these
   need a connection; everything else in the app keeps working offline. */

export function useAiStatus() {
  const api = useApi();
  const [configured, setConfigured] = useState(null);
  useEffect(() => {
    let live = true;
    api.aiStatus().then(({ data, error }) => { if (live) setConfigured(error && error.networkError ? null : Boolean(data && data.configured)); });
    return () => { live = false; };
  }, [api]);
  return configured;
}

export function useAiUsage() {
  const api = useApi();
  const [usage, setUsage] = useState(getAiUsage());
  useEffect(() => {
    const off = subscribeAiUsage(setUsage);
    api.aiUsage();
    return off;
  }, [api]);
  return usage;
}

/* "12 of 50 AI requests left today" with a small meter. */
export function AiUsageMeter({ kind, style }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const usage = useAiUsage();
  if (!usage) return null;
  const part = kind && usage.kinds && usage.kinds[kind];
  const remaining = part ? Math.min(part.remaining, usage.remaining) : usage.remaining;
  const limit = part ? part.limit : usage.limit;
  const pct = limit ? Math.round((remaining / limit) * 100) : 0;
  const bar = remaining === 0 ? colors.red : pct <= 20 ? colors.orange : colors.leaf;
  return (
    <View style={[{ gap: 5 }, style]}>
      <Text style={{ fontSize: 12, color: colors.textLight }}>{t(part ? 'ai.usage.leftKind' : 'ai.usage.left', { remaining, limit, kind: part ? t(`ai.usage.kinds.${kind}`) : '' })}</Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: bar }} />
      </View>
      {pct <= 20 ? <Text style={{ fontSize: 11.5, color: colors.textLight }}>{t('ai.usage.resets', { time: aiResetTime(usage, i18n.language) })}</Text> : null}
    </View>
  );
}

export function aiErrorText(t, error, lang) {
  if (!error) return '';
  if (error.networkError) return t('ai.offline');
  if (error.code === 'AI_NOT_CONFIGURED') return t('ai.notConfigured');
  if (error.code === 'AI_QUOTA') {
    const time = aiResetTime(error.usage, lang);
    return error.kind && error.kind !== 'total'
      ? t('ai.errors.quotaKind', { kind: t(`ai.usage.kinds.${error.kind}`), time })
      : t('ai.errors.quota', { time });
  }
  if (error.code === 'AI_BURST') return t('ai.errors.burst');
  if (error.code === 'AI_LIMIT' || error.code === 'AI_BUSY') return t('ai.errors.busy');
  return t('ai.errors.failed', { message: error.message });
}

const TONE = {
  emergency: 'red', urgent: 'red', soon: 'orange', routine: 'green',
  high: 'red', medium: 'orange', low: 'green', none: 'green', critical: 'red',
  immediate: 'red', this_week: 'orange', monitor: 'blue', today: 'red', this_month: 'blue'
};

function Pill({ value, children }) {
  const { colors } = useTheme();
  const tone = TONE[value] || 'blue';
  const bg = tone === 'green' ? colors.primary : tone === 'orange' ? colors.orange : tone === 'red' ? colors.red : colors.blue;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: tone === 'orange' ? '#1C2B1E' : '#FFFFFF' }]}>{children}</Text>
    </View>
  );
}

function Section({ icon, title, children }) {
  const { colors } = useTheme();
  if (!children || (Array.isArray(children) && !children.filter(Boolean).length)) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: colors.leaf }]}><Icon name={icon} size={11} color="#FFFFFF" /></View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Para({ children }) {
  const { colors } = useTheme();
  if (!children) return null;
  return <Text style={[styles.para, { color: colors.text }]}>{children}</Text>;
}

function Bullets({ items, numbered }) {
  const { colors } = useTheme();
  if (!items || !items.length) return null;
  return (
    <View style={{ gap: 4 }}>
      {items.map((x, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          <Text style={[styles.para, { color: colors.textLight, width: 18 }]}>{numbered ? `${i + 1}.` : '•'}</Text>
          <Text style={[styles.para, { color: colors.text, flex: 1 }]}>{x}</Text>
        </View>
      ))}
    </View>
  );
}

function Boxed({ title, pill, children }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.boxHead}>
        <Text style={[styles.boxTitle, { color: colors.text }]}>{title}</Text>
        {pill}
      </View>
      {children}
    </View>
  );
}

function Note({ children, danger }) {
  const { colors } = useTheme();
  if (!children) return null;
  return (
    <View style={[styles.note, { borderColor: danger ? colors.red : colors.border, backgroundColor: colors.bg }]}>
      {danger ? <Icon name="user-doctor" size={12} color={colors.red} /> : null}
      <Text style={[styles.para, { color: colors.text, flex: 1 }]}>{children}</Text>
    </View>
  );
}

export const visionLabel = (t, label) => t(`ai.vision.labels.${label}`, { defaultValue: String(label).replace(/_/g, ' ') });

/* Boxes for one photo, most confident first. Labels of boxes that start at
   the same corner (whole-animal boxes usually do) are stacked so they never
   cover each other. */
function photoBoxes(vision, n) {
  const boxes = ((vision && vision.detections) || []).filter((d) => d.photo === n).sort((a, b) => b.confidence - a.confidence);
  return boxes.map((d, i) => ({ ...d, stack: boxes.slice(0, i).filter((o) => Math.abs(o.box[0] - d.box[0]) < 0.04 && Math.abs(o.box[1] - d.box[1]) < 0.04).length }));
}

/* The photo's own width / height: from the screening result when there is
   one, otherwise read from the picture. */
function usePhotoAspect(src, size) {
  const [aspect, setAspect] = useState(size && size.width && size.height ? size.width / size.height : null);
  useEffect(() => {
    if (aspect || !src) return;
    Image.getSize(src, (w, h) => { if (w && h) setAspect(w / h); }, () => setAspect(4 / 3));
  }, [src, aspect]);
  return aspect || 4 / 3;
}

const LABEL_HEIGHT = 20;

/* A photo at its own shape, with the screening boxes and the disease name
   on each box when `boxes` is given. */
function FramedPhoto({ src, boxes, aspect, width, caption }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ width }}>
      <View style={{ width, height: width / aspect, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg }}>
        <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="stretch" accessibilityLabel={caption} />
        {(boxes || []).map((d, j) => {
          const ok = d.label === 'healthy';
          const tone = ok ? colors.leaf : colors.orange;
          return (
            <View key={j} pointerEvents="none" style={{ position: 'absolute', left: `${d.box[0] * 100}%`, top: `${d.box[1] * 100}%`, width: `${(d.box[2] - d.box[0]) * 100}%`, height: `${(d.box[3] - d.box[1]) * 100}%`, borderWidth: 3, borderColor: tone, borderRadius: 4 }}>
              <Text numberOfLines={1} style={{ position: 'absolute', left: 0, top: d.stack * LABEL_HEIGHT, height: LABEL_HEIGHT, lineHeight: LABEL_HEIGHT, maxWidth: '100%', backgroundColor: tone, color: ok ? '#FFFFFF' : '#1C2B1E', fontSize: 13, fontWeight: '700', paddingHorizontal: 7, borderBottomRightRadius: 4 }}>{visionLabel(t, d.label)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ marginTop: 5, textAlign: 'center', fontSize: 12.5, fontWeight: '700', color: colors.textLight }}>{caption}</Text>
    </View>
  );
}

/* One uploaded photo next to the same photo as the screening model checked
   it: side by side on a tablet, one above the other on a phone, both as
   wide as there is room for so the farmer can see it is the same picture. */
function PhotoPair({ src, n, total, vision, width }) {
  const { t } = useTranslation();
  const size = vision && vision.photos && vision.photos[n - 1];
  const aspect = usePhotoAspect(src, size);
  const checked = vision && vision.available;
  const num = total > 1 ? ` ${n}` : '';
  const side = checked && width >= 520;
  const w = side ? (width - 12) / 2 : width;
  return (
    <View style={{ flexDirection: side ? 'row' : 'column', gap: 12, marginTop: 10 }}>
      <FramedPhoto src={src} aspect={aspect} width={w} caption={t('ai.vision.uploaded') + num} />
      {checked ? <FramedPhoto src={src} aspect={aspect} width={w} boxes={photoBoxes(vision, n)} caption={t('ai.vision.checked') + num} /> : null}
    </View>
  );
}

/* The photos the farmer sent and, when the screening ran, the checked
   copies with the disease name on them (report.vision). Marked preliminary:
   the detections are never a diagnosis. */
export function PhotoReview({ photos, vision }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  if (!(photos && photos.length) && !vision) return null;
  const checked = vision && vision.available;
  return (
    <View style={[styles.photoBox, { borderColor: colors.border }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 26)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 14 }}>{t('ai.pdf.photos')}</Text>
        {checked ? <Pill value="soon">{t('ai.vision.preliminary')}</Pill> : null}
      </View>
      {width > 0 ? (photos || []).map((src, i) => <PhotoPair key={i} src={src} n={i + 1} total={photos.length} vision={vision} width={width} />) : null}
      {checked && !(vision.detections || []).length ? <Muted style={{ marginTop: 8 }}>{t('ai.vision.none')}</Muted> : null}
      {vision && !vision.available ? <Muted style={{ marginTop: 8 }}>{t('ai.vision.unavailable')}</Muted> : null}
    </View>
  );
}

function DiagnosisView({ r, photos }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tr = (k, o) => t(`ai.report.${k}`, o);
  const z = r.zoonotic || {};
  return (
    <View>
      <PhotoReview photos={photos} vision={r.vision} />
      <View style={styles.pills}>
        <Pill value={r.urgency}>{tr('urgency')}: {tr(`urgencyLevels.${r.urgency}`)}</Pill>
        {r.see_vet ? <Pill value="urgent">{tr('seeVet')}</Pill> : <Pill value="routine">{tr('seeVetNo')}</Pill>}
      </View>
      <Text style={[styles.summary, { color: colors.text }]}>{r.summary}</Text>
      <Note>{r.see_vet_reason}</Note>
      <Section icon="list-ol" title={tr('likely')}>
        {(r.likely_conditions || []).map((c, i) => (
          <Boxed key={i} title={c.name} pill={<Pill value={c.likelihood}>{tr(`likelihood.${c.likelihood}`)}</Pill>}><Muted>{c.why}</Muted></Boxed>
        ))}
      </Section>
      <Section icon="magnifying-glass" title={tr('cause')}><Para>{r.cause}</Para></Section>
      <Section icon="list-check" title={tr('treatment')}><Bullets items={r.treatment_steps} numbered /></Section>
      <Section icon="pills" title={tr('medications')}>
        {(r.medications || []).map((m, i) => (
          <Boxed key={i} title={m.name} pill={m.prescription_only ? <Pill value="medium">{tr('prescription')}</Pill> : null}>
            {[['purpose', m.purpose], ['howToGive', m.how_to_give], ['dose', m.dose_guidance], ['withdrawal', m.withdrawal_period]].map(([k, v]) => (
              <View key={k} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 11.5, color: colors.textLight }}>{tr(k)}</Text>
                <Text style={[styles.para, { color: colors.text }]}>{v}</Text>
              </View>
            ))}
          </Boxed>
        ))}
      </Section>
      <Section icon="hand-holding-medical" title={tr('care')}><Bullets items={r.supportive_care} /></Section>
      <Section icon="house-medical-flag" title={tr('isolation')}><Para>{r.isolation_advice}</Para></Section>
      <Section icon="people-arrows" title={tr('zoonotic')}>
        <View style={styles.pills}><Pill value={z.risk}>{tr(`zoonoticLevels.${z.risk || 'none'}`)}</Pill></View>
        <Para>{z.precautions}</Para>
        {r.notifiable ? <Note>{tr('notifiable')}</Note> : null}
      </Section>
      <Section icon="triangle-exclamation" title={tr('warning')}><Bullets items={r.warning_signs} /></Section>
      <Section icon="shield-heart" title={tr('prevention')}><Bullets items={r.prevention} /></Section>
      <Section icon="user-doctor" title={tr('questions')}><Bullets items={r.questions_for_vet} /></Section>
      <Section icon="circle-question" title={tr('gaps')}><Bullets items={r.data_gaps} /></Section>
      <View style={{ marginTop: 14 }}><Note danger>{t('ai.vetNotice')}</Note></View>
    </View>
  );
}

function AdvisorView({ r }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const ta = (k, o) => t(`ai.advisor.${k}`, o);
  return (
    <View>
      <Text style={[styles.summary, { color: colors.text }]}>{r.summary}</Text>
      <Section icon="chart-simple" title={ta('figures')}>
        {(r.figures || []).length ? (
          <View style={styles.figures}>
            {r.figures.map((f, i) => (
              <View key={i} style={[styles.figure, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 11, color: colors.textLight }} numberOfLines={2}>{f.label}</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{f.value}</Text>
                <Text style={{ fontSize: 11, color: colors.textLight }}>{f.comment}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Section>
      <Section icon="list-check" title={ta('priorities')}>
        {(r.priorities || []).map((p, i) => (
          <Boxed key={i} title={p.title} pill={<Pill value={p.when}>{ta(`when.${p.when}`)}</Pill>}><Muted>{p.detail}</Muted></Boxed>
        ))}
      </Section>
      <Section icon="thumbs-up" title={ta('strengths')}><Bullets items={r.strengths} /></Section>
      <Section icon="triangle-exclamation" title={ta('risks')}>
        {(r.risks || []).map((k, i) => (
          <Boxed key={i} title={k.title} pill={<Pill value={k.severity}>{t(`ai.report.likelihood.${k.severity}`)}</Pill>}><Muted>{k.detail}</Muted></Boxed>
        ))}
      </Section>
    </View>
  );
}

function BriefView({ r }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tb = (k, o) => t(`ai.brief.${k}`, o);
  return (
    <View>
      <Text style={[styles.summary, { color: colors.text }]}>{r.situation}</Text>
      <Section icon="list-check" title={tb('actions')}>
        {(r.priority_actions || []).map((a, i) => (
          <Boxed key={i} title={a.action} pill={<Pill value={a.urgency}>{tb(`urgency.${a.urgency}`)}</Pill>}><Muted>{tb('who')}: {a.who} · {tb('why')}: {a.why}</Muted></Boxed>
        ))}
      </Section>
      <Section icon="location-dot" title={tb('hotspots')}>
        {(r.hotspots || []).map((h, i) => <Boxed key={i} title={h.district} pill={<Pill value={h.severity}>{h.severity}</Pill>}><Muted>{h.concern}</Muted></Boxed>)}
      </Section>
      <Section icon="people-arrows" title={tb('zoonotic')}><Para>{r.zoonotic_notes}</Para></Section>
      <Section icon="bullhorn" title={tb('farmerMessage')}><Note>{r.farmer_message}</Note></Section>
    </View>
  );
}

/* A saved report: title, date, print and share as PDF, then its content. */
export function SavedReport({ saved, subtitle, onDelete }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const showToast = useToast();
  const [downloading, setDownloading] = useState(false);
  const caseInfo = saved.input && (saved.input.case || saved.input.photos) ? { ...(saved.input.case || {}), photos: saved.input.photos } : undefined;
  const opts = { kind: saved.kind, report: saved.report, title: saved.title, caseInfo, reportId: saved.id, createdAt: saved.created_at, t, lang: i18n.language };
  const html = () => aiReportHtml(opts);

  async function print() {
    try { await printHtml(html()); } catch (e) { showToast(e.message, 'error'); }
  }
  /* Renders the branded report to an A4 PDF, names it like
     "LivestockPro-diagnosis-LP-001-2026-10-17.pdf" and opens the share sheet
     (Save to Files or Downloads, WhatsApp, email). */
  async function download() {
    setDownloading(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: html(), width: 595, height: 842 });
      const dest = new File(Paths.cache, aiReportFileName(opts));
      if (dest.exists) dest.delete();
      new File(uri).copy(dest);
      await Sharing.shareAsync(dest.uri, { mimeType: 'application/pdf', dialogTitle: saved.title, UTI: 'com.adobe.pdf' });
    } catch (e) { showToast(e.message, 'error'); }
    setDownloading(false);
  }

  const View_ = saved.kind === 'diagnosis' ? DiagnosisView : saved.kind === 'advisor' ? AdvisorView : BriefView;
  return (
    <View>
      <Text style={[styles.reportTitle, { color: colors.primaryDark }]}>{saved.title}</Text>
      <Muted style={{ marginBottom: 10 }}>{subtitle ? `${subtitle} · ` : ''}{t('ai.report.generated', { date: new Date(saved.created_at).toLocaleString(i18n.language) })}</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
        {Platform.OS !== 'web' ? <Button title={downloading ? t('ai.report.downloading') : t('ai.report.download')} icon="file-arrow-down" size="sm" onPress={download} loading={downloading} disabled={downloading} /> : null}
        <Button title={t('ai.report.print')} icon="print" variant="secondary" size="sm" onPress={print} />
        {onDelete ? <Button title={t('ai.report.delete')} icon="trash" variant="secondary" size="sm" onPress={() => onDelete(saved)} /> : null}
      </View>
      <View_ r={saved.report || {}} photos={saved.input && saved.input.photos} />
    </View>
  );
}

function Working({ label }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.working}>
      <View style={[styles.spark, { backgroundColor: colors.leaf }]}><Icon name="wand-magic-sparkles" size={13} color="#FFFFFF" /></View>
      <Text style={{ color: colors.textLight, fontWeight: '600', flex: 1 }}>{label || t('ai.working')}</Text>
    </View>
  );
}

function Notice({ children, error }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.note, { borderColor: colors.border, backgroundColor: colors.card, marginBottom: 14 }]}>
      <Icon name={error ? 'triangle-exclamation' : 'circle-info'} size={13} color={error ? colors.red : colors.textLight} />
      <Text style={[styles.para, { color: colors.text, flex: 1 }]}>{children}</Text>
    </View>
  );
}

function AskTab({ disabled }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const api = useApi();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scroll = useRef(null);
  const photos = usePhotos();
  const examples = t('ai.ask.examples', { returnObjects: true });

  /* A photo can go with a question, or on its own. */
  async function send(text) {
    const withPhotos = photos.photos.length > 0;
    const q = (text || draft).trim() || (withPhotos ? t('ai.photo.defaultQuestion') : '');
    if (!q || busy) return;
    const extra = withPhotos ? photos.payload() : {};
    const next = [...messages, { role: 'user', content: q, thumbs: withPhotos ? photos.photos.map((p) => p.thumb) : undefined }];
    setMessages(next);
    setDraft('');
    photos.clear();
    setError('');
    setBusy(true);
    const { data, error: err } = await api.aiChat({ messages: next.map(({ role, content }) => ({ role, content })), language: i18n.language, images: extra.images });
    setBusy(false);
    if (err) { setError(aiErrorText(t, err, i18n.language)); return; }
    setMessages([...next, { role: 'assistant', content: data.reply }]);
    setTimeout(() => scroll.current && scroll.current.scrollToEnd({ animated: true }), 50);
  }

  return (
    <Card>
      <CardBody>
        {messages.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 10 }}>
            <View style={[styles.spark, { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.leaf }]}><Icon name="comments" size={20} color="#FFFFFF" /></View>
            <Muted style={{ textAlign: 'center' }}>{t('ai.ask.empty')}</Muted>
            <View style={{ gap: 8, alignSelf: 'stretch' }}>
              {(Array.isArray(examples) ? examples : []).map((ex) => (
                <Pressable key={ex} disabled={disabled} onPress={() => send(ex)} style={[styles.example, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.text, fontSize: 13 }}>{ex}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <ScrollView ref={scroll} style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 10 }}>
            {messages.map((m, i) => (
              <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textLight, marginBottom: 2, textAlign: m.role === 'user' ? 'right' : 'left' }}>{m.role === 'user' ? t('ai.ask.you') : t('ai.ask.assistant')}</Text>
                <View style={[styles.bubble, m.role === 'user' ? { backgroundColor: colors.primary } : { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }]}>
                  {m.thumbs ? <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>{m.thumbs.map((src, j) => <Image key={j} source={{ uri: src }} style={styles.chatThumb} />)}</View> : null}
                  <Text selectable style={{ color: m.role === 'user' ? '#FFFFFF' : colors.text, fontSize: 14, lineHeight: 20 }}>{m.content}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
        {busy ? <Working /> : null}
        {error ? <Notice error>{error}</Notice> : null}
        <View style={{ marginTop: 12, gap: 8 }}>
          <Input multiline value={draft} onChangeText={setDraft} placeholder={t('ai.ask.placeholder')} editable={!disabled} />
          <PhotoPicker state={photos} disabled={disabled || busy} compact />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            {messages.length ? <Button title={t('ai.ask.clear')} icon="plus" variant="secondary" onPress={() => { setMessages([]); setError(''); }} /> : null}
            <Button title={t('ai.ask.send')} icon="paper-plane" onPress={() => send()} disabled={disabled || busy || (!draft.trim() && !photos.photos.length)} />
          </View>
        </View>
      </CardBody>
    </Card>
  );
}

/* Farm advisor, on request only (twin of the web's AdvisorTab): the
   farmer asks for advice and sees the answer written now. Earlier advice
   is never loaded or shown, here or on the dashboard. */
export function AdvisorCard({ disabled }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setSaved(null);
    const { data, error } = await api.aiAdvisor({ language: i18n.language });
    setBusy(false);
    if (error) { showToast(aiErrorText(t, error, i18n.language), 'error'); return; }
    setSaved(data);
  }

  return (
    <Card>
      <CardHeader
        title={t('ai.advisor.title')}
        icon="seedling"
        right={<Button title={saved ? t('ai.advisor.refresh') : t('ai.advisor.run')} icon="wand-magic-sparkles" size="sm" onPress={run} disabled={disabled || busy} loading={busy} />}
      />
      <CardBody>
        {busy ? <Working label={t('ai.advisor.working')} /> : saved ? (
          <SavedReport saved={saved} onDelete={async (x) => { await api.aiDeleteReport(x.id); setSaved(null); }} />
        ) : <Muted>{t('ai.advisor.intro')}</Muted>}
      </CardBody>
    </Card>
  );
}

/* Disease detection findings from the embedded model (src/ml), with no
   internet and no AI report: the photos with the disease names on them and
   the offline first-response guide for each disease found. */
export function DeviceResult({ result, onDone, doneLabel }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { vision, thumbs } = result;
  const dets = vision.detections || [];
  const labels = [...new Set(dets.map((d) => d.label))].sort((a, b) => (a === 'healthy') - (b === 'healthy'));
  return (
    <Card><CardBody>
      <Text style={[styles.reportTitle, { color: colors.primaryDark, marginBottom: 6 }]}>{t('ai.device.title')}</Text>
      <Muted style={{ marginBottom: 4 }}>{result.created_at ? `${new Date(result.created_at).toLocaleString(i18n.language)} · ` : ''}{t('ai.device.intro')}</Muted>
      <PhotoReview photos={thumbs} vision={vision} />
      {labels.length ? <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 4, marginBottom: 6 }]}>{t('ai.device.findings')}</Text> : null}
      {labels.length ? labels.map((label) => {
        const guide = findDisease(label);
        return (
          <Boxed key={label} title={visionLabel(t, label)}>
            {guide && label !== 'healthy' ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                {guide.notifiable ? <Note danger>{t('ai.device.reportable')}</Note> : null}
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textLight }}>{t('ai.device.doNow')}</Text>
                <Bullets items={guide.do_now} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textLight }}>{t('ai.device.seeVet')}</Text>
                <Para>{guide.see_vet}</Para>
              </View>
            ) : null}
          </Boxed>
        );
      }) : null}
      <Muted style={{ marginTop: 8, fontSize: 11.5 }}>{GUIDE_DISCLAIMER}</Muted>
      <View style={{ marginTop: 10 }}><Note danger>{t('ai.vetNotice')}</Note></View>
      <Button title={doneLabel || t('ai.device.again')} icon="rotate" variant="secondary" onPress={onDone} style={{ marginTop: 16 }} />
    </CardBody></Card>
  );
}

/* Earlier checks made on this phone; tap one to see its findings again. */
function DeviceScans({ onOpen }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const { userId } = useAuth();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    const load = () => listScans(db, userId).then((r) => { if (live) setRows(r); }).catch(() => {});
    load();
    const off = subscribeScans(load);
    return () => { live = false; off(); };
  }, [db, userId]);
  if (!rows.length) return null;
  return (
    <View style={{ marginTop: 18, gap: 6 }}>
      <Text style={{ fontWeight: '800', color: colors.text }}>{t('ai.device.earlier')}</Text>
      {rows.map((r) => {
        const names = [...new Set((r.vision.detections || []).slice().sort((a, b) => b.confidence - a.confidence).map((d) => visionLabel(t, d.label)))];
        return (
          <Pressable key={r.id} onPress={() => onOpen(r)} accessibilityRole="button" style={({ pressed }) => [styles.earlier, { borderColor: colors.border, backgroundColor: pressed ? colors.bg : colors.card }]}>
            {r.thumbs[0] ? <Image source={{ uri: r.thumbs[0] }} style={{ width: 40, height: 40, borderRadius: 6 }} /> : <Icon name="mobile-screen" size={14} color={colors.primary} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }} numberOfLines={2}>{names.length ? names.join(', ') : t('ai.device.nothing')}</Text>
              <Text style={{ color: colors.textLight, fontSize: 11.5 }}>{r.summary ? `${r.summary} · ` : ''}{new Date(r.created_at).toLocaleString(i18n.language)}</Text>
            </View>
            <Icon name="chevron-right" size={12} color={colors.textLight} />
          </Pressable>
        );
      })}
    </View>
  );
}

function DiagnoseTab({ disabled, recordId }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const api = useApi();
  const repo = useRepository();
  const showToast = useToast();
  const [animals, setAnimals] = useState([]);
  const [record, setRecord] = useState(null);
  const [animalId, setAnimalId] = useState('');
  const [species, setSpecies] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [earlier, setEarlier] = useState([]);
  const [deviceResult, setDeviceResult] = useState(null);
  const photos = usePhotos();
  const db = useSQLiteContext();
  const { userId } = useAuth();

  useEffect(() => {
    let live = true;
    if (recordId) api.aiReports({ kind: 'diagnosis', record_id: recordId, limit: 5 }).then(({ data }) => { if (live) setEarlier(data || []); });
    (async () => {
      const list = await repo.list('animals', { order: 'tag_id ASC' });
      if (!live) return;
      setAnimals(list || []);
      if (recordId) {
        const rows = await repo.list('health_records', { order: 'created_at DESC' });
        const r = (rows || []).find((x) => x.id === recordId);
        if (r && live) {
          setRecord(r);
          setSymptoms([r.disease, r.notes].filter(Boolean).join('. '));
          const a = (list || []).find((x) => x.id === r.animal_id || x.tag_id === r.tag_id);
          if (a) setAnimalId(a.id);
        }
      }
    })();
    return () => { live = false; };
  }, [repo, recordId]); // eslint-disable-line react-hooks/exhaustive-deps

  const animal = animals.find((a) => a.id === animalId);

  async function run() {
    if (!symptoms.trim() && !photos.photos.length) { showToast(t('ai.diagnose.needInput'), 'error'); return; }
    setBusy(true);
    const body = { symptoms, language: i18n.language, ...photos.payload() };
    if (record) {
      body.health_record_id = record.id;
      body.record = { tag_id: record.tag_id, animal_id: record.animal_id, disease: record.disease, treatment: record.treatment, medicine: record.medicine, vet_name: record.vet_name, check_date: record.check_date, next_check_date: record.next_check_date, status: record.status, notes: record.notes };
    }
    if (animal) { body.animal_id = animal.id; body.tag_id = animal.tag_id; }
    else if (species) body.species = species;
    /* Only a phone with no network at all skips the server; "internet not
       reachable" can be reported briefly while connected, so a failed
       request falls back to the phone instead. */
    const net = await NetInfo.fetch().catch(() => null);
    const offline = net && net.isConnected === false;
    const { data, error } = offline ? { error: { networkError: true } } : await api.aiDiagnose(body);
    if (error && error.networkError) {
      setBusy(false);
      // No internet: the embedded model can still give its findings for the photos.
      if (deviceModelAvailable && photos.photos.length) { await checkOnPhone(); return; }
      showToast(deviceModelAvailable ? t('ai.device.needPhoto') : t('ai.offline'), 'error');
      return;
    }
    setBusy(false);
    if (error) { showToast(aiErrorText(t, error, i18n.language), 'error'); return; }
    photos.clear();
    setSaved(data);
    if (record) setEarlier((list) => [data, ...list]);
  }

  /* Disease detection with the embedded YOLO11n model: no internet, no AI
     report, just the findings. They stay on this phone (src/sync/aiScans.js). */
  async function checkOnPhone() {
    if (!photos.photos.length) { showToast(t('ai.device.needPhoto'), 'error'); return; }
    setBusy(true);
    try {
      const vision = await detectPhotos(photos.photos.map((p) => ({ uri: p.fullUri || p.uri, width: p.width, height: p.height })));
      const thumbs = photos.photos.map((p) => p.thumb);
      await saveScan(db, userId, { vision, thumbs, summary: animal ? animal.tag_id : null }).catch(() => {});
      photos.clear();
      setDeviceResult({ vision, thumbs });
    } catch (e) {
      showToast(t('ai.device.failed', { message: e.message }), 'error');
    }
    setBusy(false);
  }

  if (deviceResult) return <DeviceResult result={deviceResult} onDone={() => setDeviceResult(null)} doneLabel={deviceResult.created_at ? t('ai.back') : undefined} />;

  if (saved) {
    return (
      <Card><CardBody>
        <SavedReport saved={saved} subtitle={animal ? `${t('ai.report.animal')}: ${animal.tag_id}` : ''} />
        <Button title={t('ai.diagnose.again')} icon="rotate" variant="secondary" onPress={() => setSaved(null)} style={{ marginTop: 16 }} />
      </CardBody></Card>
    );
  }

  return (
    <Card>
      <CardHeader title={t('ai.diagnose.title') + (record && record.tag_id ? ` · ${record.tag_id}` : '')} icon="stethoscope" />
      <CardBody>
        {busy ? <Working label={t('ai.diagnose.working')} /> : (
          <>
            <Muted style={{ marginBottom: 12 }}>{t('ai.diagnose.intro')}</Muted>
            <FormGroup label={t('ai.diagnose.animal')}>
              <Select
                value={animalId}
                onChange={setAnimalId}
                placeholder={t('ai.diagnose.chooseAnimal')}
                options={[{ value: '', label: t('ai.diagnose.chooseAnimal') }, ...animals.map((a) => ({ value: a.id, label: `${a.tag_id}${a.name ? ` · ${a.name}` : ''}${a.species ? ` · ${t(`enums.species.${a.species}`, a.species)}` : ''}` }))]}
              />
            </FormGroup>
            {!animal ? (
              <FormGroup label={t('ai.diagnose.species')}>
                <Input value={species} onChangeText={setSpecies} placeholder={t('ai.diagnose.speciesHint')} />
              </FormGroup>
            ) : null}
            <FormGroup label={t('ai.diagnose.symptoms')}>
              <Input multiline value={symptoms} onChangeText={setSymptoms} placeholder={t('ai.diagnose.symptomsHint')} />
            </FormGroup>
            <FormGroup label={t('ai.photo.label')}>
              <PhotoPicker state={photos} disabled={disabled && !deviceModelAvailable} />
            </FormGroup>
            <Note danger>{t('ai.vetNotice')}</Note>
            <AiUsageMeter kind="diagnose" style={{ marginTop: 12 }} />
            <Button title={t('ai.diagnose.run')} icon="wand-magic-sparkles" onPress={run} disabled={disabled || (!symptoms.trim() && !photos.photos.length)} style={{ marginTop: 14 }} block />
            {deviceModelAvailable ? (
              <>
                <Button title={t('ai.device.run')} icon="mobile-screen" variant="secondary" onPress={checkOnPhone} disabled={!photos.photos.length} style={{ marginTop: 10 }} block />
                <Muted style={{ marginTop: 6, fontSize: 12, textAlign: 'center' }}>{t('ai.device.runHint')}</Muted>
              </>
            ) : null}
            {earlier.length ? (
              <View style={{ marginTop: 18, gap: 6 }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{t('ai.diagnose.previous')}</Text>
                {earlier.map((r) => (
                  <Pressable key={r.id} onPress={() => setSaved(r)} accessibilityRole="button" style={({ pressed }) => [styles.earlier, { borderColor: colors.border, backgroundColor: pressed ? colors.bg : colors.card }]}>
                    <Icon name="file-medical" size={14} color={colors.primary} />
                    <Text style={{ flex: 1, color: colors.text, fontSize: 13 }} numberOfLines={2}>{r.title}</Text>
                    <Text style={{ color: colors.textLight, fontSize: 11.5 }}>{new Date(r.created_at).toLocaleDateString(i18n.language)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <DeviceScans onOpen={(scan) => setDeviceResult(scan)} />
          </>
        )}
      </CardBody>
    </Card>
  );
}

function ReportsTab() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const api = useApi();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await api.aiReports({ limit: 60 });
    if (err) { setError(aiErrorText(t, err, i18n.language)); setList([]); return; }
    setList((data || []).filter((r) => r.kind !== 'advisor')); // earlier advice is not kept on show
  }, [api, t, i18n.language]);
  useEffect(() => { load(); }, [load]);

  async function remove(r) {
    await api.aiDeleteReport(r.id);
    setList((l) => l.filter((x) => x.id !== r.id));
    setOpen(null);
  }

  if (open) {
    return (
      <Card><CardBody>
        <Button title={t('ai.back')} icon="arrow-left" variant="secondary" size="sm" onPress={() => setOpen(null)} style={{ alignSelf: 'flex-start', marginBottom: 12 }} />
        <SavedReport saved={open} subtitle={open.input && open.input.tag_id ? `${t('ai.report.animal')}: ${open.input.tag_id}` : ''} onDelete={remove} />
      </CardBody></Card>
    );
  }

  const ICON = { diagnosis: 'file-medical', advisor: 'seedling', onehealth: 'shield-virus' };
  return (
    <Card>
      <CardBody flush>
        {error ? <View style={{ padding: 14 }}><Notice error>{error}</Notice></View> : null}
        {list === null ? <Working label={t('common.loading')} /> : list.length === 0 ? (
          <EmptyState icon="folder-open" title={t('ai.reports.empty')} />
        ) : list.map((r, i) => (
          <Pressable key={r.id} onPress={() => setOpen(r)} style={({ pressed }) => [styles.row, i < list.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }, pressed && { backgroundColor: colors.bg }]}>
            <View style={[styles.sectionIcon, { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.leaf }]}><Icon name={ICON[r.kind] || 'file'} size={13} color="#FFFFFF" /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={2}>{r.title}</Text>
              <Text style={{ fontSize: 11.5, color: colors.textLight }} numberOfLines={1}>{t(`ai.reports.kinds.${r.kind}`)}{r.input && r.input.tag_id ? ` · ${r.input.tag_id}` : ''} · {new Date(r.created_at).toLocaleDateString(i18n.language)}</Text>
            </View>
            <Icon name="chevron-right" size={12} color={colors.textLight} />
          </Pressable>
        ))}
      </CardBody>
    </Card>
  );
}

const TABS = ['ask', 'advisor', 'diagnose', 'reports'];

export default function AssistantScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const [tab, setTab] = useState(TABS.includes(params.tab) ? params.tab : 'ask');
  const configured = useAiStatus();

  useEffect(() => { if (TABS.includes(params.tab)) setTab(params.tab); }, [params.tab, params.record]);

  return (
    <Page>
      <PageHeader title={t('ai.title')} subtitle={t('ai.subtitle')} />
      {configured === false ? <Notice>{t('ai.notConfigured')}</Notice> : null}
      {configured ? <AiUsageMeter style={{ marginBottom: 14 }} /> : null}
      <Tabs items={TABS.map((k) => ({ value: k, label: t(`ai.tabs.${k}`) }))} value={tab} onChange={setTab} />
      <View style={{ height: 14 }} />
      {tab === 'ask' ? <AskTab disabled={configured === false} /> : null}
      {tab === 'advisor' ? <AdvisorCard disabled={configured === false} /> : null}
      {tab === 'diagnose' ? <DiagnoseTab disabled={configured === false} recordId={params.record ? String(params.record) : null} /> : null}
      {tab === 'reports' ? <ReportsTab /> : null}
      <Muted style={{ textAlign: 'center', marginTop: 16, fontSize: 11 }}>{t('ai.poweredBy')}</Muted>
    </Page>
  );
}

const styles = StyleSheet.create({
  photoBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  earlier: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chatThumb: { width: 110, height: 82, borderRadius: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sectionIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  para: { fontSize: 13.5, lineHeight: 20 },
  summary: { fontSize: 15, lineHeight: 22, marginBottom: 6 },
  box: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  boxHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  boxTitle: { fontWeight: '700', fontSize: 13.5, flexShrink: 1 },
  note: { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 8, padding: 10, alignItems: 'flex-start' },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  figure: { borderWidth: 1, borderRadius: 10, padding: 10, flexBasis: '47%', flexGrow: 1, gap: 2 },
  reportTitle: { fontSize: 17, fontWeight: '800' },
  working: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 18 },
  spark: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  example: { borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14 },
  bubble: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
});
