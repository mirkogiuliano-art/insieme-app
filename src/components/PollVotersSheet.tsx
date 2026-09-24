import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, FONT_ROUNDED } from '@/theme/theme';
import { initials, inkOn } from '@/lib/utils';
import type { RawPoll, RawVote } from '@/lib/api/polls';

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
  const [closing, setClosing] = useState(false);

  if (!poll) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;

  const membri = Object.keys(roster).length;
  const mio = poll.createdBy === myId;

  return (
    <BottomSheet visible onClose={onClose}>
      <Text style={[styles.eyebrow, { color: colors.lilac }]}>
        {poll.secret ? 'RISULTATI · VOTO SEGRETO' : 'CHI HA VOTATO'}
      </Text>
      <Text style={[styles.question, { color: colors.text }]}>{poll.question}</Text>
      <Text style={[styles.sub, { color: colors.textFaint }]}>
        {`${poll.votersCount} ${poll.votersCount === 1 ? 'persona ha votato' : 'persone hanno votato'}`}
        {membri > 0 ? ` su ${membri}` : ''}
        {poll.closed ? ' · chiuso' : ''}
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
                    {chi.length > 0 ? 'Hai votato questa' : 'I nomi restano nascosti'}
                  </Text>
                ) : chi.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.textFaint }]}>Nessuno</Text>
                ) : (
                  chi.map((v) => {
                    const nome = v.userId === myId ? 'Tu' : (roster[v.userId] ?? 'Qualcuno');
                    return (
                      <View key={v.userId} style={styles.person}>
                        <View style={[styles.avatar, { backgroundColor: colors.lilac }]}>
                          <Text style={[styles.avatarText, { color: inkOn(colors.lilac) }]}>{initials(nome)}</Text>
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
        <>
          <Pressable
            onPress={async () => {
              setClosing(true);
              try {
                await onCloseePoll(poll);
              } finally {
                setClosing(false);
              }
            }}
            disabled={closing}
            style={[styles.close, { backgroundColor: colors.surface2, opacity: closing ? 0.6 : 1 }]}
          >
            {closing ? (
              <ActivityIndicator size="small" color={colors.textDim} />
            ) : (
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>Chiudi il sondaggio</Text>
            )}
          </Pressable>
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Dopo non si vota più, e restano i risultati.
          </Text>
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
  question: { fontFamily: FONT_ROUNDED, fontSize: 21, lineHeight: 25, letterSpacing: -0.3, marginTop: 4 },
  sub: { fontSize: 12.5, marginTop: 4 },
  body: { maxHeight: 420, marginTop: 14 },
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
