import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Pressable } from '@/components/Tocco';
import { useTheme, RADIUS } from '@/theme/theme';
import { ChevronIcon, GlobeIcon } from '@/components/Icon';
import { cerca, type GruppoPubblico, type PersonaPubblica } from '@/lib/api/pubblici';
import { initials, colorForUser, inkOn } from '@/lib/utils';
import { rangeLabel } from '@/lib/groupInfo';
import { useT } from '@/i18n';

/** Quanto aspettare dopo l'ultima lettera prima di chiedere al server. */
const PAUSA_MS = 250;

/**
 * Sotto i tuoi gruppi, mentre cerchi: i gruppi pubblici e le persone di
 * Insieme. Le persone sono solo quelle con almeno un gruppo pubblico: chi
 * usa l'app solo in privato non si trova.
 *
 * `tuoiTrovati` dice quanti dei tuoi gruppi corrispondono, per scrivere
 * «non c'è niente» solo quando davvero non c'è niente, né qui né sopra.
 */
export function RisultatiPubblici({ testo, tuoiTrovati }: { testo: string; tuoiTrovati: number }) {
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const [esito, setEsito] = useState<{ per: string; gruppi: GruppoPubblico[]; persone: PersonaPubblica[] } | null>(null);
  const q = testo.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      cerca(q)
        .then((r) => alive && setEsito({ per: q, ...r }))
        .catch(() => alive && setEsito({ per: q, gruppi: [], persone: [] }));
    }, PAUSA_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  if (q.length < 2) return null;
  // Finché non arriva la risposta per quello che c'è scritto, non si
  // mostrano i risultati della ricerca di prima.
  if (!esito || esito.per !== q) return null;
  const { gruppi, persone } = esito;
  if (gruppi.length === 0 && persone.length === 0) {
    return tuoiTrovati === 0 ? (
      <Text style={[styles.vuoto, { color: colors.textFaint }]}>{t.pubblico.nienteCon(q)}</Text>
    ) : null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.titolo, { color: colors.textDim }]}>{t.pubblico.suInsieme}</Text>
      {persone.length > 0 ? (
        <View style={[styles.block, { backgroundColor: colors.surface }]}>
          {persone.map((p, i) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => router.push(`/persona/${p.id}`)}
              style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <View style={[styles.avatar, { backgroundColor: colorForUser(p.nome) }]}>
                <Text maxFontSizeMultiplier={1} style={styles.avatarText}>{initials(p.nome)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.nome, { color: colors.text }]} numberOfLines={1}>{p.nome}</Text>
                <Text style={[styles.sub, { color: colors.textFaint }]} numberOfLines={1}>
                  @{p.nomeUtente} · {t.pubblico.gruppiN(p.gruppi)}
                </Text>
              </View>
              <ChevronIcon size={15} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {gruppi.length > 0 ? (
        <View style={[styles.block, { backgroundColor: colors.surface }]}>
          {gruppi.map((g, i) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              onPress={() => router.push(`/pubblico/${g.id}`)}
              style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <View style={[styles.tinta, { backgroundColor: g.colore }]}>
                <GlobeIcon size={17} color={inkOn(g.colore)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.nome, { color: colors.text }]} numberOfLines={1}>{g.nome}</Text>
                <Text style={[styles.sub, { color: colors.textFaint }]} numberOfLines={1}>
                  {[`@${g.autore.nomeUtente}`, rangeLabel(g.startsOn, g.endsOn)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <ChevronIcon size={15} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 10, marginTop: 6 },
  titolo: { fontSize: 10.5, fontWeight: '800' },
  block: { borderRadius: RADIUS.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10 },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#1B2530' },
  tinta: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nome: { fontSize: 14.5, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 1 },
  vuoto: { width: '100%', fontSize: 13, textAlign: 'center', lineHeight: 18, paddingTop: 40, paddingHorizontal: 30 },
});
