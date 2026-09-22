import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Linking } from 'react-native';
import { useTheme } from '@/theme/theme';
import { LinkIcon, PlayIcon, StarIcon, FileIcon, MapIcon, MoreIcon } from '@/components/Icon';
import { platformInfo, fileKindFor } from '@/lib/utils';
import { fileBadgeColor } from '@/components/FileAttachmentBubble';
import { getLinkPreview } from '@/lib/api/linkPreviews';
import type { RawLink } from '@/lib/api/links';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** I file che carichiamo noi stanno nello storage: non sono pagine web e
 * non hanno metadati da leggere. */
function isUploadedFile(item: RawLink): boolean {
  return item.platform === 'image' || item.platform === 'video' || item.platform === 'file';
}

/**
 * Riconosce i titoli messi in automatico al salvataggio, per distinguerli
 * da quelli scritti da una persona.
 *
 * Quando non scrivi un titolo, `addLink` ripiega sul nome della
 * piattaforma ("YouTube") o sul dominio ("maps.app.goo.gl"). Sono proprio
 * quelli da sostituire col titolo vero dell'articolo o del video; tutto il
 * resto è testo scelto da qualcuno e resta intoccabile.
 */
function hasAutoTitle(item: RawLink): boolean {
  if (isUploadedFile(item)) return false;
  const info = platformInfo(item.url);
  return item.title === info.label || item.title === hostOf(item.url) || item.title === item.url;
}

/**
 * Anteprima di un link: immagine e titolo veri della pagina.
 *
 * Una sola richiesta per link — titolo e immagine vengono dalla stessa
 * lettura, ed è in cache: la stessa anteprima chiesta dalla scheda e dal
 * suo menu costa una volta sola.
 */
export function useLinkPreview(item: RawLink | null) {
  const [preview, setPreview] = useState<{ title: string | null; imageUrl: string | null } | null>(null);
  const url = item?.url ?? '';
  const uploaded = item ? isUploadedFile(item) : true;

  useEffect(() => {
    setPreview(null);
    if (!url || uploaded) return;
    let alive = true;
    getLinkPreview(url).then((p) => {
      if (alive && p) setPreview({ title: p.title, imageUrl: p.imageUrl });
    });
    return () => {
      alive = false;
    };
  }, [url, uploaded]);

  if (!item) return { title: '', image: null as string | null };
  return {
    // Il titolo vero sostituisce solo quello generato in automatico:
    // quello scritto da una persona non si tocca mai.
    title: (hasAutoTitle(item) ? preview?.title : null) ?? item.title,
    image: preview?.imageUrl ?? item.thumb,
  };
}

/** Colore e scritta del marchio di piattaforma sulla miniatura. Per i
 * siti qualunque il marchio è il dominio stesso: dice da dove viene. */
function badgeFor(item: RawLink): { text: string; bg: string } {
  switch (item.platform) {
    case 'youtube':
      return { text: 'YouTube', bg: '#E23B32' };
    case 'instagram':
      return { text: 'Instagram', bg: '#C8356E' };
    case 'tiktok':
      return { text: 'TikTok', bg: '#111111' };
    case 'vimeo':
      return { text: 'Vimeo', bg: '#1A9FD6' };
    case 'spotify':
      return { text: 'Spotify', bg: '#1C9E4B' };
    case 'twitter':
      return { text: 'X', bg: '#111111' };
    case 'image':
      return { text: 'Foto', bg: 'rgba(14,20,27,0.72)' };
    case 'video':
      return { text: 'Video', bg: 'rgba(14,20,27,0.72)' };
    case 'file':
      return { text: item.label, bg: 'rgba(14,20,27,0.72)' };
    default:
      return { text: item.label === 'Google Maps' ? 'Maps' : hostOf(item.url), bg: 'rgba(14,20,27,0.72)' };
  }
}

/** I posti della mappa collegati a un link, già risolti col loro colore. */
export interface LinkedPlace {
  id: string;
  name: string;
  color: string;
}

interface CardProps {
  item: RawLink;
  addedBy: string;
  places: LinkedPlace[];
  onOpenMenu: () => void;
  onShowPlace: (pinId: string) => void;
}

/**
 * La miniatura, riempita: l'immagine è ritagliata per coprire il riquadro
 * (come fanno YouTube e Instagram) invece che mostrata intera con le bande
 * vuote sopra e sotto. Il titolo accanto dice già di che cosa si tratta.
 */
function Thumb({
  item,
  image,
  compact,
  style,
}: {
  item: RawLink;
  image: string | null;
  compact?: boolean;
  style: object;
}) {
  const { colors } = useTheme();
  const badge = badgeFor(item);
  const fileColor = item.platform === 'file' ? fileBadgeColor(fileKindFor(item.title), colors) : colors.textDim;
  return (
    <View style={[style, { backgroundColor: colors.surface2 }]}>
      {image ? (
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : item.platform === 'video' ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: '#1B2530' }]}>
          <PlayIcon size={compact ? 18 : 26} color="#fff" />
        </View>
      ) : item.platform === 'file' ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <FileIcon size={compact ? 24 : 34} color={fileColor} strokeWidth={1.6} />
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <LinkIcon size={compact ? 22 : 30} color={colors.textFaint} strokeWidth={1.6} />
        </View>
      )}
      <View
        style={[
          styles.badge,
          compact ? styles.badgeCompact : null,
          { backgroundColor: item.platform === 'file' ? fileColor : badge.bg },
        ]}
      >
        <Text style={[styles.badgeText, compact && { fontSize: 8 }]} numberOfLines={1}>
          {compact && item.platform === 'youtube' ? '▶' : badge.text}
        </Text>
      </View>
      {/* La stella si vede solo quando è vera: su un link non preferito
          non c'è niente da dire. Si mette e si toglie dal menu. */}
      {item.isFavorite && !compact ? (
        <View style={styles.favBadge}>
          <StarIcon size={11} color="#E9A23B" filled />
        </View>
      ) : null}
    </View>
  );
}

/** Pastiglia del posto collegato: tocca e la mappa si apre su quello. */
function PlaceChip({ place, onPress }: { place: LinkedPlace; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        onPress();
      }}
      hitSlop={4}
      style={[styles.placeChip, { backgroundColor: place.color + '24' }]}
    >
      <MapIcon size={10} color={place.color} strokeWidth={2.2} />
      <Text style={[styles.placeChipText, { color: colors.text }]} numberOfLines={1}>
        {place.name}
      </Text>
    </Pressable>
  );
}

function MoreButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={(e) => {
        // Come per il link toccabile nel testo della chat: senza questo
        // il tocco proseguirebbe fino alla scheda e aprirebbe l'indirizzo.
        e.stopPropagation?.();
        onPress();
      }}
      hitSlop={10}
      style={styles.moreBtn}
    >
      <View style={{ transform: [{ rotate: '90deg' }] }}>
        <MoreIcon size={16} color={colors.textFaint} />
      </View>
    </Pressable>
  );
}

/**
 * Il link in forma di riga: miniatura quadrata, titolo, chi l'ha
 * condiviso, e il posto se ce n'è uno. Le azioni stanno nel menu — tenendo
 * premuto o col pulsante a destra, che serve anche sul web dove la
 * pressione lunga non arriva.
 */
export function LinkRow({ item, addedBy, places, onOpenMenu, onShowPlace }: CardProps) {
  const { colors } = useTheme();
  const { title, image } = useLinkPreview(item);
  return (
    <Pressable onPress={() => Linking.openURL(item.url)} onLongPress={onOpenMenu} style={styles.row}>
      <Thumb item={item} image={image} compact style={styles.rowThumb} />
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>
            {title}
          </Text>
          {item.isFavorite ? <StarIcon size={12} color={colors.amber} filled /> : null}
        </View>
        <Text style={[styles.meta, { color: colors.textFaint }]} numberOfLines={1}>
          <Text style={{ color: colors.textDim, fontWeight: '700' }}>{addedBy}</Text> · {item.label}
        </Text>
        {places.length > 0 ? (
          <View style={styles.places}>
            {places.map((p) => (
              <PlaceChip key={p.id} place={p} onPress={() => onShowPlace(p.id)} />
            ))}
          </View>
        ) : null}
      </View>
      <MoreButton onPress={onOpenMenu} />
    </Pressable>
  );
}

/**
 * Il link in forma di riquadro, per la griglia a due colonne: la
 * miniatura è protagonista, il titolo sta sotto su due righe.
 */
export function LinkTile({ item, addedBy, places, onOpenMenu, onShowPlace }: CardProps) {
  const { colors } = useTheme();
  const { title, image } = useLinkPreview(item);
  return (
    <Pressable onPress={() => Linking.openURL(item.url)} onLongPress={onOpenMenu} style={styles.tile}>
      <Thumb item={item} image={image} style={styles.tileThumb} />
      <Text style={[styles.tileTitle, { color: colors.text }]} numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.tileFoot}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.meta, { color: colors.textDim, fontWeight: '700' }]} numberOfLines={1}>
            {addedBy}
          </Text>
          {places[0] ? <PlaceChip place={places[0]} onPress={() => onShowPlace(places[0].id)} /> : null}
        </View>
        <MoreButton onPress={onOpenMenu} />
      </View>
    </Pressable>
  );
}

/** La miniatura piccola, per il menu del link. */
export function LinkThumbMini({ item }: { item: RawLink }) {
  const { image } = useLinkPreview(item);
  return <Thumb item={item} image={image} compact style={styles.miniThumb} />;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    left: 7,
    top: 7,
    maxWidth: '80%',
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 6,
    justifyContent: 'center',
  },
  badgeCompact: { left: 4, top: undefined, bottom: 4, height: 15, paddingHorizontal: 4, borderRadius: 5 },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  favBadge: {
    position: 'absolute',
    right: 7,
    top: 7,
    width: 22,
    height: 22,
    borderRadius: 8,
    backgroundColor: 'rgba(14,20,27,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    maxWidth: 170,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  placeChipText: { fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  places: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  moreBtn: { paddingHorizontal: 4, paddingVertical: 6 },
  meta: { fontSize: 11.5 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowThumb: { width: 68, height: 68, borderRadius: 14, overflow: 'hidden' },
  rowBody: { flex: 1, gap: 3 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 18 },

  tile: { flex: 1 },
  tileThumb: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, overflow: 'hidden' },
  tileTitle: { fontSize: 13, fontWeight: '700', lineHeight: 17, marginTop: 7 },
  tileFoot: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 3 },

  miniThumb: { width: 52, height: 40, borderRadius: 10, overflow: 'hidden' },
});
