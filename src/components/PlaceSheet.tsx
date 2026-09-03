import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Image, Linking } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { BottomSheet } from '@/components/BottomSheet';
import { LinkIcon, PlayIcon, PlusIcon, CloseIcon, SearchIcon, MapIcon } from '@/components/Icon';
import { dateLabel, mapsUrlForPlace } from '@/lib/utils';
import type { RawPin } from '@/lib/api/pins';
import type { RawLink } from '@/lib/api/links';

interface PlaceSheetProps {
  /** `null` tiene il foglio chiuso. */
  pin: RawPin | null;
  categoryName: string;
  categoryColor: string;
  authorName: string;
  /** Tutti i link del gruppo: servono al selettore. */
  allLinks: RawLink[];
  /** Id dei link già collegati a questo posto. */
  linkedLinkIds: string[];
  onAttach: (linkId: string) => void;
  onDetach: (linkId: string) => void;
  /** Assente dove l'eliminazione del posto non è prevista (mappa web). */
  onDelete?: () => void;
  /** Assente dove non c'è una mappa interattiva su cui centrare (web). */
  onShowOnMap?: () => void;
  onClose: () => void;
}

/** Miniatura di un link: foto se c'è, icona play per i video, icona
 * generica altrimenti — stessa logica delle card in LinksTab. */
function LinkThumb({ link, tint, size }: { link: RawLink; tint: string; size: number }) {
  const { colors } = useTheme();
  if (link.thumb) return <Image source={{ uri: link.thumb }} style={{ width: size, height: size, borderRadius: 6 }} />;
  const isVideo = link.platform === 'video' || link.platform === 'youtube' || link.platform === 'vimeo';
  return (
    <View
      style={[
        styles.thumbFallback,
        { width: size, height: size, backgroundColor: isVideo ? '#1B2530' : colors.surface2 },
      ]}
    >
      {isVideo ? <PlayIcon size={size * 0.5} color="#fff" /> : <LinkIcon size={size * 0.55} color={tint} strokeWidth={1.6} />}
    </View>
  );
}

export function PlaceSheet({
  pin,
  categoryName,
  categoryColor,
  authorName,
  allLinks,
  linkedLinkIds,
  onAttach,
  onDetach,
  onDelete,
  onShowOnMap,
  onClose,
}: PlaceSheetProps) {
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Ogni volta che si apre un posto diverso il foglio riparte dal dettaglio.
  useEffect(() => {
    setPicking(false);
    setQuery('');
    setConfirmDelete(false);
  }, [pin?.id]);

  const linked = allLinks.filter((l) => linkedLinkIds.includes(l.id));
  const term = query.trim().toLowerCase();
  const attachable = allLinks
    .filter((l) => !linkedLinkIds.includes(l.id))
    .filter((l) => !term || l.title.toLowerCase().includes(term) || l.label.toLowerCase().includes(term));

  const close = () => {
    setPicking(false);
    onClose();
  };

  if (!pin) return <BottomSheet visible={false} onClose={close}>{null}</BottomSheet>;

  return (
    <BottomSheet visible onClose={close}>
      {picking ? (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Collega un link</Text>
          <Text style={[styles.sub, { color: colors.textDim }]}>a &quot;{pin.name}&quot;</Text>
          <View style={[styles.searchRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <SearchIcon size={15} color={colors.textFaint} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Cerca tra i link salvati"
              placeholderTextColor={colors.textFaint}
              value={query}
              onChangeText={setQuery}
            />
          </View>
          {attachable.length === 0 ? (
            <Text style={[styles.emptyPicker, { color: colors.textFaint }]}>
              {allLinks.length === 0
                ? 'Non ci sono ancora link salvati nel gruppo.'
                : term
                  ? 'Nessun link corrisponde alla ricerca.'
                  : 'Tutti i link del gruppo sono già collegati a questo posto.'}
            </Text>
          ) : (
            attachable.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => {
                  onAttach(l.id);
                  setPicking(false);
                  setQuery('');
                }}
                style={[styles.pickRow, { borderColor: colors.border }]}
              >
                <LinkThumb link={l} tint={categoryColor} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: colors.textFaint, marginTop: 2 }}>{l.label}</Text>
                </View>
                <PlusIcon size={14} color={colors.textDim} />
              </Pressable>
            ))
          )}
          <Pressable onPress={() => setPicking(false)} style={[styles.btnSecondary, { borderColor: colors.border, marginTop: 14 }]}>
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>Indietro</Text>
          </Pressable>
        </>
      ) : confirmDelete ? (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Eliminare &quot;{pin.name}&quot;?</Text>
          <Text style={[styles.sub, { color: colors.textDim }]}>
            {linked.length > 0
              ? `Il posto sparisce dalla mappa per tutti. I ${linked.length} link collegati restano nella sezione Link, perdono solo il collegamento.`
              : 'Il posto sparisce dalla mappa per tutti nel gruppo.'}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => setConfirmDelete(false)} style={[styles.btnSecondary, { borderColor: colors.border }]}>
              <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
            </Pressable>
            <Pressable onPress={onDelete} style={[styles.btnPrimary, { backgroundColor: colors.danger }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Elimina</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={styles.header}>
            <View style={[styles.placeDot, { backgroundColor: categoryColor }]} />
            <Text style={[styles.title, { flex: 1, color: colors.text, marginBottom: 0 }]}>{pin.name}</Text>
          </View>
          <Text style={[styles.sub, { color: colors.textDim }]}>
            {categoryName} · {authorName} · {dateLabel(pin.ts)}
          </Text>

          <Text style={[styles.sectionLabel, { color: colors.textDim }]}>
            LINK COLLEGATI {linked.length > 0 ? `(${linked.length})` : ''}
          </Text>
          {linked.length === 0 ? (
            <Text style={[styles.emptyLinked, { color: colors.textFaint }]}>
              Nessun link collegato. Aggancia qui il video, la foto o la recensione di questo posto.
            </Text>
          ) : (
            linked.map((l) => (
              <View key={l.id} style={[styles.linkedRow, { borderColor: colors.border }]}>
                <Pressable onPress={() => Linking.openURL(l.url)} style={styles.linkedMain}>
                  <LinkThumb link={l} tint={categoryColor} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={2}>
                      {l.title}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: colors.textFaint, marginTop: 2 }}>{l.label}</Text>
                  </View>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => onDetach(l.id)} style={styles.detachBtn}>
                  <CloseIcon size={13} color={colors.textFaint} />
                </Pressable>
              </View>
            ))
          )}

          <Pressable onPress={() => setPicking(true)} style={[styles.attachRow, { borderColor: colors.border }]}>
            <PlusIcon size={14} color={colors.amber} />
            <Text style={{ color: colors.amber, fontWeight: '700', fontSize: 13 }}>Collega un link</Text>
          </Pressable>

          {onShowOnMap ? (
            <Pressable onPress={onShowOnMap} style={[styles.mapsRow, { borderColor: colors.border }]}>
              <MapIcon size={15} color={colors.textDim} strokeWidth={1.8} />
              <Text style={{ color: colors.textDim, fontWeight: '600', fontSize: 13 }}>Mostra sulla mappa</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => Linking.openURL(mapsUrlForPlace(pin))}
            style={[styles.mapsRow, { borderColor: colors.border }]}
          >
            <MapIcon size={15} color={colors.textDim} strokeWidth={1.8} />
            <Text style={{ color: colors.textDim, fontWeight: '600', fontSize: 13 }}>Apri in Google Maps</Text>
          </Pressable>

          {onDelete ? (
            <Pressable onPress={() => setConfirmDelete(true)} style={styles.deleteBtn}>
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Elimina posto</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  placeDot: { width: 14, height: 14, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  sub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 6, marginBottom: 8 },
  emptyLinked: { fontSize: 12.5, lineHeight: 18, marginBottom: 4 },
  linkedRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: RADIUS.sm, marginBottom: 8 },
  linkedMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 },
  detachBtn: { paddingHorizontal: 12, paddingVertical: 14 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  attachRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: RADIUS.sm, paddingVertical: 12, marginTop: 6,
  },
  mapsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: 12, marginTop: 10,
  },
  deleteBtn: { alignItems: 'center', paddingTop: 14, marginTop: 2 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 13.5, padding: 0 },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: RADIUS.sm, padding: 8, marginBottom: 8,
  },
  emptyPicker: { fontSize: 12.5, lineHeight: 18, paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center' },
  btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
});
