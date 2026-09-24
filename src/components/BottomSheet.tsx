import React from 'react';
import { Modal, View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTheme } from '@/theme/theme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Lo sfondo che chiude il foglio sta DIETRO al foglio, non
            intorno al suo contenuto. Avvolgere la lista in un Pressable
            (per fermare il tocco prima dello sfondo) gliene faceva
            contendere il gesto: lo scorrimento partiva una volta su tre.
            Così il tocco sul contenuto non incontra nessun Pressable di
            troppo, e quello fuori dal foglio arriva qui. */}
        <Pressable style={styles.backdrop} onPress={onClose} />
        {/* `automaticOffset` fa misurare alla vista la propria posizione
            reale, tenendo conto del fatto che qui siamo dentro una Modal. */}
        <KeyboardAvoidingView behavior="padding" automaticOffset style={styles.wrap} pointerEvents="box-none">
          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {/* `nestedScrollEnabled`: su Android, dentro una Modal, senza
                questo la lista può restare "ferma" dopo un tocco su una
                riga, finché non se ne fa un altro. */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardDismissMode="on-drag"
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,12,17,0.55)',
  },
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 99,
    alignSelf: 'center',
    marginBottom: 12,
  },
});
