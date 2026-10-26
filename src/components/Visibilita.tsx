import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { useTheme, RADIUS } from '@/theme/theme';
import { useToast } from '@/components/Toast';
import { BackIcon, ChevronIcon, GlobeIcon, LockIcon, CheckIcon } from '@/components/Icon';
import { CampoNomeUtente } from '@/components/CampoNomeUtente';
import { scegliNomeUtente, rendiPubblico } from '@/lib/api/pubblici';
import { suggerisciNomeUtente } from '@/lib/nomeUtente';
import { useAuth } from '@/lib/authStore';
import type { Group } from '@/types';
import { useT } from '@/i18n';
import { segnalaErrore } from '@/lib/sentry';

/**
 * La riga «Visibilità» di Info gruppo. Chi ha creato il gruppo la tocca e
 * decide; gli altri membri vedono solo che il gruppo è pubblico, e chi
 * l'ha deciso. Un gruppo privato, per loro, non ha niente da dire qui.
 */
export function RigaVisibilita({
  pubblico,
  sonoAutore,
  autore,
  onPress,
}: {
  pubblico: boolean;
  sonoAutore: boolean;
  autore: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  if (!sonoAutore && !pubblico) return null;
  return (
    <>
      <Text style={[styles.sectionLabel, styles.spazioRiga, { color: colors.textDim }]}>{t.pubblico.visibilita}</Text>
      <Pressable accessibilityRole="button" disabled={!sonoAutore} onPress={onPress} style={[styles.riga, { backgroundColor: colors.surface2 }]}>
        <View style={[styles.icona, { backgroundColor: (pubblico ? colors.teal : colors.textFaint) + '26' }]}>
          {pubblico ? <GlobeIcon size={16} color={colors.teal} /> : <LockIcon size={15} color={colors.textDim} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rigaTitolo, { color: colors.text }]}>{pubblico ? t.pubblico.pubblico : t.pubblico.privato}</Text>
          <Text style={[styles.rigaSub, { color: colors.textFaint }]}>
            {pubblico ? (sonoAutore ? t.pubblico.pubblicoSub : t.pubblico.resoPubblicoDa(autore)) : t.pubblico.privatoSub}
          </Text>
        </View>
        {sonoAutore ? <ChevronIcon size={15} color={colors.textFaint} /> : null}
      </Pressable>
    </>
  );
}

/**
 * La pagina che si apre dalla riga, al posto delle info: dice prima cosa
 * diventa visibile e cosa no, poi si conferma. La prima volta chiede anche
 * il nome utente, già proposto dal nome della persona.
 */
export function ContenutoVisibilita({
  group,
  pubblico,
  onBack,
  onCambiato,
}: {
  group: Group;
  pubblico: boolean;
  onBack: () => void;
  onCambiato: (pubblico: boolean) => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const toast = useToast();
  const { profile, refreshProfile } = useAuth();
  const serveNome = !pubblico && !profile?.nomeUtente;
  const [bozza, setBozza] = useState(suggerisciNomeUtente(profile?.displayName ?? ''));
  const [nomePronto, setNomePronto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pronto = !serveNome || nomePronto !== null;

  const conferma = async () => {
    if (!pronto || busy) return;
    setBusy(true);
    try {
      if (serveNome && nomePronto) {
        await scegliNomeUtente(nomePronto);
        await refreshProfile();
      }
      await rendiPubblico(group.id, !pubblico);
      onCambiato(!pubblico);
      toast.show(pubblico ? t.pubblico.oraPrivato : t.pubblico.oraPubblico);
      onBack();
    } catch (err) {
      segnalaErrore(err, 'pubblico.errore');
      toast.show(t.pubblico.errore, 'error');
    } finally {
      setBusy(false);
    }
  };

  const voce = (si: boolean, testo: string) => (
    <View key={testo} style={styles.voce}>
      {si ? <CheckIcon size={14} color={colors.teal} /> : <LockIcon size={13} color={colors.textFaint} />}
      <Text style={[styles.voceText, { color: si ? colors.text : colors.textDim }]}>{testo}</Text>
    </View>
  );

  return (
    <>
      <View style={styles.titoloRiga}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.comune.indietro} hitSlop={8} onPress={onBack} style={[styles.indietro, { backgroundColor: colors.surface2 }]}>
          <BackIcon size={16} color={colors.textDim} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.titolo, { color: colors.text }]}>{pubblico ? t.pubblico.tornarePrivato : t.pubblico.renderePubblico}</Text>
          <Text style={[styles.sub, { color: colors.textDim }]} numberOfLines={1}>{group.name}</Text>
        </View>
      </View>

      {pubblico ? (
        <Text style={[styles.testo, { color: colors.textDim }]}>{t.pubblico.tornarePrivatoTesto}</Text>
      ) : (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textDim }]}>{t.pubblico.loVedonoTutti}</Text>
          <View style={[styles.lista, { backgroundColor: colors.surface2 }]}>
            {[t.pubblico.vedeInfo, t.pubblico.vedeCose, t.pubblico.vedeLink, t.pubblico.vedePosti, t.pubblico.vedeAutore].map((x) => voce(true, x))}
          </View>
          <Text style={[styles.sectionLabel, styles.spazio, { color: colors.textDim }]}>{t.pubblico.restanoDentro}</Text>
          <View style={[styles.lista, { backgroundColor: colors.surface2 }]}>
            {[t.pubblico.restaChat, t.pubblico.restaMembri].map((x) => voce(false, x))}
          </View>

          {serveNome ? (
            <>
              <Text style={[styles.sectionLabel, styles.spazio, { color: colors.textDim }]}>{t.pubblico.tuoNomeUtente}</Text>
              <CampoNomeUtente valore={bozza} onCambia={setBozza} onPronto={setNomePronto} />
              <Text style={[styles.nota, { color: colors.textFaint }]}>{t.pubblico.nomeUtenteNota}</Text>
            </>
          ) : null}
          <Text style={[styles.nota, styles.spazio, { color: colors.textFaint }]}>{t.pubblico.avvisoMembri}</Text>
        </>
      )}

      <View style={styles.azioni}>
        <Pressable accessibilityRole="button" onPress={onBack} disabled={busy} style={[styles.btn, { backgroundColor: colors.surface2 }]}>
          <Text style={{ color: colors.textDim, fontWeight: '600' }}>{t.comune.annulla}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={conferma}
          disabled={!pronto || busy}
          style={[styles.btn, { backgroundColor: colors.amber, opacity: !pronto || busy ? 0.5 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.inkOnAmber} />
          ) : (
            <Text style={{ color: colors.inkOnAmber, fontWeight: '800' }}>{pubblico ? t.pubblico.tornaPrivato : t.pubblico.rendiPubblico}</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 10.5, fontWeight: '800', marginBottom: 8 },
  spazio: { marginTop: 16 },
  // Lo stesso spazio delle altre sezioni di Info gruppo.
  spazioRiga: { marginTop: 20 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 11, borderRadius: RADIUS.md },
  icona: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rigaTitolo: { fontSize: 14.5, fontWeight: '700' },
  rigaSub: { fontSize: 11.5, marginTop: 1 },
  titoloRiga: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  indietro: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  titolo: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: 12.5, marginTop: 1 },
  testo: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  lista: { borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 6 },
  voce: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  voceText: { flex: 1, fontSize: 14 },
  nota: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  azioni: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
