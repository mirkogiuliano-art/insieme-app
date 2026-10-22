import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/theme';
import { LockIcon, CheckIcon, BrokenLinkIcon } from '@/components/Icon';
import { PasswordInput } from '@/components/PasswordInput';
import { supabase } from '@/lib/supabase';
import { ScreenGlow } from '@/components/ScreenGlow';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ScrollConTastiera } from '@/components/ScrollConTastiera';
import { useEsitoLink, dimenticaEsitoLink } from '@/lib/linkAccesso';
import { useT, messaggioAuth } from '@/i18n';

/**
 * Destinazione del link "password dimenticata" (Supabase Auth →
 * resetPasswordForEmail con redirectTo: 'insieme://reset-password').
 * Il link contiene un token nel frammento URL che Supabase usa per
 * stabilire una sessione temporanea valida solo per cambiare la password.
 */
/** La forma comune dei tre stati. Sta fuori dalla schermata di proposito:
 * definita dentro, verrebbe ricreata a ogni lettera digitata e il campo
 * password perderebbe il fuoco. */
function Screen({ icon, tone, title, text, children }: { icon: React.ReactNode; tone: string; title: string; text: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.column}>
      <View style={[styles.bigIcon, { backgroundColor: colors.surface }]}>{icon}</View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: tone }]}>{text}</Text>
      {children}
    </View>
  );
}

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Il link lo legge chi è sempre acceso (LinkAccessoRouter in _layout):
  // qui si aspetta l'esito. Senza nessun link, vale la sessione che c'è.
  const esitoLink = useEsitoLink();
  useEffect(() => {
    if (esitoLink === 'attesa') return;
    if (esitoLink === 'dentro' || esitoLink === 'scaduto') {
      setHasSession(esitoLink === 'dentro');
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, [esitoLink]);

  const submit = async () => {
    setError('');
    if (password.length < 8) {
      setError(t.accesso.passwordCorta(8));
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(messaggioAuth(err));
      return;
    }
    dimenticaEsitoLink();
    setDone(true);
  };

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ScreenGlow />
        <ActivityIndicator color={colors.amberText} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScreenGlow />
      {/* Senza questi due la tastiera copriva il campo della password:
          su Android edge-to-edge la finestra non si restringe da sola. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
      <ScrollConTastiera contentContainerStyle={styles.inner}>
        {!hasSession ? (
          <Screen
            icon={<BrokenLinkIcon size={32} color={colors.danger} />}
            tone={colors.textDim}
            title={t.nuovaPassword.scadutoTitolo}
            text={t.nuovaPassword.scadutoTesto}
          >
            <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={[styles.button, { backgroundColor: colors.surface }]}>
              <Text style={[styles.buttonText, { color: colors.text }]}>{t.nuovaPassword.vaiAccesso}</Text>
            </Pressable>
          </Screen>
        ) : done ? (
          <Screen
            icon={<CheckIcon size={32} color={colors.teal} />}
            tone={colors.textDim}
            title={t.nuovaPassword.fattaTitolo}
            text={t.nuovaPassword.fattaTesto}
          >
            <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={[styles.button, { backgroundColor: colors.amber }]}>
              <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>{t.nuovaPassword.tornaApp}</Text>
            </Pressable>
          </Screen>
        ) : (
          <Screen icon={<LockIcon size={32} color={colors.amberText} />} tone={colors.textDim} title={t.nuovaPassword.titolo} text={t.nuovaPassword.testo}>
            <PasswordInput
              placeholder={t.nuovaPassword.campo}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              returnKeyType="done"
            />
            {error ? <Text style={{ color: colors.danger, fontSize: 12.5, textAlign: 'center' }}>{error}</Text> : null}
            <Pressable accessibilityRole="button"
              onPress={submit}
              disabled={loading}
              style={[styles.button, { backgroundColor: colors.amber, opacity: loading ? 0.6 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.inkOnAmber} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>{t.nuovaPassword.salva}</Text>
              )}
            </Pressable>
          </Screen>
        )}
      </ScrollConTastiera>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  column: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 12 },
  bigIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
  button: { width: '100%', height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontWeight: '800', fontSize: 15 },
});
