import { useMemo } from 'react';
import { KeyboardAvoidingView, Modal as RNModal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';

/* Native counterpart to client/src/components/Modal.jsx: same
   open/onClose/title/children/footer contract, used for every add/edit form
   and delete confirmation across all record screens. */
export default function Modal({ open, onClose, title, children, footer }) {
  const { colors, radius } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius), [colors, radius]);

  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Icon name="xmark" size={20} color={colors.textLight} />
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            {children}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

function makeStyles(colors, radius) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', paddingTop: 8, width: '100%', maxWidth: 640, alignSelf: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 17, fontWeight: '700', color: colors.primaryDark, flex: 1 },
    body: { paddingHorizontal: 20, paddingTop: 12 },
    footer: { flexDirection: 'row', gap: 10, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  });
}
