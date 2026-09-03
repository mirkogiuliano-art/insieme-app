import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Linking } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { LinkIcon, TrashIcon, PlayIcon } from '@/components/Icon';
import { dateLabel, platformInfo } from '@/lib/utils';
import { getLinkPreview } from '@/lib/api/linkPreviews';
import type { RawLink } from '@/lib/api/links';

/** Larghezza del riquadro della miniatura nelle card. */
const THUMB_W = 132;
/** L'immagine viene disegnata più larga del riquadro e ritagliata ai lati:
 * a parità di altezza della card questo dimezza le bande vuote sopra e
 * sotto. Con un'immagine 16:9 si perde circa il 20% della larghezza. */
const THUMB_ZOOM_W = Math.round(THUMB_W * 1.25);

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
  return item.platform === 'image' || item.platform === 'video';
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
 * Anteprima di una card: immagine e titolo veri della pagina.
 *
 * Una sola richiesta per card — titolo e immagine vengono dalla stessa
 * lettura. Definita fuori dal componente della schermata: dentro verrebbe
 * ricreata a ogni ridisegno, rimontando tutto e rifacendo le richieste.
 */
function useCardPreview(item: RawLink) {
  const [preview, setPreview] = useState<{ title: string | null; imageUrl: string | null } | null>(null);
  const uploaded = isUploadedFile(item);

  useEffect(() => {
    if (uploaded) return;
    let alive = true;
    getLinkPreview(item.url).then((p) => {
      if (alive && p) setPreview({ title: p.title, imageUrl: p.imageUrl });
    });
    return () => {
      alive = false;
    };
  }, [item.url, uploaded]);

  return {
    // Il titolo vero sostituisce solo quello generato in automatico:
    // quello scritto da una persona non si tocca mai.
    title: (hasAutoTitle(item) ? preview?.title : null) ?? item.title,
    image: preview?.imageUrl ?? item.thumb,
  };
}

/**
 * Card di un link.
 *
 * La miniatura sta a lato e mostra l'immagine **intera** (`contain`), non
 * ritagliata per riempire il riquadro: le immagini di anteprima sono
 * panoramiche e riempire un riquadro quasi quadrato significava buttarne
 * via i due terzi. Restano quindi due bande vuote sopra e sotto, con un
 * fondo diverso da quello della card così la miniatura si legge come
 * un'immagine e non come un buco.
 *
 * Il riquadro è largo abbastanza da rendere l'immagine leggibile senza far
 * crescere l'altezza della card, che era il difetto della versione con
 * l'immagine a fascia sopra al testo.
 */
export function LinkCard({
  item,
  catName,
  catColor,
  addedBy,
  onRemove,
  onPickPlace,
  children,
}: {
  item: RawLink;
  catName: string;
  catColor: string;
  addedBy: string;
  onRemove: () => void;
  onPickPlace: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { title, image } = useCardPreview(item);

  return (
    <Pressable
      onPress={() => Linking.openURL(item.url)}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: catColor }]}
    >
      {image ? (
        <View style={[styles.thumb, { backgroundColor: colors.surface2 }]}>
          <Image source={{ uri: image }} style={styles.thumbImage} resizeMode="contain" />
        </View>
      ) : item.platform === 'video' ? (
        <View style={[styles.thumbFallback, { backgroundColor: '#1B2530' }]}>
          <PlayIcon size={22} color="#fff" />
        </View>
      ) : (
        <View style={[styles.thumbFallback, { backgroundColor: colors.surface2 }]}>
          <LinkIcon size={26} color={catColor} strokeWidth={1.6} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={[styles.catLabel, { color: catColor }]}>{catName.toUpperCase()}</Text>
        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.cardMeta, { color: colors.textFaint }]}>
          {addedBy} · {item.label} · {dateLabel(item.ts)}
        </Text>
        {children}
      </View>
      <Pressable hitSlop={8} onPress={onRemove} style={styles.delBtn}>
        <TrashIcon size={16} color={colors.textFaint} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 11, borderWidth: 1, borderLeftWidth: 3, borderRadius: RADIUS.md, overflow: 'hidden', minHeight: 84 },
  cardBody: { flex: 1, paddingVertical: 10, justifyContent: 'center', gap: 3 },
  cardMeta: { fontSize: 10.5 },
  cardTitle: { fontSize: 13.5, fontWeight: '600', lineHeight: 17 },
  catLabel: { fontSize: 10, letterSpacing: 0.5, fontWeight: '700' },
  delBtn: { paddingHorizontal: 10, justifyContent: 'center' },
  thumb: { width: THUMB_W, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbFallback: { width: THUMB_W, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: THUMB_ZOOM_W, height: '100%' },
});
