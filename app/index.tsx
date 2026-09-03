import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/authStore';
import { useAppStore } from '@/lib/appStore';
import { useTheme } from '@/theme/theme';
import { AuthScreen } from '@/screens/AuthScreen';
import { NameOnboarding } from '@/screens/NameOnboarding';
import { GroupsLanding } from '@/screens/GroupsLanding';

export default function Index() {
  const { ready: authReady, session, profile, pendingInviteToken } = useAuth();
  const { ready: groupsReady } = useAppStore();
  const { colors } = useTheme();

  if (!authReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  if (!session) return <AuthScreen />;
  if (!profile?.displayName) return <NameOnboarding />;

  if (!groupsReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  // Se l'accesso è partito da un link d'invito, si torna a riscattarlo
  // invece di finire sulla lista gruppi. È app/invite/[token].tsx a
  // ripulire il token una volta usato: farlo qui, durante il render,
  // rischierebbe che React scarti questo giro prima del reindirizzamento.
  if (pendingInviteToken) {
    return <Redirect href={`/invite/${pendingInviteToken}`} />;
  }

  return <GroupsLanding />;
}
