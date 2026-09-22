import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/authStore';
import { useAppStore } from '@/lib/appStore';
import { useTheme, FONT_ROUNDED } from '@/theme/theme';
import { Logo } from '@/components/Logo';
import { AuthScreen } from '@/screens/AuthScreen';
import { NameOnboarding } from '@/screens/NameOnboarding';
import { GroupsLanding } from '@/screens/GroupsLanding';
import { ScreenGlow } from '@/components/ScreenGlow';

/** L'attesa all'avvio: il marchio com'è nella pagina d'accesso, così
 * l'app si riconosce già mentre carica. */
function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ScreenGlow />
      <Logo size={92} />
      <Text style={{ fontFamily: FONT_ROUNDED, fontSize: 40, letterSpacing: -0.8, marginTop: -4, color: colors.text }}>Insieme</Text>
      <ActivityIndicator color={colors.amber} style={{ marginTop: 22 }} />
    </View>
  );
}

export default function Index() {
  const { ready: authReady, session, profile, pendingInviteToken } = useAuth();
  const { ready: groupsReady } = useAppStore();

  if (!authReady) return <Loading />;

  if (!session) return <AuthScreen />;
  if (!profile?.displayName) return <NameOnboarding />;

  if (!groupsReady) return <Loading />;

  // Se l'accesso è partito da un link d'invito, si torna a riscattarlo
  // invece di finire sulla lista gruppi. È app/invite/[token].tsx a
  // ripulire il token una volta usato: farlo qui, durante il render,
  // rischierebbe che React scarti questo giro prima del reindirizzamento.
  if (pendingInviteToken) {
    return <Redirect href={`/invite/${pendingInviteToken}`} />;
  }

  return <GroupsLanding />;
}
