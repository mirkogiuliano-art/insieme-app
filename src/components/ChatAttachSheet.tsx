import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { BottomSheet } from '@/components/BottomSheet';
import { PlaceTile } from '@/components/MapPin';
import { LinkThumbMini, useLinkPreview } from '@/components/LinkCard';
import { useTheme, RADIUS } from '@/theme/theme';
import { ImageIcon, FileIcon, MapIcon, LinkIcon, LocateIcon, BackIcon, SearchIcon, PollIcon } from '@/components/Icon';
import type { RawPin } from '@/lib/api/pins';
import type { RawLink } from '@/lib/api/links';
import { useT } from '@/i18n';

interface ChatAttachSheetProps {
  visible: boolean;
  onClose: () => void;
  pins: RawPin[];
  categoryFor: (pin: RawPin) => { name: string; color: string };
  links: RawLink[];
  /** Foto e video insieme: la galleria del telefono è una sola. */
  onMedia: () => void;
  onDocument: () => void;
  onPlace: (pin: RawPin) => void;
  onLink: (link: RawLink) => void;
  onMyPosition: () => Promise<void>;
  /** Apre "Nuovo sondaggio": la scheda la crea poi il server. */
  onPoll: () => void;
}

type Step = 'grid' | 'places' | 'links';

/** Un link salvato nell'elenco di scelta, col suo titolo vero. */
function LinkChoice({ link, first, onPress }: { link: RawLink; first: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const { title } = useLinkPreview(link);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.choice, !first && { borderTopWidth: 1, borderTopColor: colors.border }]}>
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
  onMedia,
  onDocument,
  onPlace,
  onLink,
  onMyPosition,
  onPoll,
}: ChatAttachSheetProps) {
  const { colors } = useTheme();
  const t = useT();
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
      <Pressable accessibilityRole="button" onPress={() => run(() => onPlace(pin))} style={[styles.choice, !first && { borderTopWidth: 1, borderTopColor: colors.border }]}>
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
          <Pressable accessibilityRole="button" accessibilityLabel={t.comune.indietro} onPress={() => setStep('grid')} hitSlop={10}>
            <BackIcon size={20} color={colors.textDim} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>{isPlaces ? t.allega.mandaPosto : t.allega.mandaLink}</Text>
        </View>
        <View style={[styles.search, { backgroundColor: colors.surface2 }]}>
          <SearchIcon size={15} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={isPlaces ? t.allega.cercaPosti : t.allega.cercaLink}
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>
        {empty ? (
          <Text style={[styles.empty, { color: colors.textDim }]}>
            {term ? t.allega.nessunRisultato : isPlaces ? t.allega.nessunPosto : t.allega.nessunLink}
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

  const Tile = ({
    icon,
    label,
    onPress,
    busy,
  }: {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    busy?: boolean;
  }) => (
    <Pressable accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      style={[styles.tile, { backgroundColor: colors.surface2 }]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.textDim} /> : icon}
      <Text style={[styles.tileText, { color: colors.textDim }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.text, marginBottom: 12 }]}>{t.allega.titolo}</Text>
      {/* Due righe da tre: sopra quello che viene dal telefono, sotto
          quello che il gruppo ha già. Foto e video sono una voce sola,
          perché la galleria è una; le voci del gruppo si riconoscono
          dall'icona colorata, non da un contorno. */}
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <Tile icon={<ImageIcon size={21} color={colors.textDim} />} label={t.allega.fotoEVideo} onPress={() => run(onMedia)} />
          <Tile icon={<FileIcon size={21} color={colors.textDim} />} label={t.allega.documento} onPress={() => run(onDocument)} />
          <Tile
            icon={<LocateIcon size={21} color={colors.textDim} />}
            label={t.allega.doveSono}
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
        <View style={styles.gridRow}>
          <Tile icon={<MapIcon size={21} color={colors.teal} />} label={t.allega.unPosto} onPress={() => setStep('places')} />
          <Tile icon={<LinkIcon size={21} color={colors.amberText} />} label={t.allega.unLink} onPress={() => setStep('links')} />
          <Tile icon={<PollIcon size={21} color={colors.lilac} />} label={t.allega.sondaggio} onPress={() => run(onPoll)} />
        </View>
      </View>
      {recentPins.length > 0 ? (
        <>
          <Text style={[styles.label, { color: colors.textFaint }]}>{t.allega.daiPosti}</Text>
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
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, height: 72, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
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
