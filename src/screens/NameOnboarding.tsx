import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, RADIUS } from '@/theme/theme';
import { ChatIcon } from '@/components/Icon';
import { useAuth } from '@/lib/authStore';
import { updateDisplayName } from '@/lib/api/profiles';

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.inner}>
        <View style={[styles.mark, { backgroundColor: colors.amber }]}>
          <ChatIcon size={26} color={colors.inkOnAmber} strokeWidth={1.8} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Insieme</Text>
        <Text style={[styles.subtitle, { color: colors.textDim }]}>
          Uno spazio condiviso per chattare, salvare video e segnare i posti da non perdere, gruppo per gruppo.
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder="Come ti chiami?"
          placeholderTextColor={colors.textFaint}
          value={value}
          onChangeText={setValue}
          maxLength={24}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        <Pressable
          onPress={submit}
          disabled={!value.trim() || saving}
          style={[styles.button, { backgroundColor: colors.amber, opacity: value.trim() && !saving ? 1 : 0.4 }]}
        >
          <Text style={[styles.buttonText, { color: colors.inkOnAmber }]}>{saving ? 'Un attimo…' : 'Entra'}</Text>
        </Pressable>
        <Text style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 2 }}>
          Accesso come {session?.user.email}
        </Text>
        <Pressable onPress={signOut}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.textDim }}>Non sei tu? Esci</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 16 },
  mark: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13.5, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
  input: {
    width: '100%',
    maxWidth: 280,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 4,
  },
  button: { width: '100%', maxWidth: 280, paddingVertical: 13, borderRadius: RADIUS.sm, alignItems: 'center' },
  buttonText: { fontWeight: '700', fontSize: 14 },
});
