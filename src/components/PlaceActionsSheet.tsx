import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Share, ActivityIndicator } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { PlaceTile } from '@/components/MapPin';
import { useTheme, RADIUS } from '@/theme/theme';
import { MapIcon, ShareIcon, TrashIcon, BackIcon, CheckIcon, ChatIcon, LinkIcon, SendIcon } from '@/components/Icon';
import { mapsUrlForPlace } from '@/lib/utils';
import type { RawPin } from '@/lib/api/pins';
import type { RawPlaceCategory } from '@/lib/api/placeCategories';

interface PlaceActionsSheetProps {
  /** `null` tiene il foglio chiuso. */
  pin: RawPin | null;
  categories: RawPlaceCategory[];
  categoryFor: (pin: RawPin) => { name: string; color: string };
  addedBy: string;
  onClose: () => void;
  onNavigate: (pin: RawPin) => void;
  /** Assente dove non c'è una mappa su cui centrare (web). */
  onShowOnMap?: (pin: RawPin) => void;
  onLinkLinks: (pin: RawPin) => void;
  onMove: (pin: RawPin, categoryId: string) => void;
  onDelete: (pin: RawPin) => void;
  onSendToChat: (pin: RawPin, note: string) => Promise<boolean>;
}

type Step = 'menu' | 'move' | 'delete' | 'chat';

/**
 * Tutto quello che si può fare su un posto, in un posto solo: lo stesso
 * menu dei link, con in più "Portami lì" e "Mostra sulla mappa".
 */
export function PlaceActionsSheet({
  pin,
  categories,
  categoryFor,
  addedBy,
  onClose,
  onNavigate,
  onShowOnMap,
  onLinkLinks,
  onMove,
  onDelete,
  onSendToChat,
}: PlaceActionsSheetProps) {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('menu');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setStep('menu');
    setNote('');
    setSending(false);
  }, [pin?.id]);

  if (!pin) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  const cat = categoryFor(pin);

  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  const Item = ({ icon, label, danger, onPress }: { icon: React.ReactNode; label: string; danger?: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.item, { borderTopColor: colors.border }]}>
      {icon}
      <Text style={[styles.itemText, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
    </Pressable>
  );

  const header = (
    <View style={styles.header}>
      <PlaceTile color={cat.color} categoryName={cat.name} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={2}>
          {pin.name}
        </Text>
        <Text style={[styles.headerSub, { color: colors.textDim }]} numberOfLines={1}>
          {cat.name} · {addedBy}
        </Text>
      </View>
    </View>
  );

  const StepTitle = ({ title }: { title: string }) => (
    <View style={styles.stepTitleRow}>
      <Pressable onPress={() => setStep('menu')} hitSlop={10}>
        <BackIcon size={20} color={colors.textDim} />
      </Pressable>
      <Text style={[styles.stepTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );

  if (step === 'move') {
    return (
      <BottomSheet visible onClose={onClose}>
        <StepTitle title="Sposta in…" />
        {categories.map((c) => {
          const current = c.id === pin.categoryId;
          return (
            <Pressable
              key={c.id}
              onPress={() => (current ? setStep('menu') : run(() => onMove(pin, c.id)))}
              style={[styles.item, { borderTopColor: colors.border }]}
            >
              <PlaceTile color={c.color} categoryName={c.name} size={24} />
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
        if (await onSendToChat(pin, note)) onClose();
      } finally {
        setSending(false);
      }
    };
    return (
      <BottomSheet visible onClose={onClose}>
        <StepTitle title="Manda in chat" />
        <View style={[styles.chatPreview, { backgroundColor: colors.surface2 }]}>{header}</View>
        <TextInput
          style={[styles.noteInput, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
          placeholder="Aggiungi due righe (facoltativo) — es. «ci andiamo martedì?»"
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
        <Text style={[styles.stepTitle, { color: colors.text }]}>Eliminare «{pin.name}»?</Text>
        <Text style={[styles.body, { color: colors.textDim }]}>
          Il posto sparisce dalla mappa per tutti nel gruppo. I link collegati restano nella sezione Link, perdono solo il collegamento.
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={() => setStep('menu')} style={[styles.btn, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
          </Pressable>
          <Pressable onPress={() => run(() => onDelete(pin))} style={[styles.btn, { backgroundColor: colors.danger }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Elimina</Text>
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible onClose={onClose}>
      {header}
      <Item icon={<SendIcon size={17} color={colors.amber} />} label="Portami lì" onPress={() => run(() => onNavigate(pin))} />
      {onShowOnMap ? (
        <Item
          icon={<MapIcon size={18} color={colors.teal} strokeWidth={2} />}
          label="Mostra sulla mappa"
          onPress={() => run(() => onShowOnMap(pin))}
        />
      ) : null}
      <Item
        icon={<LinkIcon size={18} color={colors.textDim} strokeWidth={2} />}
        label="Collega un link"
        onPress={() => run(() => onLinkLinks(pin))}
      />
      <Item icon={<ChatIcon size={18} color={colors.lilac} strokeWidth={2} />} label="Manda in chat" onPress={() => setStep('chat')} />
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
        onPress={() => run(() => Share.share({ message: `${pin.name}\n${mapsUrlForPlace(pin)}` }).catch(() => {}))}
      />
      <Item icon={<TrashIcon size={18} color={colors.danger} />} label="Elimina" danger onPress={() => setStep('delete')} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  headerTitle: { fontSize: 15, fontWeight: '800', lineHeight: 19 },
  headerSub: { fontSize: 12, marginTop: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, borderTopWidth: 1 },
  itemText: { flex: 1, fontSize: 15, fontWeight: '600' },
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
