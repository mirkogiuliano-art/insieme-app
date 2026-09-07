import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Linking } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { LinkIcon, TrashIcon, PlayIcon, StarIcon, FileIcon } from '@/components/Icon';
import { dateLabel, platformInfo, fileKindFor } from '@/lib/utils';
import { fileBadgeColor } from '@/components/FileAttachmentBubble';
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
  onToggleFavorite,
  onPickPlace,
  children,
}: {
  item: RawLink;
  catName: string;
  catColor: string;
  addedBy: string;
  onRemove: () => void;
  onToggleFavorite: () => void;
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
        <View style={[styles.thumb, { backgroundColor: '#1B2530' }]}>
          <PlayIcon size={22} color="#fff" />
        </View>
      ) : item.platform === 'file' ? (
        <View style={[styles.thumb, { backgroundColor: colors.surface2 }]}>
          <FileIcon size={28} color={fileBadgeColor(fileKindFor(item.title), colors)} strokeWidth={1.6} />
          <Text style={[styles.thumbFileLabel, { color: fileBadgeColor(fileKindFor(item.title), colors) }]}>{item.label}</Text>
        </View>
      ) : (
        <View style={[styles.thumb, { backgroundColor: colors.surface2 }]}>
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
      <View style={styles.actions}>
        <Pressable
          hitSlop={8}
          onPress={(e) => {
            // Come per il link toccabile nel testo della chat: senza questo
            // il tocco proseguirebbe fino alla card e aprirebbe l'indirizzo.
            e.stopPropagation?.();
            onToggleFavorite();
          }}
          style={styles.actionBtn}
        >
          <StarIcon size={16} color={item.isFavorite ? colors.amber : colors.textFaint} filled={item.isFavorite} />
        </Pressable>
        <Pressable hitSlop={8} onPress={onRemove} style={styles.actionBtn}>
          <TrashIcon size={16} color={colors.textFaint} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `thumb` è posizionato in assoluto invece di usare `alignSelf: 'stretch'`
  // per riempire l'altezza della card: uno `stretch` senza un'altezza
  // dichiarata lascia ambigua l'altezza del contenitore, e l'immagine al
  // suo interno (che usa `height: '100%'`) può risolvere quel 100% contro
  // il primo antenato con un'altezza vera — nei casi peggiori l'intera
  // schermata. Con `top/left/bottom` l'altezza di `thumb` è sempre quella
  // reale della card, senza ambiguità, su web e su nativo.
  // Il `gap` qui vale solo fra i figli nel flusso normale (cardBody,
  // delBtn): `thumb` è in posizione assoluta e ne resta fuori, per questo
  // il suo spazio da cardBody è nel `paddingLeft` di cardBody, non qui.
  card: { flexDirection: 'row', gap: 11, borderWidth: 1, borderLeftWidth: 3, borderRadius: RADIUS.md, overflow: 'hidden', minHeight: 84 },
  cardBody: { flex: 1, paddingVertical: 10, paddingLeft: THUMB_W + 11, justifyContent: 'center', gap: 3 },
  cardMeta: { fontSize: 10.5 },
  cardTitle: { fontSize: 13.5, fontWeight: '600', lineHeight: 17 },
  catLabel: { fontSize: 10, letterSpacing: 0.5, fontWeight: '700' },
  actions: { justifyContent: 'center', gap: 2, paddingHorizontal: 8 },
  actionBtn: { paddingVertical: 7, alignItems: 'center' },
  thumb: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: THUMB_W,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: THUMB_ZOOM_W, height: '100%' },
  thumbFileLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, marginTop: 3 },
});
