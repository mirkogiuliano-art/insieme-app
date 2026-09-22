import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Share, ActivityIndicator } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';
import { StarIcon, MapIcon, ShareIcon, TrashIcon, BackIcon, CheckIcon, ChatIcon } from '@/components/Icon';
import { LinkThumbMini, useLinkPreview } from '@/components/LinkCard';
import type { RawLink } from '@/lib/api/links';
import type { RawLinkCategory } from '@/lib/api/linkCategories';

interface LinkActionsSheetProps {
  /** `null` tiene il foglio chiuso. */
  link: RawLink | null;
  categories: RawLinkCategory[];
  onClose: () => void;
  onToggleFavorite: (link: RawLink) => void;
  onPickPlace: (link: RawLink) => void;
  onMove: (link: RawLink, categoryId: string) => void;
  onDelete: (link: RawLink) => void;
  /** Manda il link nella chat del gruppo, con una riga di messaggio
   * facoltativa. `true` se l'invio è riuscito. */
  onSendToChat: (link: RawLink, note: string) => Promise<boolean>;
}

type Step = 'menu' | 'move' | 'delete' | 'chat';

/**
 * Tutto quello che si può fare su un link, in un posto solo. Sulle schede
 * non restano pulsanti: si apre tenendo premuto o col pulsante ⋯.
 */
export function LinkActionsSheet({
  link,
  categories,
  onClose,
  onToggleFavorite,
  onPickPlace,
  onMove,
  onDelete,
  onSendToChat,
}: LinkActionsSheetProps) {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('menu');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const { title } = useLinkPreview(link);

  // Ogni link si apre dal menu, mai da un passaggio rimasto a metà.
  useEffect(() => {
    setStep('menu');
    setNote('');
    setSending(false);
  }, [link?.id]);

  if (!link) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;

  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  const Item = ({
    icon,
    label,
    danger,
    onPress,
  }: {
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    onPress: () => void;
  }) => (
    <Pressable onPress={onPress} style={[styles.item, { borderTopColor: colors.border }]}>
      {icon}
      <Text style={[styles.itemText, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
    </Pressable>
  );

  const header = (
    <View style={styles.header}>
      <LinkThumbMini item={link} />
      <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  );

  if (step === 'move') {
    return (
      <BottomSheet visible onClose={onClose}>
        <View style={styles.stepTitleRow}>
          <Pressable onPress={() => setStep('menu')} hitSlop={10}>
            <BackIcon size={20} color={colors.textDim} />
          </Pressable>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Sposta in…</Text>
        </View>
        {categories.map((c) => {
          const current = c.id === link.categoryId;
          return (
            <Pressable
              key={c.id}
              onPress={() => (current ? setStep('menu') : run(() => onMove(link, c.id)))}
              style={[styles.item, { borderTopColor: colors.border }]}
            >
              <View style={[styles.dot, { backgroundColor: c.color }]} />
              <Text style={[styles.itemText, { color: colors.text }]}>{c.name}</Text>
              {current ? <CheckIcon size={16} color={colors.textDim} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    );
  }

  if (step === 'chat') {
    const send = async () => {
      if (sending) return;
      setSending(true);
      try {
        if (await onSendToChat(link, note)) onClose();
      } finally {
        setSending(false);
      }
    };
    return (
      <BottomSheet visible onClose={onClose}>
        <View style={styles.stepTitleRow}>
          <Pressable onPress={() => setStep('menu')} hitSlop={10}>
            <BackIcon size={20} color={colors.textDim} />
          </Pressable>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Manda in chat</Text>
        </View>
        <View style={[styles.chatPreview, { backgroundColor: colors.surface2 }]}>{header}</View>
        <TextInput
          style={[styles.noteInput, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
          placeholder="Aggiungi due righe (facoltativo) — es. «guardate questo!»"
          placeholderTextColor={colors.textFaint}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          autoFocus
        />
        <Pressable
          onPress={send}
          disabled={sending}
          style={[styles.sendBtn, { backgroundColor: colors.amber, opacity: sending ? 0.6 : 1 }]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.inkOnAmber} />
          ) : (
            <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 14 }}>Invia nella chat</Text>
          )}
        </Pressable>
      </BottomSheet>
    );
  }

  if (step === 'delete') {
    return (
      <BottomSheet visible onClose={onClose}>
        <Text style={[styles.stepTitle, { color: colors.text }]}>Eliminare questo link?</Text>
        <Text style={[styles.body, { color: colors.textDim }]}>
          Sparisce per tutti nel gruppo, insieme ai suoi collegamenti con i posti. Non si può annullare.
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={() => setStep('menu')} style={[styles.btn, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
          </Pressable>
          <Pressable onPress={() => run(() => onDelete(link))} style={[styles.btn, { backgroundColor: colors.danger }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Elimina</Text>
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible onClose={onClose}>
      {header}
      <Item
        icon={<StarIcon size={18} color={colors.amber} filled={link.isFavorite} />}
        label={link.isFavorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}
        onPress={() => run(() => onToggleFavorite(link))}
      />
      <Item
        icon={<ChatIcon size={18} color={colors.lilac} strokeWidth={2} />}
        label="Manda in chat"
        onPress={() => setStep('chat')}
      />
      <Item
        icon={<MapIcon size={18} color={colors.teal} strokeWidth={2} />}
        label="Collega a un posto"
        onPress={() => run(() => onPickPlace(link))}
      />
      {categories.length > 1 ? (
        <Item
          icon={<View style={[styles.dotBig, { borderColor: colors.textDim }]} />}
          label="Sposta in un’altra categoria"
          onPress={() => setStep('move')}
        />
      ) : null}
      <Item
        icon={<ShareIcon size={17} color={colors.textDim} />}
        label="Condividi fuori da Insieme"
        onPress={() => run(() => Share.share({ message: link.url }).catch(() => {}))}
      />
      <Item
        icon={<TrashIcon size={18} color={colors.danger} />}
        label="Elimina"
        danger
        onPress={() => setStep('delete')}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  headerTitle: { flex: 1, fontSize: 14.5, fontWeight: '800', lineHeight: 19 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, borderTopWidth: 1 },
  itemText: { flex: 1, fontSize: 15, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 4 },
  dotBig: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, marginHorizontal: 1 },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  stepTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  body: { fontSize: 12.5, lineHeight: 18, marginTop: 6, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chatPreview: { borderRadius: RADIUS.md, paddingHorizontal: 10, paddingTop: 10, marginBottom: 10 },
  noteInput: { borderRadius: RADIUS.sm, paddingHorizontal: 13, paddingVertical: 13, fontSize: 14, minHeight: 70, textAlignVertical: 'top' },
  sendBtn: { marginTop: 12, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
