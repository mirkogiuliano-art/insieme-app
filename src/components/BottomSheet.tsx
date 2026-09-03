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
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* `automaticOffset` fa misurare alla vista la propria posizione
            reale, tenendo conto del fatto che qui siamo dentro una Modal. */}
        <KeyboardAvoidingView behavior="padding" automaticOffset style={styles.wrap}>
          {/* Il Pressable interno cattura il tocco così non arriva al backdrop e non chiude il foglio. */}
          <Pressable onPress={() => {}} style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
