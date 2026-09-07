import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { PasswordInput } from '@/components/PasswordInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, RADIUS } from '@/theme/theme';
import { ChatIcon, BackIcon } from '@/components/Icon';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'signup' | 'forgot';

const TITLES: Record<Mode, string> = {
  login: 'Bentornato',
  signup: 'Crea un account',
  forgot: 'Password dimenticata',
};

const SUBTITLES: Record<Mode, string> = {
  login: 'Accedi per ritrovare i tuoi gruppi.',
  signup: 'Ti basta email e password per iniziare.',
  forgot: "Ti mandiamo un link per impostarne una nuova.",
};

export function AuthScreen() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
    setPassword('');
    setConfirmPassword('');
  };

  const submit = async () => {
    setError('');
    setInfo('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Inserisci un indirizzo email valido.');
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      const { error: err } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: 'insieme://reset-password',
      });
      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
      setInfo('Controlla la tua email: ti abbiamo mandato un link per impostare una nuova password.');
      return;
    }

    if (!password) {
      setError('Inserisci la password.');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 8) {
        setError('La password deve avere almeno 8 caratteri.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Le due password non coincidono.');
        return;
      }
      setLoading(true);
      const { error: err } = await supabase.auth.signUp({ email: cleanEmail, password });
      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
      // Non uso switchMode qui: azzererebbe anche il messaggio di successo
      // appena impostato, che invece deve restare visibile.
      setMode('login');
      setPassword('');
      setConfirmPassword('');
      setInfo('Account creato! Controlla la tua email per confermarlo, poi accedi qui sotto.');
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setLoading(false);
    if (err) setError(err.message);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          {mode !== 'login' ? (
            <Pressable onPress={() => switchMode('login')} style={styles.backBtn} hitSlop={10}>
              <BackIcon size={18} color={colors.textDim} />
            </Pressable>
          ) : null}

          <View style={[styles.mark, { backgroundColor: colors.amber }]}>
            <ChatIcon size={26} color={colors.inkOnAmber} strokeWidth={1.8} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{TITLES[mode]}</Text>
          <Text style={[styles.subtitle, { color: colors.textDim }]}>{SUBTITLES[mode]}</Text>

          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="Email"
            placeholderTextColor={colors.textFaint}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType={mode === 'forgot' ? 'done' : 'next'}
          />

          {mode !== 'forgot' ? (
            <PasswordInput
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              returnKeyType={mode === 'signup' ? 'next' : 'done'}
              onSubmitEditing={mode === 'login' ? submit : undefined}
            />
          ) : null}

          {mode === 'signup' ? (
            <PasswordInput
              placeholder="Conferma password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
          ) : null}

          {error ? <Text style={[styles.message, { color: colors.danger }]}>{error}</Text> : null}
          {info ? <Text style={[styles.message, { color: colors.teal }]}>{info}</Text> : null}

          <Pressable
            onPress={submit}
            disabled={loading}
            style={[styles.button, { backgroundColor: colors.amber, opacity: loading ? 0.6 : 1 }]}
          >
            <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>
              {loading ? 'Un attimo…' : mode === 'login' ? 'Accedi' : mode === 'signup' ? 'Crea account' : 'Invia link'}
            </Text>
          </Pressable>

          {mode === 'login' ? (
            <>
              <Pressable onPress={() => switchMode('forgot')}>
                <Text style={[styles.link, { color: colors.textDim }]}>Password dimenticata?</Text>
              </Pressable>
              <Pressable onPress={() => switchMode('signup')}>
                <Text style={[styles.link, { color: colors.amber }]}>Non hai un account? Registrati</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingVertical: 40, gap: 14 },
  backBtn: { position: 'absolute', top: 8, left: 4, padding: 10 },
  mark: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13.5, textAlign: 'center', maxWidth: 280, lineHeight: 20, marginBottom: 6 },
  input: {
    width: '100%',
    maxWidth: 280,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
  },
  message: { fontSize: 12.5, textAlign: 'center', maxWidth: 280, lineHeight: 17 },
  button: { width: '100%', maxWidth: 280, paddingVertical: 13, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: 4 },
  buttonText: { fontWeight: '700', fontSize: 14 },
  link: { fontSize: 12.5, fontWeight: '600', marginTop: 4 },
});
