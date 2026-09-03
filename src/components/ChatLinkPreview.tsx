import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Linking } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { PlayIcon, LinkIcon } from '@/components/Icon';
import { platformInfo } from '@/lib/utils';
import { getLinkPreview, type LinkPreview as LinkPreviewData } from '@/lib/api/linkPreviews';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const VIDEO_PLATFORMS = new Set(['youtube', 'vimeo', 'video']);

/**
 * Scheda di anteprima sotto al testo di un messaggio che contiene un link.
 *
 * Parte subito da ciò che si deduce dall'indirizzo (`platformInfo`:
 * piattaforma, dominio, miniatura YouTube) e si arricchisce quando
 * arrivano titolo, descrizione e immagine veri dai tag Open Graph della
 * pagina — letti dalla Edge Function `link-preview` e tenuti in cache
 * condivisa. Se la pagina non è raggiungibile o non espone metadati resta
 * la versione essenziale: l'anteprima è un miglioramento, non un requisito.
 */
export function ChatLinkPreview({ url, own }: { url: string; own: boolean }) {
  const { colors } = useTheme();
  const info = platformInfo(url);
  const host = hostOf(url);
  const [meta, setMeta] = useState<LinkPreviewData | null>(null);

  useEffect(() => {
    let alive = true;
    getLinkPreview(url).then((p) => {
      if (alive && p?.ok) setMeta(p);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  const bg = own ? 'rgba(0,0,0,0.10)' : colors.surface2;
  const bd = own ? '#6B5730' : colors.border;
  const strong = own ? colors.inkOnAmber : colors.text;
  const faint = own ? '#6B5730' : colors.textFaint;

  const image = meta?.imageUrl ?? info.thumb;
  const title = meta?.title ?? info.label;
  const subtitle = meta?.siteName ?? host;
  const isVideo = VIDEO_PLATFORMS.has(info.platform);

  return (
    <Pressable
      onPress={(e) => {
        // Senza questo il tocco arriva anche al fumetto e aprirebbe le reazioni.
        e.stopPropagation?.();
        Linking.openURL(url);
      }}
      style={[styles.linkPreview, { backgroundColor: bg, borderColor: bd }]}
    >
      {image ? (
        <View>
          <Image source={{ uri: image }} style={styles.linkPreviewImage} />
          {isVideo ? (
            <View style={styles.linkPreviewPlay}>
              <PlayIcon size={26} color="#fff" />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.linkPreviewBody}>
        {!image ? (
          <View style={[styles.linkPreviewIcon, { borderColor: bd }]}>
            <LinkIcon size={17} color={faint} strokeWidth={1.7} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.linkPreviewLabel, { color: strong }]} numberOfLines={2}>
            {title}
          </Text>
          {meta?.description ? (
            <Text style={[styles.linkPreviewDesc, { color: faint }]} numberOfLines={2}>
              {meta.description}
            </Text>
          ) : null}
          <Text style={[styles.linkPreviewHost, { color: faint }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Non è la forma d'onda reale dell'audio (richiederebbe analizzare i
 * campioni al momento della registrazione e salvarli) — è un pattern di
 * barre pseudo-casuale ma stabile (stesso URI → sempre le stesse barre),
 * solo per dare il colpo d'occhio "messaggio vocale" come nelle altre app
 * di chat. */

const styles = StyleSheet.create({
  linkPreviewPlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  linkPreview: { borderWidth: 1, borderRadius: RADIUS.sm, overflow: 'hidden', marginTop: 7, maxWidth: 240 },
  linkPreviewImage: { width: 240, height: 135 },
  linkPreviewBody: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 9, paddingVertical: 8 },
  linkPreviewIcon: { width: 34, height: 34, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  linkPreviewLabel: { fontSize: 12.5, fontWeight: '700', lineHeight: 16 },
  linkPreviewDesc: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  linkPreviewHost: { fontSize: 10.5, marginTop: 3 },
});
