import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, FONT_ROUNDED } from '@/theme/theme';
import { PollIcon, CheckIcon } from '@/components/Icon';
import { initials, inkOn } from '@/lib/utils';
import type { RawPoll, RawVote } from '@/lib/api/polls';

interface PollCardProps {
  poll: RawPoll;
  /** Tutti i voti visibili di questo sondaggio (nei segreti: solo i miei). */
  votes: RawVote[];
  myId: string;
  /** Nome di ogni membro del gruppo, per id — lo stesso che usa la chat. */
  roster: Record<string, string>;
  onVote: (optionIndexes: number[]) => void;
  /** Apre l'elenco di chi ha votato cosa. */
  onOpenVoters: () => void;
  onMenu?: () => void;
}

/**
 * Il sondaggio in chat: la domanda, le risposte da toccare e, dopo il
 * voto, le barre con le percentuali.
 *
 * I risultati si vedono solo dopo aver votato (o a sondaggio chiuso): chi
 * deve ancora scegliere vede solo quante persone hanno già risposto, così
 * la maggioranza non trascina il voto di chi arriva dopo.
 *
 * La scheda sta sotto al fumetto come quelle dei link e dei posti, e ha
 * sempre il colore delle schede: il lilla è il segno del sondaggio.
 */
export function PollCard({ poll, votes, myId, roster, onVote, onOpenVoters, onMenu }: PollCardProps) {
  const { colors } = useTheme();
  const mine = votes.filter((v) => v.userId === myId).map((v) => v.optionIndex);
  const voted = mine.length > 0;
  const showResults = voted || poll.closed;
  const total = poll.counts.reduce((a, b) => a + b, 0);
  const leader = Math.max(0, ...poll.counts);

  const tocca = (index: number) => {
    if (poll.closed) return;
    if (poll.multi) {
      onVote(mine.includes(index) ? mine.filter((i) => i !== index) : [...mine, index]);
      return;
    }
    // A risposta singola, toccare la propria toglie il voto: è l'unico
    // modo per ripensarci senza doverne scegliere un'altra.
    onVote(mine.includes(index) ? [] : [index]);
  };

  const chiHaVotato = (index: number) => votes.filter((v) => v.optionIndex === index);
  const membri = Object.keys(roster).length;

  return (
    <Pressable onLongPress={onMenu} style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: colors.lilac + '2E' }]}>
          <PollIcon size={13} color={colors.lilac} />
        </View>
        <Text style={[styles.eyebrow, { color: colors.lilac }]}>
          {poll.closed ? 'SONDAGGIO CHIUSO' : 'SONDAGGIO'}
        </Text>
      </View>

      <Text style={[styles.question, { color: colors.text }]}>{poll.question}</Text>
      <Text style={[styles.hint, { color: colors.textFaint }]}>
        {poll.closed
          ? 'Non si vota più'
          : poll.multi
            ? 'Puoi scegliere più risposte'
            : 'Scegli una risposta · puoi cambiarla'}
      </Text>

      <View style={styles.options}>
        {poll.options.map((label, index) => {
          const scelta = mine.includes(index);
          const n = poll.counts[index] ?? 0;
          const pct = total > 0 ? Math.round((100 * n) / total) : 0;
          const votanti = chiHaVotato(index);
          return (
            <Pressable
              key={index}
              onPress={() => tocca(index)}
              disabled={poll.closed}
              style={[styles.option, { backgroundColor: colors.surface2 }]}
            >
              {showResults ? (
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${pct}%`,
                      backgroundColor: colors.lilac,
                      opacity: scelta ? 0.38 : n === leader && n > 0 ? 0.22 : 0.12,
                    },
                  ]}
                />
              ) : null}
              <View style={styles.optionMain}>
                <View
                  style={[
                    styles.mark,
                    poll.multi && styles.markSquare,
                    scelta ? { backgroundColor: colors.lilac } : { borderWidth: 2, borderColor: colors.textFaint },
                  ]}
                >
                  {scelta ? <CheckIcon size={11} color="#fff" strokeWidth={3.2} /> : null}
                </View>
                <Text style={[styles.optionText, { color: colors.text, fontWeight: scelta ? '800' : '700' }]}>
                  {label}
                </Text>
              </View>
              {showResults ? (
                <View style={styles.optionRight}>
                  {!poll.secret && votanti.length > 0 ? (
                    <View style={styles.avatars}>
                      {votanti.slice(0, 3).map((v, i) => (
                        <View
                          key={v.userId}
                          style={[
                            styles.avatar,
                            {
                              backgroundColor: colors.lilac,
                              borderColor: colors.surface2,
                              marginLeft: i === 0 ? 0 : -7,
                            },
                          ]}
                        >
                          <Text style={[styles.avatarText, { color: inkOn(colors.lilac) }]}>
                            {initials(roster[v.userId] ?? '')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Text style={[styles.pct, { color: scelta ? colors.text : colors.textDim }]}>{pct}%</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={onOpenVoters} style={styles.foot} hitSlop={6}>
        <Text style={[styles.footText, { color: colors.textFaint }]}>
          {poll.votersCount === 0
            ? 'Nessuno ha ancora votato'
            : `${poll.votersCount} ${poll.votersCount === 1 ? 'ha votato' : 'hanno votato'}${
                membri > poll.votersCount ? ` su ${membri}` : ''
              }`}
        </Text>
        {showResults ? (
          <Text style={[styles.footLink, { color: colors.lilac }]}>{poll.secret ? 'Dettagli' : 'Vedi chi'}</Text>
        ) : (
          <Text style={[styles.footLink, { color: colors.lilac }]}>Tocca per votare</Text>
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 292, borderRadius: 20, padding: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  badge: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
  question: { fontFamily: FONT_ROUNDED, fontSize: 19, lineHeight: 23, letterSpacing: -0.2 },
  hint: { fontSize: 12, marginTop: -6 },
  options: { gap: 6 },
  option: {
    minHeight: 46,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  optionMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  markSquare: { borderRadius: 6 },
  optionText: { flex: 1, fontSize: 14 },
  optionRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  avatars: { flexDirection: 'row' },
  avatar: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 7.5, fontWeight: '800' },
  pct: { fontSize: 13, fontWeight: '800', minWidth: 32, textAlign: 'right', fontVariant: ['tabular-nums'] },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 2 },
  footText: { flex: 1, fontSize: 12 },
  footLink: { fontSize: 12, fontWeight: '800' },
});
