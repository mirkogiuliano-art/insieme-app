import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTheme } from '@/theme/theme';
import { Field } from '@/components/Field';
import { useAuth } from '@/lib/authStore';
import { updateDisplayName } from '@/lib/api/profiles';
import { initials } from '@/lib/utils';
import { PersonIcon } from '@/components/Icon';
import { ScreenGlow } from '@/components/ScreenGlow';
import { ScrollConTastiera } from '@/components/ScrollConTastiera';
import { useT } from '@/i18n';
import { messaggioErrore, eProblemaDiRete } from '@/lib/errori';
import { segnalaErrore } from '@/lib/sentry';

/** Il nome che Google ha passato alla registrazione, se c'è, ridotto al
 * nome di battesimo e alla lunghezza che il campo accetta. */
function nomeDaGoogle(meta: Record<string, unknown> | undefined): string {
  const pieno = [meta?.given_name, meta?.full_name, meta?.name].find(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  if (!pieno) return '';
  return pieno.trim().split(/\s+/)[0].slice(0, 24);
}

/**
 * Il nome, al primo ingresso. Le iniziali grandi si formano mentre si
 * scrive: sono quelle che gli altri vedranno accanto ai messaggi, nello
 * stesso quadrato del Profilo.
 */
export function NameOnboarding() {
  const { colors } = useTheme();
  const t = useT();
  const { session, refreshProfile, signOut } = useAuth();
  // Chi entra con Google ha già detto a Google come si chiama: il campo
  // parte da lì. Solo il nome di battesimo, perché è quello che si usa fra
  // amici, e lo si può comunque cambiare prima di continuare.
  const [value, setValue] = useState(() => nomeDaGoogle(session?.user.user_metadata));
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState('');

  // Se la rete cade proprio qui, prima il tasto restava a girare per
  // sempre: ora si dice cosa è successo e si può riprovare.
  const submit = async () => {
    if (!value.trim() || saving) return;
    setSaving(true);
    setErrore('');
    try {
      await updateDisplayName(value);
      await refreshProfile();
    } catch (err) {
      if (!eProblemaDiRete(err)) segnalaErrore(err, 'primoNome.errore');
      setErrore(messaggioErrore(err, t.primoNome.errore));
    } finally {
      setSaving(false);
    }
  };

  const ready = !!value.trim();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScreenGlow />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
        <ScrollConTastiera contentContainerStyle={styles.inner}>
          <View style={styles.column}>
            <Text style={[styles.title, { color: colors.text }]}>{t.primoNome.titolo}</Text>
            <Text style={[styles.subtitle, { color: colors.textDim }]}>{t.primoNome.sottotitolo}</Text>
            <View style={[styles.avatar, { backgroundColor: ready ? colors.amber : colors.surface }]}>
              {ready ? (
                <Text maxFontSizeMultiplier={1} style={[styles.avatarText, { color: colors.inkOnAmber }]}>{initials(value)}</Text>
              ) : (
                <PersonIcon size={36} color={colors.textFaint} />
              )}
            </View>
            <Field
              placeholder={t.primoNome.campo}
              value={value}
              onChangeText={setValue}
              maxLength={24}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submit}
              style={styles.field}
            />
            {errore ? <Text style={[styles.errore, { color: colors.danger }]}>{errore}</Text> : null}
            <Pressable accessibilityRole="button"
              onPress={submit}
              disabled={!ready || saving}
              style={[styles.button, { backgroundColor: colors.amber, opacity: ready && !saving ? 1 : 0.45 }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.inkOnAmber} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>{t.primoNome.continua}</Text>
              )}
            </Pressable>
            <Text style={[styles.account, { color: colors.textFaint }]}>{t.primoNome.accessoCome(session?.user.email ?? '')}</Text>
            <Pressable accessibilityRole="button" onPress={signOut}>
              <Text style={[styles.link, { color: colors.textDim }]}>{t.primoNome.nonSeiTu}</Text>
            </Pressable>
          </View>
        </ScrollConTastiera>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  errore: { fontSize: 12.5, textAlign: 'center', lineHeight: 17 },
  // `flexGrow` e non `flex`: dentro una lista che scorre, il contenuto
  // riempie lo schermo quando è corto e si allunga quando non ci sta.
  inner: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  column: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 12 },
  title: { fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 13.5, textAlign: 'center', lineHeight: 19, marginTop: -4 },
  avatar: { width: 92, height: 92, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  avatarText: { fontSize: 32, fontWeight: '800' },
  field: { height: 56 },
  button: { width: '100%', height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontWeight: '800', fontSize: 15 },
  account: { fontSize: 11.5, marginTop: 4 },
  link: { fontSize: 13, fontWeight: '700' },
});
