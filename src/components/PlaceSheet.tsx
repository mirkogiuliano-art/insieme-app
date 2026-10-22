import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Image, Linking } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { useTheme, RADIUS } from '@/theme/theme';
import { BottomSheet } from '@/components/BottomSheet';
import { PlusIcon, CloseIcon, SearchIcon, MapIcon, MoreIcon } from '@/components/Icon';
import { dateLabel, testoLeggibile } from '@/lib/utils';
import { PlaceTile } from '@/components/MapPin';
import { LinkThumbMini, LinkFallbackThumb, useLinkPreview } from '@/components/LinkCard';
import { openPinInMaps } from '@/lib/api/places';
import type { RawPin } from '@/lib/api/pins';
import type { RawLink } from '@/lib/api/links';
import { useT } from '@/i18n';

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
  /** Apre direttamente la scelta del link da collegare (dal menu del posto). */
  startPicking?: boolean;
  /** "1,2 km", quando si conosce la propria posizione. */
  distance?: string | null;
  /** Il menu del posto, lo stesso della pressione lunga: da qui si
   * raggiungono anche «Manda in chat», «Sposta» e «Condividi». */
  onMenu?: () => void;
}

/** Miniatura di un link: la foto se c'è, altrimenti lo stesso ripiego
 * della pagina Link (cartina per Maps, colore e icona per il resto). */
function LinkThumb({ link, size }: { link: RawLink; size: number }) {
  if (link.thumb) return <Image source={{ uri: link.thumb }} style={{ width: size, height: size, borderRadius: 8 }} />;
  return (
    <View style={[styles.thumbFallback, { width: size, height: size }]}>
      <LinkFallbackThumb source={link} iconSize={size * 0.55} />
    </View>
  );
}

/** Un link collegato al posto: le stesse righe della pagina Link, con la
 * × per scollegarlo (il link resta, si toglie solo il collegamento). */
function LinkedRow({ link, first, onDetach }: { link: RawLink; first: boolean; onDetach: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const { title } = useLinkPreview(link);
  return (
    <View style={[styles.linkedRow, !first && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <Pressable accessibilityRole="button" onPress={() => Linking.openURL(link.url)} style={styles.linkedMain}>
        <LinkThumbMini item={link} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.text }} numberOfLines={2}>
            {title}
          </Text>
          <Text style={{ fontSize: 11, color: colors.textFaint, marginTop: 2 }}>{link.label}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.scollega} hitSlop={8} onPress={onDetach} style={styles.detachBtn}>
        <CloseIcon size={13} color={colors.textFaint} />
      </Pressable>
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
  startPicking = false,
  distance,
  onMenu,
}: PlaceSheetProps) {
  const { colors } = useTheme();
  const t = useT();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Ogni volta che si apre un posto diverso il foglio riparte dal dettaglio.
  useEffect(() => {
    setPicking(startPicking);
    setQuery('');
    setConfirmDelete(false);
  }, [pin?.id, startPicking]);

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
          <Text style={[styles.title, { color: colors.text }]}>{t.posto.collegaLink}</Text>
          <Text style={[styles.sub, { color: colors.textDim }]}>{t.posto.collegaA(pin.name)}</Text>
          <View style={[styles.searchRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <SearchIcon size={15} color={colors.textFaint} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t.posto.cercaLink}
              placeholderTextColor={colors.textFaint}
              value={query}
              onChangeText={setQuery}
            />
          </View>
          {attachable.length === 0 ? (
            <Text style={[styles.emptyPicker, { color: colors.textFaint }]}>
              {allLinks.length === 0 ? t.posto.nessunLinkSalvato : term ? t.posto.nessunLinkTrovato : t.posto.tuttiCollegati}
            </Text>
          ) : (
            attachable.map((l) => (
              <Pressable accessibilityRole="button"
                key={l.id}
                onPress={() => {
                  onAttach(l.id);
                  setPicking(false);
                  setQuery('');
                }}
                style={[styles.pickRow, { borderColor: colors.border }]}
              >
                <LinkThumb link={l} size={38} />
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
          <Pressable accessibilityRole="button" onPress={() => setPicking(false)} style={[styles.backBtn, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>{t.comune.indietro}</Text>
          </Pressable>
        </>
      ) : confirmDelete ? (
        <>
          <Text style={[styles.confirmTitle, { color: colors.text }]}>{t.posto.eliminare(pin.name)}</Text>
          <Text style={[styles.sub, { color: colors.textDim }]}>
            {linked.length > 0 ? t.posto.eliminaConLink(linked.length) : t.posto.eliminaSemplice}
          </Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(false)} style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}>
              <Text style={{ color: colors.textDim, fontWeight: '600' }}>{t.comune.annulla}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onDelete} style={[styles.btnPrimary, { backgroundColor: colors.danger }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{t.comune.elimina}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={styles.hero}>
            <PlaceTile color={categoryColor} categoryName={categoryName} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.catLabel, { color: testoLeggibile(categoryColor, colors.surface) }]}>{categoryName.toUpperCase()}</Text>
              <Text style={[styles.heroName, { color: colors.text }]}>{pin.name}</Text>
              {distance ? <Text style={[styles.heroSub, { color: colors.textDim }]}>{t.mappa.daTe(distance)}</Text> : null}
            </View>
            {onMenu ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.accessibilita.altreAzioni}
                onPress={onMenu}
                hitSlop={8}
                style={[styles.menuBtn, { backgroundColor: colors.surface2 }]}
              >
                <MoreIcon size={18} color={colors.textDim} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.heroActions}>
            {onShowOnMap ? (
              <Pressable accessibilityRole="button" onPress={onShowOnMap} style={[styles.heroBtn, { backgroundColor: colors.surface2 }]}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13.5 }}>{t.posto.sullaMappa}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => void openPinInMaps(pin)} style={[styles.heroBtn, { flex: 1.4, backgroundColor: colors.amber }]}>
              <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 13.5 }}>{t.posto.portamiLi}</Text>
            </Pressable>
          </View>

          <View style={styles.sectionRow}>
            <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>{t.posto.linkCollegati}</Text>
            {linked.length > 0 ? <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>{linked.length}</Text> : null}
          </View>
          {linked.length === 0 ? (
            <Text style={[styles.emptyLinked, { color: colors.textFaint }]}>
              {t.posto.nessunCollegato}
            </Text>
          ) : (
            linked.map((l, i) => (
              <LinkedRow key={l.id} link={l} first={i === 0} onDetach={() => onDetach(l.id)} />
            ))
          )}

          <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={[styles.attachRow, { borderColor: colors.border }]}>
            <PlusIcon size={13} color={colors.textDim} />
            <Text style={{ color: colors.textDim, fontWeight: '700', fontSize: 13 }}>{t.posto.collegaLink}</Text>
          </Pressable>

          <Text style={[styles.footer, { color: colors.textFaint }]}>
            {t.posto.aggiuntoDa} <Text style={{ color: colors.textDim, fontWeight: '700' }}>{authorName}</Text> · {dateLabel(pin.ts)}
          </Text>

          {onDelete ? (
            <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={styles.deleteBtn}>
              <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '600' }}>{t.posto.eliminaPosto}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  catLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7 },
  heroName: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3, lineHeight: 23, marginTop: 1 },
  heroSub: { fontSize: 12, marginTop: 2 },
  heroActions: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 4 },
  heroBtn: { flex: 1, height: 44, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 4 },
  footer: { fontSize: 11.5, textAlign: 'center', marginTop: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  placeDot: { width: 14, height: 14, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 2 },
  confirmTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2, marginBottom: 2 },
  sub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  sectionLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  emptyLinked: { fontSize: 12.5, lineHeight: 18, marginBottom: 4 },
  linkedRow: { flexDirection: 'row', alignItems: 'center' },
  linkedMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  detachBtn: { paddingHorizontal: 12, paddingVertical: 14 },
  thumbFallback: { borderRadius: 8, overflow: 'hidden' },
  attachRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: RADIUS.sm, paddingVertical: 11, marginTop: 8,
  },
  mapsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: 12, marginTop: 10,
  },
  deleteBtn: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
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
  btnSecondary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  backBtn: { marginTop: 14, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
