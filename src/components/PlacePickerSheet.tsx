import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { BottomSheet } from '@/components/BottomSheet';
import { SearchIcon, CheckIcon } from '@/components/Icon';
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
            shown.map((p) => {
              const cat = categoryFor(p);
              const attached = linkedPinIds.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => onToggle(p.id, attached)}
                  style={[
                    styles.row,
                    { borderColor: attached ? cat.color : colors.border, backgroundColor: attached ? colors.surface2 : 'transparent' },
                  ]}
                >
                  <View style={[styles.placeDot, { backgroundColor: cat.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: colors.textFaint, marginTop: 2 }}>{cat.name}</Text>
                  </View>
                  <View
                    style={[
                      styles.check,
                      { borderColor: attached ? cat.color : colors.border, backgroundColor: attached ? cat.color : 'transparent' },
                    ]}
                  >
                    {attached ? <CheckIcon size={11} color="#fff" /> : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </>
      )}

      <Pressable onPress={onClose} style={[styles.btnSecondary, { borderColor: colors.border }]}>
        <Text style={{ color: colors.textDim, fontWeight: '600' }}>Fatto</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  sub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 13.5, padding: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8,
  },
  placeDot: { width: 13, height: 13, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 12.5, lineHeight: 18, paddingVertical: 8 },
  btnSecondary: { paddingVertical: 12, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center', marginTop: 8 },
});
