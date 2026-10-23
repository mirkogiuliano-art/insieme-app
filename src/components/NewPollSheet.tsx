import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';
import { PollIcon, CloseIcon, PlusIcon } from '@/components/Icon';
import { useT } from '@/i18n';

/** Quanto ne accetta il database (vedi 20260923090000_sondaggi.sql). */
const MIN_OPZIONI = 2;
const MAX_OPZIONI = 10;

interface NewPollSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Restituisce un messaggio d'errore, oppure `null` se è andata. */
  onCreate: (question: string, options: string[], opts: { multi: boolean; secret: boolean }) => Promise<string | null>;
}

/**
 * "Nuovo sondaggio": la domanda, le risposte e due scelte.
 *
 * Le righe delle risposte partono da due vuote perché un sondaggio con una
 * sola risposta non esiste; la terza compare quando serve, invece di
 * mostrare dieci campi vuoti a chi ne vuole due.
 */
export function NewPollSheet({ visible, onClose, onCreate }: NewPollSheetProps) {
  const { colors } = useTheme();
  const t = useT();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const [secret, setSecret] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuestion('');
    setOptions(['', '']);
    setMulti(false);
    setSecret(false);
    setError('');
  }, [visible]);

  const scrivi = (i: number, value: string) => {
    setOptions((prev) => prev.map((o, k) => (k === i ? value : o)));
    setError('');
  };

  const piene = options.map((o) => o.trim()).filter(Boolean);
  const diverse = new Set(piene.map((o) => o.toLowerCase()));
  const pronto = question.trim().length > 0 && diverse.size >= MIN_OPZIONI;

  const manda = async () => {
    if (!pronto || busy) return;
    setBusy(true);
    setError('');
    try {
      const problema = await onCreate(question.trim(), piene, { multi, secret });
      if (problema) setError(problema);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.titleRow}>
        <View style={[styles.badge, { backgroundColor: colors.lilac + '2E' }]}>
          <PollIcon size={17} color={colors.lilac} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{t.sondaggio.nuovo}</Text>
      </View>

      <View>
        <Text style={[styles.label, { color: colors.textFaint }]}>{t.sondaggio.domanda}</Text>
        <TextInput
          style={[styles.question, { backgroundColor: colors.surface2, color: colors.text }]}
          placeholder={t.sondaggio.esempioDomanda}
          placeholderTextColor={colors.textFaint}
          value={question}
          onChangeText={(t) => {
            setQuestion(t);
            setError('');
          }}
          maxLength={200}
        />

        <Text style={[styles.label, { color: colors.textFaint }]}>{t.sondaggio.risposte}</Text>
        <View style={{ gap: 6 }}>
          {options.map((o, i) => (
            <View key={i} style={[styles.optionRow, { backgroundColor: colors.surface2 }]}>
              <TextInput
                style={[styles.optionInput, { color: colors.text }]}
                placeholder={t.sondaggio.esempioRisposta(i + 1)}
                placeholderTextColor={colors.textFaint}
                value={o}
                onChangeText={(t) => scrivi(i, t)}
                maxLength={80}
              />
              {options.length > MIN_OPZIONI ? (
                <Pressable accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setOptions((prev) => prev.filter((_, k) => k !== i))}
                  accessibilityLabel={t.sondaggio.togliRisposta(i + 1)}
                >
                  <CloseIcon size={15} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {options.length < MAX_OPZIONI ? (
            <Pressable accessibilityRole="button" onPress={() => setOptions((prev) => [...prev, ''])} style={styles.addRow}>
              <PlusIcon size={14} color={colors.lilac} />
              <Text style={{ color: colors.lilac, fontSize: 13.5, fontWeight: '800' }}>{t.sondaggio.aggiungiRisposta}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.switches}>
          <Interruttore
            label={t.sondaggio.multi}
            sub="Ognuno può sceglierne più di una"
            value={multi}
            onChange={setMulti}
          />
          <Interruttore
            label={t.sondaggio.segreto}
            sub="Si vedono i numeri, non chi ha votato cosa"
            value={secret}
            onChange={setSecret}
          />
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      </View>

      <Pressable accessibilityRole="button"
        onPress={manda}
        disabled={!pronto || busy}
        style={[styles.primary, { backgroundColor: colors.amber, opacity: !pronto || busy ? 0.5 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.inkOnAmber} />
        ) : (
          <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 14.5 }}>{t.sondaggio.manda}</Text>
        )}
      </Pressable>
    </BottomSheet>
  );
}

// Fuori dal componente che li usa: dichiarati dentro, a ogni ridisegno React li vedeva
// come componenti nuovi e ricostruiva da capo tutto quello che contengono.

function Interruttore({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.switchLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.switchSub, { color: colors.textFaint }]}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surface2, true: colors.lilac }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  badge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  label: { fontSize: 10.5, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  question: { borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, fontWeight: '700' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADIUS.sm, paddingHorizontal: 14, height: 48 },
  optionInput: { flex: 1, fontSize: 14.5, paddingVertical: 0 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10, paddingHorizontal: 4 },
  switches: { gap: 14, marginTop: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 14.5, fontWeight: '700' },
  switchSub: { fontSize: 12, marginTop: 2 },
  error: { fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  primary: { marginTop: 16, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
