import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { PasswordInput } from '@/components/PasswordInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, RADIUS, FONT_ROUNDED } from '@/theme/theme';
import { BackIcon, MailIcon, CheckIcon } from '@/components/Icon';
import { Field } from '@/components/Field';
import { Logo } from '@/components/Logo';
import { PRIVACY_URL, TERMINI_URL } from '@/lib/legal';
import { supabase } from '@/lib/supabase';
import { ScreenGlow } from '@/components/ScreenGlow';

type Mode = 'login' | 'signup' | 'forgot';

/** Quanto deve essere lunga una password nuova. */
const MIN_PASSWORD = 8;

export function AuthScreen() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  /** L'indirizzo a cui è appena partito il link per la nuova password: da
   * lì la schermata diventa "Controlla la posta". */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setSentTo(null);
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
      setSentTo(cleanEmail);
      return;
    }

    if (!password) {
      setError('Inserisci la password.');
      return;
    }

    if (mode === 'signup') {
      if (password.length < MIN_PASSWORD) {
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

  const busy = loading ? <ActivityIndicator size="small" color={colors.inkOnAmber} /> : null;
  const lengthOk = password.length >= MIN_PASSWORD;
  const matchOk = !!confirmPassword && password === confirmPassword;

  /** Un requisito della password che si spunta mentre si scrive. */
  const Requirement = ({ ok, label }: { ok: boolean; label: string }) => (
    <View style={styles.req}>
      <View style={[styles.reqDot, { backgroundColor: ok ? colors.teal : colors.surface2 }]}>
        {ok ? <CheckIcon size={10} color={colors.bg} /> : null}
      </View>
      <Text style={[styles.reqText, { color: ok ? colors.teal : colors.textFaint }]}>{label}</Text>
    </View>
  );

  const content =
    mode === 'forgot' && sentTo ? (
      // ── Link partito ──
      <>
        <View style={[styles.bigIcon, { backgroundColor: colors.surface }]}>
          <MailIcon size={34} color={colors.amber} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Controlla la posta</Text>
        <Text style={[styles.subtitle, { color: colors.textDim }]}>
          Abbiamo mandato un link a{'\n'}
          <Text style={{ color: colors.text, fontWeight: '700' }}>{sentTo}</Text>.{'\n'}Aprilo dal telefono per scegliere una
          nuova password.
        </Text>
        <Pressable onPress={() => switchMode('login')} style={[styles.button, { backgroundColor: colors.surface }]}>
          <Text style={[styles.buttonText, { color: colors.text }]}>Torna all’accesso</Text>
        </Pressable>
        <Pressable onPress={submit} disabled={loading}>
          <Text style={[styles.link, { color: colors.textDim }]}>{loading ? 'Un attimo…' : 'Non è arrivato? Rimandalo'}</Text>
        </Pressable>
        {error ? <Text style={[styles.message, { color: colors.danger }]}>{error}</Text> : null}
      </>
    ) : mode === 'forgot' ? (
      // ── Password dimenticata ──
      <>
        <Text style={[styles.title, { color: colors.text }]}>Password dimenticata</Text>
        <Text style={[styles.subtitle, { color: colors.textDim }]}>
          Scrivi l’email con cui ti sei registrato: ti mandiamo un link per sceglierne una nuova.
        </Text>
        <Field
          icon={<MailIcon size={16} color={colors.textFaint} />}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="send"
          onSubmitEditing={submit}
        />
        {error ? <Text style={[styles.message, { color: colors.danger }]}>{error}</Text> : null}
        <Pressable onPress={submit} disabled={loading} style={[styles.button, { backgroundColor: colors.amber, opacity: loading ? 0.6 : 1 }]}>
          {busy ?? <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>Mandami il link</Text>}
        </Pressable>
      </>
    ) : (
      // ── Accedi / Registrati ──
      <>
        {/* Il marchio senza piastrella, e il nome nel carattere delle schede
            dei gruppi: è il primo incontro con l'app. */}
        <View style={styles.brand}>
          <Logo size={mode === 'login' ? 92 : 64} />
          <Text style={[styles.wordmark, { color: colors.text, fontSize: mode === 'login' ? 40 : 30 }]}>Insieme</Text>
          {mode === 'login' ? (
            <>
              <Text style={[styles.tagline, { color: colors.text }]}>Tutto quello che vuoi vivere,{'\n'}in un posto solo.</Text>
              {/* Lo slogan dice il perché, questa riga i due modi di usarla. */}
              <Text style={[styles.taglineSub, { color: colors.textDim }]}>
                Organizza un viaggio con i tuoi amici,{'\n'}o salva i posti dove vuoi andare.
              </Text>
            </>
          ) : null}
        </View>

        {/* Le due strade come le due voci di un selettore, invece di un
            link in fondo: si vede subito che ce ne sono due. */}
        <View style={[styles.seg, { backgroundColor: colors.surface }]}>
          {(['login', 'signup'] as const).map((k) => (
            <Pressable key={k} onPress={() => switchMode(k)} style={[styles.segBtn, mode === k && { backgroundColor: colors.amber }]}>
              <Text style={[styles.segText, { color: mode === k ? colors.inkOnAmber : colors.textDim }]}>
                {k === 'login' ? 'Accedi' : 'Registrati'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field
          icon={<MailIcon size={16} color={colors.textFaint} />}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="next"
        />
        <PasswordInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          returnKeyType={mode === 'signup' ? 'next' : 'done'}
          onSubmitEditing={mode === 'login' ? submit : undefined}
        />
        {mode === 'signup' ? (
          <>
            <PasswordInput
              placeholder="Conferma password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            <View style={styles.reqs}>
              <Requirement ok={lengthOk} label={`Almeno ${MIN_PASSWORD} caratteri`} />
              <Requirement ok={matchOk} label="Le due password coincidono" />
            </View>
          </>
        ) : null}

        {error ? <Text style={[styles.message, { color: colors.danger }]}>{error}</Text> : null}
        {info ? <Text style={[styles.message, { color: colors.teal }]}>{info}</Text> : null}

        <Pressable onPress={submit} disabled={loading} style={[styles.button, { backgroundColor: colors.amber, opacity: loading ? 0.6 : 1 }]}>
          {busy ?? (
            <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>{mode === 'login' ? 'Accedi' : 'Crea l’account'}</Text>
          )}
        </Pressable>

        {/* L'accettazione è un fatto, non una casella da spuntare: si
            dichiara al momento in cui si crea l'account. I due nomi
            diventano toccabili solo quando i documenti sono davvero
            pubblicati, così non si offrono collegamenti che non
            portano da nessuna parte. */}
        {mode === 'signup' ? (
          <Text style={[styles.legale, { color: colors.textFaint }]}>
            Creando un account accetti le{' '}
            {TERMINI_URL ? (
              <Text style={{ color: colors.teal }} onPress={() => Linking.openURL(TERMINI_URL)}>
                condizioni d&apos;uso
              </Text>
            ) : (
              <Text>condizioni d&apos;uso</Text>
            )}{' '}
            e l&apos;
            {PRIVACY_URL ? (
              <Text style={{ color: colors.teal }} onPress={() => Linking.openURL(PRIVACY_URL)}>
                informativa sulla privacy
              </Text>
            ) : (
              <Text>informativa sulla privacy</Text>
            )}
            .
          </Text>
        ) : (
          <Pressable onPress={() => switchMode('forgot')}>
            <Text style={[styles.link, { color: colors.textDim }]}>Password dimenticata?</Text>
          </Pressable>
        )}
      </>
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScreenGlow />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          {mode === 'forgot' ? (
            <Pressable onPress={() => switchMode('login')} style={[styles.backBtn, { backgroundColor: colors.surface }]} hitSlop={10}>
              <BackIcon size={18} color={colors.textDim} />
            </Pressable>
          ) : null}
          <View style={styles.column}>{content}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  column: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 12 },
  backBtn: { position: 'absolute', top: 12, left: 16, width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: 10 },
  wordmark: { fontFamily: FONT_ROUNDED, letterSpacing: -0.8, marginTop: -4 },
  tagline: { fontSize: 15, fontWeight: '700', textAlign: 'center', lineHeight: 21, marginTop: 4 },
  taglineSub: { fontSize: 13, textAlign: 'center', lineHeight: 18.5, marginTop: 8 },
  seg: { width: '100%', flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, marginBottom: 4 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11 },
  segText: { fontSize: 13.5, fontWeight: '800' },
  bigIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
  reqs: { alignSelf: 'flex-start', gap: 5, paddingLeft: 4 },
  req: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  reqDot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  reqText: { fontSize: 12, fontWeight: '700' },
  legale: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 2 },
  message: { fontSize: 12.5, textAlign: 'center', lineHeight: 17 },
  button: { width: '100%', height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontWeight: '800', fontSize: 15 },
  link: { fontSize: 13, fontWeight: '700', marginTop: 4 },
});
