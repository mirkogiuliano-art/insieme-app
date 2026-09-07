import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';
import { ImageIcon, FileIcon } from '@/components/Icon';

interface AttachMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  onPickMedia: () => void;
  onPickDocument: () => void;
}

/**
 * Cosa allegare, dietro alla graffetta.
 *
 * Foto/video e documenti passano da due selettori di sistema diversi
 * (`expo-image-picker` per il primo, con anteprima a griglia e compressione;
 * `expo-document-picker` per il secondo, che apre invece la sfoglia file del
 * telefono). Un solo pulsante non può aprirli entrambi insieme, e usare solo
 * il selettore file per tutto perderebbe la griglia foto e la compressione
 * che il primo dà — da qui questo passaggio in mezzo, condiviso fra chat e
 * sezione Link perché la scelta è identica nei due posti.
 */
export function AttachMenuSheet({ visible, onClose, onPickMedia, onPickDocument }: AttachMenuSheetProps) {
  const { colors } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.text }]}>Allega</Text>
      <Pressable
        onPress={() => {
          onClose();
          onPickMedia();
        }}
        style={[styles.row, { borderBottomColor: colors.border }]}
      >
        <ImageIcon size={19} color={colors.textDim} />
        <Text style={[styles.rowText, { color: colors.text }]}>Foto o video</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          onClose();
          onPickDocument();
        }}
        style={[styles.row, { borderBottomWidth: 0 }]}
      >
        <FileIcon size={19} color={colors.textDim} />
        <Text style={[styles.rowText, { color: colors.text }]}>Documento</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  rowText: { fontSize: 14.5, fontWeight: '600' },
});
