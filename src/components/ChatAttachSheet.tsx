import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { PlaceTile } from '@/components/MapPin';
import { LinkThumbMini, useLinkPreview } from '@/components/LinkCard';
import { useTheme, RADIUS } from '@/theme/theme';
import { ImageIcon, PlayIcon, FileIcon, MapIcon, LinkIcon, LocateIcon, BackIcon, SearchIcon } from '@/components/Icon';
import type { RawPin } from '@/lib/api/pins';
import type { RawLink } from '@/lib/api/links';

interface ChatAttachSheetProps {
  visible: boolean;
  onClose: () => void;
  pins: RawPin[];
  categoryFor: (pin: RawPin) => { name: string; color: string };
  links: RawLink[];
  onPhoto: () => void;
  onVideo: () => void;
  onDocument: () => void;
  onPlace: (pin: RawPin) => void;
  onLink: (link: RawLink) => void;
  onMyPosition: () => Promise<void>;
}

type Step = 'grid' | 'places' | 'links';

/** Un link salvato nell'elenco di scelta, col suo titolo vero. */
function LinkChoice({ link, first, onPress }: { link: RawLink; first: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const { title } = useLinkPreview(link);
  return (
    <Pressable onPress={onPress} style={[styles.choice, !first && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <LinkThumbMini item={link} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.choiceName, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.choiceSub, { color: colors.textFaint }]} numberOfLines={1}>
          {link.label}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Il "+" della chat. Oltre a foto, video e documenti manda un posto o un
 * link già salvati nel gruppo, e la propria posizione: chat, link e mappa
 * si passano le cose invece di vivere ognuna per conto suo.
 */
export function ChatAttachSheet({
  visible,
  onClose,
  pins,
  categoryFor,
  links,
  onPhoto,
  onVideo,
  onDocument,
  onPlace,
  onLink,
  onMyPosition,
}: ChatAttachSheetProps) {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('grid');
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep('grid');
      setQuery('');
    }
  }, [visible]);

  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  const term = query.trim().toLowerCase();
  const recentPins = [...pins].sort((a, b) => b.ts - a.ts);

  const PinChoice = ({ pin, first }: { pin: RawPin; first: boolean }) => {
    const cat = categoryFor(pin);
    return (
      <Pressable onPress={() => run(() => onPlace(pin))} style={[styles.choice, !first && { borderTopWidth: 1, borderTopColor: colors.border }]}>
        <PlaceTile color={cat.color} categoryName={cat.name} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.choiceName, { color: colors.text }]} numberOfLines={1}>
            {pin.name}
          </Text>
          <Text style={[styles.choiceSub, { color: colors.textFaint }]} numberOfLines={1}>
            {cat.name}
          </Text>
        </View>
      </Pressable>
    );
  };

  if (step !== 'grid') {
    const isPlaces = step === 'places';
    const pinList = recentPins.filter((p) => !term || p.name.toLowerCase().includes(term));
    const linkList = links.filter((l) => !term || l.title.toLowerCase().includes(term) || l.url.toLowerCase().includes(term));
    const empty = isPlaces ? pinList.length === 0 : linkList.length === 0;
    return (
      <BottomSheet visible={visible} onClose={onClose}>
        <View style={styles.titleRow}>
          <Pressable onPress={() => setStep('grid')} hitSlop={10}>
            <BackIcon size={20} color={colors.textDim} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>{isPlaces ? 'Manda un posto' : 'Manda un link'}</Text>
        </View>
        <View style={[styles.search, { backgroundColor: colors.surface2 }]}>
          <SearchIcon size={15} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={isPlaces ? 'Cerca fra i posti del gruppo' : 'Cerca fra i link del gruppo'}
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>
        {empty ? (
          <Text style={[styles.empty, { color: colors.textDim }]}>
            {term
              ? 'Nessun risultato.'
              : isPlaces
                ? 'Il gruppo non ha ancora posti salvati: aggiungili dalla sezione Mappa.'
                : 'Il gruppo non ha ancora link salvati: aggiungili dalla sezione Link.'}
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            <View style={[styles.list, { backgroundColor: colors.surface2 }]}>
              {isPlaces
                ? pinList.map((p, i) => <PinChoice key={p.id} pin={p} first={i === 0} />)
                : linkList.map((l, i) => <LinkChoice key={l.id} link={l} first={i === 0} onPress={() => run(() => onLink(l))} />)}
            </View>
          </ScrollView>
        )}
      </BottomSheet>
    );
  }

  const Tile = ({ icon, label, highlight, onPress, busy }: { icon: React.ReactNode; label: string; highlight?: boolean; onPress: () => void; busy?: boolean }) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.tile, { backgroundColor: colors.surface2, borderColor: highlight ? colors.amber + '88' : 'transparent' }]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.textDim} /> : icon}
      <Text style={[styles.tileText, { color: colors.textDim }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.text, marginBottom: 12 }]}>Manda nella chat</Text>
      <View style={styles.grid}>
        <Tile icon={<ImageIcon size={21} color={colors.textDim} />} label="Foto" onPress={() => run(onPhoto)} />
        <Tile icon={<PlayIcon size={19} color={colors.textDim} />} label="Video" onPress={() => run(onVideo)} />
        <Tile icon={<FileIcon size={21} color={colors.textDim} />} label="Documento" onPress={() => run(onDocument)} />
        <Tile icon={<MapIcon size={21} color={colors.teal} />} label="Un posto" highlight onPress={() => setStep('places')} />
        <Tile icon={<LinkIcon size={21} color={colors.amber} />} label="Un link" highlight onPress={() => setStep('links')} />
        <Tile
          icon={<LocateIcon size={21} color={colors.textDim} />}
          label="Dove sono"
          busy={locating}
          onPress={async () => {
            setLocating(true);
            try {
              await onMyPosition();
            } finally {
              setLocating(false);
            }
          }}
        />
      </View>
      {recentPins.length > 0 ? (
        <>
          <Text style={[styles.label, { color: colors.textFaint }]}>DAI POSTI DEL GRUPPO</Text>
          <View style={[styles.list, { backgroundColor: colors.surface2 }]}>
            {recentPins.slice(0, 3).map((p, i) => (
              <PinChoice key={p.id} pin={p} first={i === 0} />
            ))}
          </View>
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.5%', height: 68, borderRadius: RADIUS.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tileText: { fontSize: 11.5, fontWeight: '700' },
  label: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  list: { borderRadius: RADIUS.md, overflow: 'hidden' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10 },
  choiceName: { fontSize: 14, fontWeight: '700' },
  choiceSub: { fontSize: 11.5, marginTop: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: RADIUS.sm, paddingHorizontal: 12, height: 42, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  empty: { fontSize: 12.5, lineHeight: 18, paddingVertical: 8 },
});
