import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTheme } from '@/theme/theme';
import { Field } from '@/components/Field';
import { useAuth } from '@/lib/authStore';
import { updateDisplayName } from '@/lib/api/profiles';
import { initials } from '@/lib/utils';
import { ScreenGlow } from '@/components/ScreenGlow';

/**
 * Il nome, al primo ingresso. Le iniziali grandi si formano mentre si
 * scrive: sono quelle che gli altri vedranno accanto ai messaggi, nello
 * stesso quadrato del Profilo.
 */
export function NameOnboarding() {
  const { colors } = useTheme();
  const { session, refreshProfile, signOut } = useAuth();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!value.trim() || saving) return;
    setSaving(true);
    await updateDisplayName(value);
    await refreshProfile();
    setSaving(false);
  };

  const ready = !!value.trim();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScreenGlow />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
        <View style={styles.inner}>
          <View style={styles.column}>
            <Text style={[styles.title, { color: colors.text }]}>Come ti chiami?</Text>
            <Text style={[styles.subtitle, { color: colors.textDim }]}>È il nome che vedono gli altri nei gruppi.</Text>
            <View style={[styles.avatar, { backgroundColor: ready ? colors.amber : colors.surface }]}>
              <Text style={[styles.avatarText, { color: ready ? colors.inkOnAmber : colors.textFaint }]}>
                {ready ? initials(value) : '?'}
              </Text>
            </View>
            <Field
              placeholder="Il tuo nome"
              value={value}
              onChangeText={setValue}
              maxLength={24}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submit}
              style={styles.field}
            />
            <Pressable
              onPress={submit}
              disabled={!ready || saving}
              style={[styles.button, { backgroundColor: colors.amber, opacity: ready && !saving ? 1 : 0.45 }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.inkOnAmber} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>Continua</Text>
              )}
            </Pressable>
            <Text style={[styles.account, { color: colors.textFaint }]}>Accesso come {session?.user.email}</Text>
            <Pressable onPress={signOut}>
              <Text style={[styles.link, { color: colors.textDim }]}>Non sei tu? Esci</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
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
