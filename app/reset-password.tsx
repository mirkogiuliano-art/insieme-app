import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useTheme, RADIUS } from '@/theme/theme';
import { PasswordInput } from '@/components/PasswordInput';
import { supabase } from '@/lib/supabase';

/**
 * Destinazione del link "password dimenticata" (Supabase Auth →
 * resetPasswordForEmail con redirectTo: 'insieme://reset-password').
 * Il link contiene un token nel frammento URL che Supabase usa per
 * stabilire una sessione temporanea valida solo per cambiare la password.
 */
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
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.inner}>
        <Text style={[styles.title, { color: colors.text }]}>Nuova password</Text>
        {!hasSession ? (
          <Text style={[styles.subtitle, { color: colors.textDim }]}>
            Questo link non è valido o è scaduto. Richiedine uno nuovo dalla schermata di accesso.
          </Text>
        ) : done ? (
          <>
            <Text style={[styles.subtitle, { color: colors.textDim }]}>
              Password aggiornata. Ora puoi accedere con quella nuova.
            </Text>
            <Pressable onPress={() => router.replace('/')} style={[styles.button, { backgroundColor: colors.amber }]}>
              <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>Torna all'app</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: colors.textDim }]}>Scegli una nuova password.</Text>
            <PasswordInput
              placeholder="Nuova password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              returnKeyType="done"
            />
            {error ? <Text style={{ color: colors.danger, fontSize: 12.5 }}>{error}</Text> : null}
            <Pressable
              onPress={submit}
              disabled={loading}
              style={[styles.button, { backgroundColor: colors.amber, opacity: loading ? 0.6 : 1 }]}
            >
              <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>
                {loading ? 'Un attimo…' : 'Salva password'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 14 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13.5, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
  input: { width: '100%', maxWidth: 280, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15 },
  button: { width: '100%', maxWidth: 280, paddingVertical: 13, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: 4 },
  buttonText: { fontWeight: '700', fontSize: 14 },
});
