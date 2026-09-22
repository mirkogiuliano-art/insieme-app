import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { BottomSheet } from '@/components/BottomSheet';
import { SearchIcon, CheckIcon } from '@/components/Icon';
import { PlaceTile } from '@/components/MapPin';
import type { RawPin } from '@/lib/api/pins';

interface PlacePickerSheetProps {
  visible: boolean;
  /** Titolo del link che si sta collegando, mostrato come sottotitolo. */
  linkTitle: string;
  pins: RawPin[];
  categoryFor: (pin: RawPin) => { name: string; color: string };
  /** Id dei posti già collegati a questo link. */
  linkedPinIds: string[];
  /** `attached` dice se il posto risulta collegato *adesso*: true = da staccare. */
  onToggle: (pinId: string, attached: boolean) => void;
  onClose: () => void;
}

/** Elenco a spunta dei posti del gruppo: si tocca per collegare, si ritocca
 * per scollegare. Il collegamento è molti-a-molti, quindi un link può stare
 * su più posti contemporaneamente. */
export function PlacePickerSheet({
  visible,
  linkTitle,
  pins,
  categoryFor,
  linkedPinIds,
  onToggle,
  onClose,
}: PlacePickerSheetProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const term = query.trim().toLowerCase();
  const shown = pins.filter((p) => !term || p.name.toLowerCase().includes(term));

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.text }]}>Collega a un posto</Text>
      <Text style={[styles.sub, { color: colors.textDim }]} numberOfLines={2}>
        {linkTitle}
      </Text>

      {pins.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textFaint }]}>
          Non ci sono ancora posti salvati. Aggiungine uno dalla sezione Mappa, poi torna qui.
        </Text>
      ) : (
        <>
          <View style={[styles.searchRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <SearchIcon size={15} color={colors.textFaint} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Cerca tra i posti salvati"
              placeholderTextColor={colors.textFaint}
              value={query}
              onChangeText={setQuery}
            />
          </View>
          {shown.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textFaint }]}>Nessun posto corrisponde alla ricerca.</Text>
          ) : (
            // Le righe dei posti come nella Mappa, in un blocco unico, con la
            // spunta da accendere o spegnere.
            <View style={[styles.block, { backgroundColor: colors.surface2 }]}>
              {shown.map((p, i) => {
                const cat = categoryFor(p);
                const attached = linkedPinIds.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => onToggle(p.id, attached)}
                    style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                  >
                    <PlaceTile color={cat.color} categoryName={cat.name} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 1 }}>{cat.name}</Text>
                    </View>
                    <View
                      style={[
                        styles.check,
                        { borderColor: attached ? colors.teal : colors.border, backgroundColor: attached ? colors.teal : 'transparent' },
                      ]}
                    >
                      {attached ? <CheckIcon size={12} color={colors.bg} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}

      <Pressable onPress={onClose} style={[styles.done, { backgroundColor: colors.amber }]}>
        <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 14.5 }}>Fatto</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 2 },
  sub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: RADIUS.sm, paddingHorizontal: 12, height: 42, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13.5, padding: 0 },
  block: { borderRadius: RADIUS.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10 },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 12.5, lineHeight: 18, paddingVertical: 8 },
  done: { height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
});
