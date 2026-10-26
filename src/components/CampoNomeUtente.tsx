import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { CheckIcon } from '@/components/Icon';
import { nomeUtenteLibero } from '@/lib/api/pubblici';
import { nomeUtenteValido, normalizzaNomeUtente } from '@/lib/nomeUtente';
import { useT } from '@/i18n';

/**
 * Il campo del nome utente, con la @ davanti: si ripulisce mentre si
 * scrive (minuscole, niente spazi né accenti) e dopo una breve pausa dice
 * se è libero. `attuale` è il nome che la persona ha già: quello è suo,
 * quindi libero. `onPronto` riceve il nome quando si può usare, `null`
 * altrimenti.
 */
export function CampoNomeUtente({
  valore,
  onCambia,
  attuale,
  onPronto,
}: {
  valore: string;
  onCambia: (v: string) => void;
  attuale?: string | null;
  onPronto: (nome: string | null) => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const [libero, setLibero] = useState<boolean | null>(null);
  const valido = nomeUtenteValido(valore);

  useEffect(() => {
    setLibero(null);
    onPronto(null);
    if (!valido) return;
    if (valore === attuale) {
      setLibero(true);
      onPronto(valore);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      nomeUtenteLibero(valore)
        .then((l) => {
          if (!alive) return;
          setLibero(l);
          onPronto(l ? valore : null);
        })
        .catch(() => {});
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valore, attuale]);

  return (
    <>
      <View style={[styles.campo, { backgroundColor: colors.surface2 }]}>
        <Text style={[styles.chiocciola, { color: colors.textFaint }]}>@</Text>
        <TextInput
          value={valore}
          onChangeText={(x) => onCambia(normalizzaNomeUtente(x))}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={24}
          style={[styles.input, { color: colors.text }]}
          accessibilityLabel={t.pubblico.tuoNomeUtente}
        />
        {libero === true ? <CheckIcon size={16} color={colors.teal} /> : null}
      </View>
      <Text style={[styles.stato, { color: libero === false ? colors.danger : libero === true ? colors.teal : colors.textFaint }]}>
        {!valido ? t.pubblico.regoleNome : libero === false ? t.pubblico.nomePreso : libero === true ? t.pubblico.nomeLibero : t.comune.unAttimo}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  campo: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 46, borderRadius: RADIUS.sm, paddingHorizontal: 14 },
  chiocciola: { fontSize: 15, fontWeight: '700' },
  input: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 0 },
  stato: { fontSize: 12, fontWeight: '600', marginTop: 6 },
});
