import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme } from '@/theme/theme';
import { ReplyIcon, FlagIcon, BanIcon, BackIcon, LinkIcon, CopyIcon } from '@/components/Icon';
import type { RawMessage } from '@/lib/api/messages';
import { parsePlaceMessage } from '@/lib/chatPlace';
import type { RawLinkCategory } from '@/lib/api/linkCategories';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface MessageActionsSheetProps {
  /** `null` tiene il foglio chiuso. */
  message: RawMessage | null;
  authorName: string;
  isMine: boolean;
  /** Le reazioni che ho già messo a questo messaggio: si vedono accese. */
  myReactions: string[];
  /** Cosa si salverebbe nei link, se il messaggio ha qualcosa da salvare
   * (un indirizzo, una foto, un video, un documento). */
  saveable: { title: string } | null;
  linkCategories: RawLinkCategory[];
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onSaveToLinks: (categoryId: string) => void;
  onReport: () => void;
  onBlock: () => void;
  onCopied: () => void;
}

/**
 * Il menu di un messaggio, nello stesso stile di quelli di link e posti:
 * le reazioni in cima, poi le azioni. Si apre toccando il fumetto.
 */
export function MessageActionsSheet({
  message,
  authorName,
  isMine,
  myReactions,
  saveable,
  linkCategories,
  onClose,
  onReact,
  onReply,
  onSaveToLinks,
  onReport,
  onBlock,
  onCopied,
}: MessageActionsSheetProps) {
  const { colors } = useTheme();
  const [step, setStep] = useState<'menu' | 'save'>('menu');

  useEffect(() => {
    setStep('menu');
  }, [message?.id]);

  if (!message) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;

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

  const place = parsePlaceMessage(message.text);
  const preview =
    (place ? `${place.note ? place.note + ' · ' : ''}📍 ${place.name}` : message.text?.trim()) ||
    (message.attachmentType === 'image'
      ? 'Foto'
      : message.attachmentType === 'video'
        ? 'Video'
        : message.attachmentType === 'audio'
          ? 'Messaggio vocale'
          : message.attachmentName || 'Documento');

  if (step === 'save') {
    return (
      <BottomSheet visible onClose={onClose}>
        <View style={styles.stepTitleRow}>
          <Pressable onPress={() => setStep('menu')} hitSlop={10}>
            <BackIcon size={20} color={colors.textDim} />
          </Pressable>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Salva nei link</Text>
        </View>
        <Text style={[styles.stepSub, { color: colors.textDim }]} numberOfLines={2}>
          «{saveable?.title}» — in quale categoria?
        </Text>
        {linkCategories.map((c) => (
          <Pressable key={c.id} onPress={() => run(() => onSaveToLinks(c.id))} style={[styles.item, { borderTopColor: colors.border }]}>
            <View style={[styles.dot, { backgroundColor: c.color }]} />
            <Text style={[styles.itemText, { color: colors.text }]}>{c.name}</Text>
          </Pressable>
        ))}
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible onClose={onClose}>
      <View style={[styles.quote, { backgroundColor: colors.surface2, borderLeftColor: colors.teal }]}>
        <Text style={[styles.quoteAuthor, { color: colors.teal }]}>{isMine ? 'Tu' : authorName}</Text>
        <Text style={[styles.quoteText, { color: colors.text }]} numberOfLines={2}>
          {preview}
        </Text>
      </View>

      <View style={styles.emojiRow}>
        {QUICK_REACTIONS.map((emoji) => {
          const on = myReactions.includes(emoji);
          return (
            <Pressable
              key={emoji}
              onPress={() => run(() => onReact(emoji))}
              style={[styles.emojiBtn, { backgroundColor: on ? colors.amber + '40' : colors.surface2, borderColor: on ? colors.amber : 'transparent' }]}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>

      <Item icon={<ReplyIcon size={17} color={colors.textDim} />} label="Rispondi" onPress={() => run(onReply)} />
      {saveable && linkCategories.length > 0 ? (
        <Item
          icon={<LinkIcon size={18} color={colors.amber} strokeWidth={2} />}
          label="Salva nei link"
          onPress={() => (linkCategories.length === 1 ? run(() => onSaveToLinks(linkCategories[0].id)) : setStep('save'))}
        />
      ) : null}
      {message.text?.trim() ? (
        <Item
          icon={<CopyIcon size={17} color={colors.textDim} />}
          label="Copia il testo"
          onPress={() =>
            run(() => {
              Clipboard.setStringAsync(message.text ?? '').then(onCopied).catch(() => {});
            })
          }
        />
      ) : null}
      {/* Solo sui messaggi degli altri: segnalare o bloccare se stessi non
          vuol dire niente. */}
      {!isMine ? (
        <>
          <Item icon={<FlagIcon size={17} color={colors.textDim} />} label="Segnala messaggio" onPress={() => run(onReport)} />
          <Item icon={<BanIcon size={17} color={colors.danger} />} label={`Blocca ${authorName}`} danger onPress={() => run(onBlock)} />
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  quote: { borderLeftWidth: 3, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 12 },
  quoteAuthor: { fontSize: 11.5, fontWeight: '800' },
  quoteText: { fontSize: 13.5, marginTop: 2, lineHeight: 18 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  emojiBtn: { width: 46, height: 46, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 23 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, borderTopWidth: 1 },
  itemText: { flex: 1, fontSize: 15, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 4 },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  stepTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  stepSub: { fontSize: 12.5, marginBottom: 8, lineHeight: 17 },
});
