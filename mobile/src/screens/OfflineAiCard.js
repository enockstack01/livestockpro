import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';
import * as gemma from '../ml/gemma';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from '../lib/toast';
import { Button, Card, CardBody, CardHeader, Muted } from '../ui/kit';

/* Settings: the offline AI (Gemma 4 E2B with the YOLO11n detector, src/ml).
   The app downloads it by itself on Wi-Fi (about 2.8 GB); here it can be
   fetched now on mobile data, stopped or removed. Then the diagnosis and
   Ask LivestockPro work on the phone with no internet. */
export default function OfflineAiCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const showToast = useToast();
  const [s, setS] = useState({ status: 'unknown', progress: 0 });
  const [test, setTest] = useState(null); // { busy } | { seconds, text } | { error }
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    const off = gemma.subscribe(setS);
    gemma.refreshStatus();
    gemma.lastProblem().then(setProblem);
    return off;
  }, []);
  if (s.status === 'unsupported' || s.status === 'unknown') {
    return s.status === 'unsupported' && gemma.GEMMA.bytes ? (
      <Card>
        <CardHeader title={t('ai.local.title')} icon="microchip" />
        <CardBody><Muted>{t('ai.local.unsupported')}</Muted></CardBody>
      </Card>
    ) : null;
  }
  const mb = Math.round(gemma.GEMMA.bytes / 1e6);

  /* Loads the offline AI and writes a few words, so the person can see it
     works on this phone (or what stops it) before they need it offline. */
  async function runTest() {
    setTest({ busy: true });
    try {
      setTest(await gemma.selfTest());
      setProblem(null);
    } catch (e) {
      setTest({ error: e.message || String(e) });
    }
  }

  async function start() {
    const net = await NetInfo.fetch().catch(() => null);
    if (net && net.isConnected === false) { showToast(t('ai.offline'), 'error'); return; }
    // Advise Wi-Fi: a large download on mobile data can be costly.
    if (net && net.type === 'cellular') showToast(t('ai.local.onMobileData', { mb }), 'info');
    gemma.downloadNow().catch((e) => showToast(t('ai.local.failed', { message: e.message }), 'error'));
  }

  return (
    <Card>
      <CardHeader title={t('ai.local.title')} icon="microchip" />
      <CardBody>
        <Muted style={{ marginBottom: 10 }}>{t('ai.local.intro', { mb })}</Muted>
        {s.status === 'ready' ? (
          <>
            <Text style={{ color: colors.primary, fontWeight: '800', marginBottom: 10 }}>{t('ai.local.ready')}</Text>
            {test && test.seconds !== undefined ? <Text style={{ color: colors.text, marginBottom: 8 }}>{t('ai.local.testOk', { seconds: test.seconds })}</Text> : null}
            {test && test.error ? <Text style={{ color: colors.red, marginBottom: 8 }}>{t('ai.local.testFailed', { message: test.error })}</Text> : null}
            {problem && !test ? <Text style={{ color: colors.red, marginBottom: 8, fontSize: 12.5 }}>{t('ai.local.lastProblem', { message: problem.message, date: new Date(problem.at).toLocaleString() })}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button title={test && test.busy ? t('ai.local.testing') : t('ai.local.test')} icon="vial" size="sm" onPress={runTest} loading={Boolean(test && test.busy)} disabled={Boolean(test && test.busy)} />
              <Button title={t('ai.local.remove', { mb })} icon="trash" variant="secondary" size="sm" onPress={() => gemma.removeModel()} />
            </View>
          </>
        ) : s.status === 'downloading' ? (
          <>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{t('ai.local.downloading', { pct: Math.round(s.progress * 100), mb })}</Text>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginVertical: 10 }}>
              <View style={{ width: `${Math.round(s.progress * 100)}%`, height: '100%', backgroundColor: colors.leaf }} />
            </View>
            <Muted style={{ marginBottom: 10, fontSize: 12 }}>{t('ai.local.keepOpen')}</Muted>
            <Button title={t('common.cancel')} icon="xmark" variant="secondary" size="sm" onPress={() => gemma.cancelDownload()} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : (
          <>
            {s.status === 'error' ? <Text style={{ color: colors.red, marginBottom: 8 }}>{t('ai.local.failed', { message: s.error || '' })}</Text> : null}
            {s.progress > 0 ? <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>{t('ai.local.partly', { pct: Math.round(s.progress * 100) })}</Text> : null}
            {gemma.waitingForWifi() ? (
              <Text style={{ color: colors.text, marginBottom: 8 }}>{t('ai.local.waitingWifi', { mb })}</Text>
            ) : <Muted style={{ marginBottom: 10, fontSize: 12 }}>{t('ai.local.needs', { mb })}</Muted>}
            <Button title={gemma.waitingForWifi() ? t('ai.local.downloadOnData') : t('ai.local.download', { mb })} icon="download" size="sm" onPress={start} style={{ alignSelf: 'flex-start' }} />
          </>
        )}
        <Muted style={{ marginTop: 12, fontSize: 11.5 }}>{t('ai.local.limits')}</Muted>
        <Text style={{ marginTop: 6, fontSize: 11.5, color: colors.primary }} onPress={() => Linking.openURL(gemma.GEMMA.terms)}>{t('ai.local.terms')}</Text>
      </CardBody>
    </Card>
  );
}
