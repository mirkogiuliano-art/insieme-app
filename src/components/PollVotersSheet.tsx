import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, FONT_ROUNDED } from '@/theme/theme';
import { initials, inkOn, colorForUser } from '@/lib/utils';
import type { RawPoll, RawVote } from '@/lib/api/polls';
import { useT } from '@/i18n';

interface PollVotersSheetProps {
  /** `null` tiene il foglio chiuso. */
  poll: RawPoll | null;
  votes: RawVote[];
  myId: string;
  roster: Record<string, string>;
  onClose: () => void;
  onCloseePoll: (poll: RawPoll) => Promise<void>;
}

/**
 * Chi ha votato cosa, risposta per risposta.
 *
 * Nei sondaggi a voto segreto i nomi non ci sono — nemmeno qui, perché il
 * database non li dà a nessuno tranne a ciascuno i propri: restano i
 * numeri, e la riga "Tu" sulla propria risposta.
 */
export function PollVotersSheet({ poll, votes, myId, roster, onClose, onCloseePoll }: PollVotersSheetProps) {
  const { colors } = useTheme();
  const t = useT();
  const [closing, setClosing] = useState(false);
  // Chiudere un sondaggio non si annulla: prima si chiede.
  const [conferma, setConferma] = useState(false);
  useEffect(() => {
    setConferma(false);
  }, [poll?.id]);

  if (!poll) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;

  const membri = Object.keys(roster).length;
  const mio = poll.createdBy === myId;

  return (
    <BottomSheet visible onClose={onClose}>
      <Text style={[styles.eyebrow, { color: colors.lilac }]}>
        {poll.secret ? t.sondaggio.risultatiSegreti : t.sondaggio.chiHaVotato}
      </Text>
      <Text style={[styles.question, { color: colors.text }]}>{poll.question}</Text>
      <Text style={[styles.sub, { color: colors.textFaint }]}>
        {t.sondaggio.personeVotanti(poll.votersCount, membri)}
        {poll.closed ? t.sondaggio.suffissoChiuso : ''}
      </Text>

      <ScrollView style={styles.body}>
        <View style={{ gap: 8 }}>
          {poll.options.map((label, index) => {
            const chi = votes.filter((v) => v.optionIndex === index);
            const n = poll.counts[index] ?? 0;
            return (
              <View key={index} style={[styles.block, { backgroundColor: colors.surface2 }]}>
                <View style={styles.blockTop}>
                  <Text style={[styles.blockName, { color: colors.text }]} numberOfLines={2}>
                    {label}
                  </Text>
                  <Text style={[styles.blockCount, { color: colors.textDim }]}>{n}</Text>
                </View>
                {poll.secret ? (
                  <Text style={[styles.empty, { color: colors.textFaint }]}>
                    {chi.length > 0 ? t.sondaggio.haiVotatoQuesta : t.sondaggio.nomiNascosti}
                  </Text>
                ) : chi.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.textFaint }]}>{t.sondaggio.nessuno}</Text>
                ) : (
                  chi.map((v) => {
                    // Sulla propria riga il nome è "Tu", ma l'avatar resta
                    // quello di sempre: iniziali e colore come in chat.
                    const vero = roster[v.userId] ?? t.segnaposto.qualcuno;
                    const nome = v.userId === myId ? t.segnaposto.tu : vero;
                    const colore = colorForUser(vero);
                    return (
                      <View key={v.userId} style={styles.person}>
                        <View style={[styles.avatar, { backgroundColor: colore }]}>
                          <Text maxFontSizeMultiplier={1} style={[styles.avatarText, { color: inkOn(colore) }]}>{initials(vero)}</Text>
                        </View>
                        <Text style={[styles.personName, { color: colors.text }]}>{nome}</Text>
                      </View>
                    );
                  })
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {mio && !poll.closed ? (
        conferma ? (
          <View style={[styles.confirm, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>{t.sondaggio.chiudereTitolo}</Text>
            <Text style={[styles.confirmText, { color: colors.textDim }]}>{t.sondaggio.notaChiusura}</Text>
            <View style={styles.confirmRow}>
              <Pressable accessibilityRole="button" onPress={() => setConferma(false)} disabled={closing} style={[styles.confirmBtn, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.textDim, fontWeight: '600' }}>{t.comune.annulla}</Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                onPress={async () => {
                  setClosing(true);
                  try {
                    await onCloseePoll(poll);
                  } finally {
                    setClosing(false);
                  }
                }}
                disabled={closing}
                style={[styles.confirmBtn, { backgroundColor: colors.amber, opacity: closing ? 0.6 : 1 }]}
              >
                {closing ? (
                  <ActivityIndicator size="small" color={colors.inkOnAmber} />
                ) : (
                  <Text style={{ color: colors.inkOnAmber, fontWeight: '800' }}>{t.sondaggio.chiudiConferma}</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Pressable accessibilityRole="button"
              onPress={() => setConferma(true)}
              style={[styles.close, { backgroundColor: colors.surface2 }]}
            >
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{t.sondaggio.chiudi}</Text>
            </Pressable>
            <Text style={[styles.note, { color: colors.textFaint }]}>
              {t.sondaggio.notaChiusura}
            </Text>
          </>
        )
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 10.5, fontWeight: '800' },
  question: { fontFamily: FONT_ROUNDED, fontSize: 21, lineHeight: 25, letterSpacing: -0.3, marginTop: 4 },
  sub: { fontSize: 12.5, marginTop: 4 },
  body: { maxHeight: 420, marginTop: 14 },
  confirm: { marginTop: 14, borderRadius: 16, padding: 14 },
  confirmTitle: { fontSize: 15, fontWeight: '800' },
  confirmText: { fontSize: 12.5, lineHeight: 17, marginTop: 4 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  confirmBtn: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  block: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  blockTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockName: { flex: 1, fontSize: 13.5, fontWeight: '800' },
  blockCount: { fontSize: 13.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  empty: { fontSize: 12.5, paddingVertical: 7 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontWeight: '800' },
  personName: { fontSize: 14, fontWeight: '700' },
  close: { marginTop: 14, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 11.5, textAlign: 'center', marginTop: 8 },
});
