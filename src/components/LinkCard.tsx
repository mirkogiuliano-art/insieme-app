import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Linking } from 'react-native';
import { useTheme } from '@/theme/theme';
import Svg, { Rect, Path } from 'react-native-svg';
import { PlayIcon, StarIcon, FileIcon, MapIcon, MoreIcon, ImageIcon, GlobeIcon } from '@/components/Icon';
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

/** Quello che serve per scegliere il ripiego: basta l'indirizzo, e la
 * piattaforma quando la si conosce già (i file caricati non la deducono
 * dall'indirizzo). Vale per i link salvati come per quelli in chat. */
export interface FallbackSource {
  url: string;
  platform?: string;
  label?: string;
}

/** I link di Google Maps: un posto, non una pagina da leggere. */
function isMapsLink(src: FallbackSource): boolean {
  return src.label === 'Google Maps' || /maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|google\.[a-z.]+\/maps/i.test(src.url);
}

type FallbackKind = 'maps' | 'social' | 'image' | 'file' | 'web';

function fallbackKind(src: FallbackSource): FallbackKind {
  if (isMapsLink(src)) return 'maps';
  const platform = src.platform ?? platformInfo(src.url).platform;
  if (platform === 'image') return 'image';
  if (platform === 'file') return 'file';
  if (platform === 'web') return 'web';
  // YouTube, Instagram, TikTok, Vimeo, Spotify, X e i video caricati.
  return 'social';
}

/** Un colore per tipo di link, dalla tavolozza dei gruppi: fisso, così
 * lo stesso tipo si riconosce a colpo d'occhio in tutta la lista. */
const FALLBACK_COLOR: Record<Exclude<FallbackKind, 'maps'>, string> = {
  social: '#D9555C',
  image: '#8C7CE0',
  file: '#D9932E',
  web: '#5FA8DE',
};

/**
 * Una cartina disegnata, per i link di Maps senza immagine: strade, un
 * po' d'acqua e lo spillo al centro. Dice "è un posto" prima ancora del
 * titolo, e non costa nessuna richiesta di rete.
 */
function MiniMap({ size, dark }: { size: number; dark: boolean }) {
  const road = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.95)';
  return (
    <>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <Rect width="100" height="100" fill={dark ? '#1D3A36' : '#D5E8E2'} />
        <Path d="M-5 78 C 25 70, 40 92, 105 70 L105 105 L-5 105z" fill={dark ? '#1A4E5E' : '#BFDDEA'} />
        <Path d="M-5 30 L105 52 M30 -5 L48 105 M70 -5 C 62 30, 80 60, 72 105 M-5 60 L60 40" stroke={road} strokeWidth={5} fill="none" />
        <Path d="M-5 12 L105 20 M12 -5 L6 105" stroke={road} strokeWidth={2.5} fill="none" />
      </Svg>
      {/* Anche lo spillo in assoluto, e dopo la cartina: un elemento nel
          flusso finirebbe dipinto sotto di lei. */}
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 22s-7-6.3-7-12a7 7 0 0114 0c0 5.7-7 12-7 12z" fill="#E4707A" stroke="#fff" strokeWidth={1.6} />
          <Path d="M12 7.4a2.6 2.6 0 110 5.2 2.6 2.6 0 010-5.2z" fill="#fff" />
        </Svg>
      </View>
    </>
  );
}

/**
 * Il ripiego quando un link non ha immagine: colore e icona dicono che
 * tipo di cosa è (una pagina, un video o un reel, una foto, un documento),
 * e i link di Maps diventano una piccola cartina.
 *
 * Riempie il riquadro che lo contiene, che deve avere `overflow: hidden`
 * e gli angoli suoi. È lo stesso ovunque compaia un link — pagina Link,
 * chat, archivio, posti, condivisione — così un link ha una faccia sola.
 */
export function LinkFallbackThumb({ source, iconSize }: { source: FallbackSource; iconSize: number }) {
  const { theme } = useTheme();
  const kind = fallbackKind(source);
  const size = iconSize;
  if (kind === 'maps') {
    return (
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <MiniMap size={size} dark={theme !== 'light'} />
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: FALLBACK_COLOR[kind] }]}>
      {kind === 'social' ? (
        <PlayIcon size={size * 0.8} color="#fff" />
      ) : kind === 'image' ? (
        <ImageIcon size={size} color="#fff" strokeWidth={1.9} />
      ) : kind === 'file' ? (
        <FileIcon size={size} color="#fff" strokeWidth={1.9} />
      ) : (
        <GlobeIcon size={size} color="#fff" strokeWidth={1.9} />
      )}
    </View>
  );
}

/**
 * La miniatura, riempita: l'immagine è ritagliata per coprire il riquadro
 * (come fanno YouTube e Instagram) invece che mostrata intera con le bande
 * vuote sopra e sotto. Il titolo accanto dice già di che cosa si tratta.
 *
 * Il marchio della piattaforma si mette solo sopra un'immagine vera: senza,
 * sono già colore e icona del ripiego a dire di che tipo è il link.
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
  // Un'immagine che non si carica (file sparito, sito che la nega) vale
  // quanto nessuna immagine: meglio il ripiego di un riquadro vuoto.
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [image]);
  return (
    <View style={[style, { backgroundColor: colors.surface2 }]}>
      {image && !broken ? (
        <>
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setBroken(true)} />
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
        </>
      ) : (
        <LinkFallbackThumb source={item} iconSize={compact ? 24 : 34} />
      )}
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
