import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Linking } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { PlayIcon } from '@/components/Icon';
import { LinkFallbackThumb } from '@/components/LinkCard';
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

/** Stessi marchi delle schede della pagina Link. */
const BADGES: Record<string, { text: string; bg: string }> = {
  youtube: { text: 'YouTube', bg: '#E23B32' },
  instagram: { text: 'Instagram', bg: '#C8356E' },
  tiktok: { text: 'TikTok', bg: '#111111' },
  vimeo: { text: 'Vimeo', bg: '#1A9FD6' },
  spotify: { text: 'Spotify', bg: '#1C9E4B' },
  twitter: { text: 'X', bg: '#111111' },
};

/**
 * La scheda di un link mandato in chat: la stessa faccia che ha nella
 * pagina Link — immagine piena col marchio della piattaforma, titolo vero,
 * sito — invece di un riquadro scuro dentro il fumetto ambra. Sta sotto al
 * fumetto, non dentro, e ha sempre il colore delle schede.
 *
 * Parte da ciò che si deduce dall'indirizzo e si arricchisce quando
 * arrivano titolo e immagine veri (Edge Function `link-preview`, in cache).
 */
export function ChatLinkPreview({ url, onMenu }: { url: string; own?: boolean; onMenu?: () => void }) {
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

  const image = meta?.imageUrl ?? info.thumb;
  const title = meta?.title ?? info.label;
  const site = meta?.siteName ?? host;
  const badge = BADGES[info.platform] ?? { text: host, bg: 'rgba(14,20,27,0.72)' };
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [image]);

  return (
    <Pressable
      onPress={(e) => {
        // Senza questo il tocco arriverebbe anche al fumetto e aprirebbe il menu.
        e.stopPropagation?.();
        Linking.openURL(url);
      }}
      onLongPress={onMenu}
      style={[styles.card, { backgroundColor: colors.surface }]}
    >
      {/* Senza immagine, la stessa miniatura di ripiego della pagina Link:
          cartina per Maps, colore e icona per il resto. */}
      {image && !broken ? (
        <View style={styles.imageBox}>
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setBroken(true)} />
          {VIDEO_PLATFORMS.has(info.platform) ? (
            <View style={styles.play}>
              <PlayIcon size={24} color="#fff" />
            </View>
          ) : null}
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {badge.text}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.imageBox, styles.fallbackBox]}>
          <LinkFallbackThumb source={{ url }} iconSize={34} />
        </View>
      )}
      <View style={styles.body}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.site, { color: colors.textFaint }]} numberOfLines={1}>
            {site}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, borderRadius: 18, overflow: 'hidden' },
  imageBox: { width: 240, height: 128 },
  // Il ripiego non ha niente da ritagliare: basta una fascia più bassa.
  fallbackBox: { height: 96, overflow: 'hidden' },
  play: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' },
  badge: { position: 'absolute', left: 8, top: 8, maxWidth: '75%', height: 18, paddingHorizontal: 6, borderRadius: 6, justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  body: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, paddingVertical: 9 },
  title: { fontSize: 13, fontWeight: '800', lineHeight: 17 },
  site: { fontSize: 11, marginTop: 2 },
});
