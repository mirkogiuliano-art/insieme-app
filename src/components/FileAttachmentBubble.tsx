import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { FileIcon } from '@/components/Icon';
import { fileKindFor, fileLabelFor, formatFileSize, type FileKind } from '@/lib/utils';

/** Colore della categoria di file — rosso per PDF, viola per Word, verde
 * per Excel, come nell'iconografia già familiare di queste app. Prende i
 * colori dal tema invece di un rosso/verde fisso, così regge sia chiaro
 * che scuro. Esportata perché la stessa mappatura serve anche a LinkCard,
 * per colorare la miniatura di un documento salvato nella sezione Link. */
export function fileBadgeColor(kind: FileKind, colors: { coral: string; lilac: string; teal: string; textFaint: string }): string {
  if (kind === 'pdf') return colors.coral;
  if (kind === 'word') return colors.lilac;
  if (kind === 'excel') return colors.teal;
  return colors.textFaint;
}

/**
 * Fumetto di un documento allegato a un messaggio (PDF, Word, Excel, o
 * altro). Stessa struttura e stessi colori di ChatLinkPreview per il
 * fumetto proprio/altrui, dato che vivono nello stesso contesto.
 */
export function FileAttachmentBubble({
  url,
  name,
  size,
  own,
}: {
  url: string;
  name: string;
  size: number | null;
  own: boolean;
}) {
  const { colors } = useTheme();
  const kind = fileKindFor(name);
  const badge = fileBadgeColor(kind, colors);
  const bg = own ? 'rgba(0,0,0,0.10)' : colors.surface2;
  const bd = own ? '#6B5730' : colors.border;
  const strong = own ? colors.inkOnAmber : colors.text;
  const faint = own ? '#6B5730' : colors.textFaint;

  return (
    <Pressable
      onPress={(e) => {
        // Senza questo il tocco arriva anche al fumetto e aprirebbe le reazioni.
        e.stopPropagation?.();
        Linking.openURL(url);
      }}
      style={[styles.row, { backgroundColor: bg, borderColor: bd }]}
    >
      <View style={[styles.iconBox, { borderColor: badge }]}>
        <FileIcon size={18} color={badge} strokeWidth={1.6} />
        <Text style={[styles.badgeLabel, { color: badge }]}>{fileLabelFor(name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: strong }]} numberOfLines={2}>
          {name}
        </Text>
        {size != null ? <Text style={[styles.size, { color: faint }]}>{formatFileSize(size)}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: 9,
    marginTop: 7,
    maxWidth: 240,
  },
  iconBox: { width: 42, height: 42, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  badgeLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.3 },
  name: { fontSize: 12.5, fontWeight: '700', lineHeight: 16 },
  size: { fontSize: 10.5, marginTop: 2 },
});
