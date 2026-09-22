import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/theme';
import { LockIcon, CheckIcon, BrokenLinkIcon } from '@/components/Icon';
import { PasswordInput } from '@/components/PasswordInput';
import { supabase } from '@/lib/supabase';
import { ScreenGlow } from '@/components/ScreenGlow';

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
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const url = await Linking.getInitialURL();
      const parsed = url ? Linking.parse(url) : null;
      const fragmentParams = parsed?.queryParams as Record<string, string> | undefined;
      if (fragmentParams?.access_token && fragmentParams?.refresh_token) {
        await supabase.auth.setSession({
          access_token: fragmentParams.access_token,
          refresh_token: fragmentParams.refresh_token,
        });
      }
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data.session);
      setChecking(false);
    })();
  }, []);

  const submit = async () => {
    setError('');
    if (password.length < 8) {
      setError('La password deve avere almeno 8 caratteri.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
  };

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ScreenGlow />
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScreenGlow />
      <View style={styles.inner}>
        {!hasSession ? (
          <Screen
            icon={<BrokenLinkIcon size={32} color={colors.danger} />}
            tone={colors.textDim}
            title="Link scaduto"
            text="Questo link non è valido o è già stato usato. Chiedine uno nuovo da «Password dimenticata?» nella schermata di accesso."
          >
            <Pressable onPress={() => router.replace('/')} style={[styles.button, { backgroundColor: colors.surface }]}>
              <Text style={[styles.buttonText, { color: colors.text }]}>Vai all’accesso</Text>
            </Pressable>
          </Screen>
        ) : done ? (
          <Screen
            icon={<CheckIcon size={32} color={colors.teal} />}
            tone={colors.textDim}
            title="Password aggiornata"
            text="D’ora in poi accedi con quella nuova."
          >
            <Pressable onPress={() => router.replace('/')} style={[styles.button, { backgroundColor: colors.amber }]}>
              <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>Torna all’app</Text>
            </Pressable>
          </Screen>
        ) : (
          <Screen icon={<LockIcon size={32} color={colors.amber} />} tone={colors.textDim} title="Nuova password" text="Scegline una di almeno 8 caratteri.">
            <PasswordInput
              placeholder="Nuova password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              returnKeyType="done"
            />
            {error ? <Text style={{ color: colors.danger, fontSize: 12.5, textAlign: 'center' }}>{error}</Text> : null}
            <Pressable
              onPress={submit}
              disabled={loading}
              style={[styles.button, { backgroundColor: colors.amber, opacity: loading ? 0.6 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.inkOnAmber} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>Salva la password</Text>
              )}
            </Pressable>
          </Screen>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  column: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 12 },
  bigIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
  button: { width: '100%', height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontWeight: '800', fontSize: 15 },
});
