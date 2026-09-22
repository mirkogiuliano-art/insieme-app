import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, SectionList, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '@/theme/theme';
import { FilterChip } from '@/components/FilterChip';
import { PlayIcon, FileIcon, MicIcon, LinkIcon } from '@/components/Icon';
import { fileBadgeColor } from '@/components/FileAttachmentBubble';
import { firstUrl, platformInfo, fileKindFor, formatSeconds } from '@/lib/utils';
import { parsePlaceMessage } from '@/lib/chatPlace';
import { getLinkPreview } from '@/lib/api/linkPreviews';
import type { RawMessage } from '@/lib/api/messages';

export type ArchiveKind = 'media' | 'link' | 'doc' | 'voice';

const FILTERS: { key: ArchiveKind | 'all'; label: string }[] = [
  { key: 'all', label: 'Tutto' },
  { key: 'media', label: 'Foto e video' },
  { key: 'link', label: 'Link' },
  { key: 'doc', label: 'Documenti' },
  { key: 'voice', label: 'Vocali' },
];

/** Che cosa c'è da archiviare in un messaggio, se c'è qualcosa. I posti
 * mandati in chat non contano come link: stanno già nella sezione Mappa. */
export function archiveKindOf(m: RawMessage): ArchiveKind | null {
  if (m.attachmentUrl && m.attachmentType) {
    if (m.attachmentType === 'image' || m.attachmentType === 'video') return 'media';
    if (m.attachmentType === 'file') return 'doc';
    if (m.attachmentType === 'audio') return 'voice';
  }
  if (m.text && firstUrl(m.text) && !parsePlaceMessage(m.text)) return 'link';
  return null;
}

/** Miniatura di un link: l'immagine della pagina, quando c'è. */
function LinkTileImage({ url }: { url: string }) {
  const { colors } = useTheme();
  const info = platformInfo(url);
  const [image, setImage] = useState<string | null>(info.thumb);
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getLinkPreview(url).then((p) => {
      if (!alive || !p) return;
      if (p.imageUrl) setImage(p.imageUrl);
      if (p.title) setTitle(p.title);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  if (image) return <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { padding: 8, gap: 5 }]}>
      <LinkIcon size={20} color={colors.textDim} />
      <Text style={[styles.tileText, { color: colors.textDim }]} numberOfLines={3}>
        {title ?? info.host}
      </Text>
    </View>
  );
}

function Tile({ message, onPress }: { message: RawMessage; onPress: () => void }) {
  const { colors } = useTheme();
  const kind = archiveKindOf(message)!;
  const url = message.text ? firstUrl(message.text) : null;
  return (
    <Pressable onPress={onPress} style={[styles.tile, { backgroundColor: colors.surface2 }]}>
      {kind === 'media' && message.attachmentType === 'image' ? (
        <Image source={{ uri: message.attachmentUrl! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : kind === 'media' ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: '#1B2530' }]}>
          <PlayIcon size={22} color="#fff" />
        </View>
      ) : kind === 'link' && url ? (
        <LinkTileImage url={url} />
      ) : kind === 'doc' ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { padding: 8, gap: 5 }]}>
          <FileIcon size={24} color={fileBadgeColor(fileKindFor(message.attachmentName ?? ''), colors)} strokeWidth={1.7} />
          <Text style={[styles.tileText, { color: colors.textDim }]} numberOfLines={2}>
            {message.attachmentName || 'Documento'}
          </Text>
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center, { gap: 5 }]}>
          <MicIcon size={22} color={colors.lilac} />
          <Text style={[styles.tileText, { color: colors.textDim }]}>
            {message.attachmentDurationSeconds != null ? formatSeconds(message.attachmentDurationSeconds) : 'Vocale'}
          </Text>
        </View>
      )}
      {kind === 'link' && url ? (
        <View style={[styles.badge, { backgroundColor: platformInfo(url).platform === 'youtube' ? '#E23B32' : 'rgba(14,20,27,0.72)' }]}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {platformInfo(url).platform === 'youtube' ? '▶' : platformInfo(url).host}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Tutto ciò che è passato in chat, in griglia: foto, video, link,
 * documenti, vocali. Toccando un riquadro si torna al messaggio.
 * Guarda i messaggi già caricati; arrivando in fondo ne carica di più
 * vecchi, come la chat.
 */
export function ChatArchive({
  messages,
  query,
  loadingOlder,
  onLoadOlder,
  onOpen,
}: {
  messages: RawMessage[];
  query: string;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onOpen: (messageId: string) => void;
}) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<ArchiveKind | 'all'>('all');
  const term = query.trim().toLowerCase();

  const items = messages.filter((m) => {
    const kind = archiveKindOf(m);
    if (!kind || (filter !== 'all' && kind !== filter)) return false;
    if (!term) return true;
    return (m.text ?? '').toLowerCase().includes(term) || (m.attachmentName ?? '').toLowerCase().includes(term);
  });

  // Una sezione per mese, dal più recente.
  const byMonth: { key: string; title: string; data: RawMessage[][] }[] = [];
  for (const m of items) {
    const d = new Date(m.ts);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let section = byMonth.find((s) => s.key === key);
    if (!section) {
      const title = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      section = { key, title: title.charAt(0).toUpperCase() + title.slice(1), data: [] };
      byMonth.push(section);
    }
    const rows = section.data;
    if (rows.length === 0 || rows[rows.length - 1].length === 3) rows.push([m]);
    else rows[rows.length - 1].push(m);
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {FILTERS.map((f) => (
            <FilterChip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      </View>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textFaint }]}>
            {term
              ? `Niente nell'archivio corrisponde a «${query.trim()}».`
              : 'Qui compaiono foto, video, link, documenti e vocali mandati in chat. Per ora non c’è niente.'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={byMonth}
          keyExtractor={(row) => row.map((m) => m.id).join('+')}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.content}
          onEndReached={onLoadOlder}
          onEndReachedThreshold={0.5}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.month, { color: colors.textFaint }]}>{section.title.toUpperCase()}</Text>
          )}
          renderItem={({ item: row }) => (
            <View style={styles.row}>
              {row.map((m) => (
                <Tile key={m.id} message={m} onPress={() => onOpen(m.id)} />
              ))}
              {Array.from({ length: 3 - row.length }).map((_, i) => (
                <View key={`vuoto-${i}`} style={styles.tileSpacer} />
              ))}
            </View>
          )}
          ListFooterComponent={
            loadingOlder ? (
              <View style={{ paddingVertical: 14 }}>
                <ActivityIndicator size="small" color={colors.textFaint} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { paddingBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 20 },
  month: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginTop: 10, marginBottom: 7 },
  row: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  tile: { flex: 1, aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  tileSpacer: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 10.5, fontWeight: '700', textAlign: 'center' },
  badge: { position: 'absolute', left: 5, top: 5, maxWidth: '85%', height: 16, paddingHorizontal: 5, borderRadius: 5, justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 8.5, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 260 },
});
