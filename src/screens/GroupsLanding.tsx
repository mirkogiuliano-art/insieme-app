import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme, RADIUS } from '@/theme/theme';
import { useAppStore, groupColor } from '@/lib/appStore';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import { BottomSheet } from '@/components/BottomSheet';
import { SettingsSheet } from '@/components/SettingsSheet';
import { LoadError } from '@/components/LoadError';
import { SettingsIcon, PlusIcon, ChevronIcon, UsersIcon } from '@/components/Icon';
import { createGroupWithMembership } from '@/lib/api/groups';
import { getInviteToken, rotateInvite, inviteUrl } from '@/lib/api/invites';
import { initials, withTimeout, WRITE_TIMEOUT } from '@/lib/utils';
import type { Group } from '@/types';

export function GroupsLanding() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { profile } = useAuth();
  const { myGroups, addGroup, loadError, refreshGroups } = useAppStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState<Group | null>(null);

  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState(false);

  const createGroup = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const meta = await withTimeout(createGroupWithMembership(newName.trim().slice(0, 40)), WRITE_TIMEOUT);
      addGroup(meta);
      setNewName('');
      setCreateOpen(false);
      setInviteOpen(meta);
    } catch (err) {
      setCreateError((err as { message?: string })?.message || 'Non sono riuscito a creare il gruppo, riprova.');
    } finally {
      setCreating(false);
    }
  };

  const shareInvite = async (g: Group) => {
    if (sharing) return;
    setSharing(true);
    try {
      const token = await withTimeout(getInviteToken(g.id).then((t) => t ?? rotateInvite(g.id)), WRITE_TIMEOUT);
      await Share.share({ message: `Entra nel gruppo "${g.name}" su Insieme:\n${inviteUrl(token)}` });
    } catch {
      toast.show('Non sono riuscito a preparare il link di invito.');
    } finally {
      setSharing(false);
    }
  };

  return (
    // Anche `bottom`: senza, la barra in fondo finisce sotto la barra di
    // navigazione di sistema, che in modalità edge-to-edge si sovrappone al
    // contenuto invece di restringere la finestra.
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.textFaint }]}>INSIEME</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>I tuoi gruppi</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setSettingsOpen(true)}
            style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <SettingsIcon size={17} color={colors.textDim} />
          </Pressable>
          <View style={[styles.meChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.meAvatar, { backgroundColor: colors.amber }]}>
              <Text style={[styles.meAvatarText, { color: colors.inkOnAmber }]}>{initials(profile?.displayName ?? '')}</Text>
            </View>
            <Text style={{ color: colors.textDim, fontSize: 12 }} numberOfLines={1}>
              {profile?.displayName}
            </Text>
          </View>
        </View>
      </View>

      {loadError ? <LoadError what="i tuoi gruppi" onRetry={refreshGroups} /> : null}

      <ScrollView contentContainerStyle={styles.list}>
        {myGroups.length === 0 && !loadError ? (
          <View style={styles.empty}>
            <UsersIcon size={38} color={colors.textFaint} />
            <Text style={[styles.emptyText, { color: colors.textFaint }]}>
              Non fai ancora parte di nessun gruppo. Creane uno, oppure fatti mandare un link di invito da chi è già dentro.
            </Text>
          </View>
        ) : (
          myGroups.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => router.push(`/group/${g.id}`)}
              style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.groupIcon, { backgroundColor: groupColor(g) }]}>
                <Text style={styles.groupIconText}>{g.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={[styles.groupSub, { color: colors.textFaint }]}>Gruppo condiviso</Text>
              </View>
              <ChevronIcon size={17} color={colors.textFaint} />
            </Pressable>
          ))
        )}
      </ScrollView>

      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <Pressable onPress={() => setCreateOpen(true)} style={[styles.actionPrimary, { backgroundColor: colors.amber }]}>
          <PlusIcon size={15} color={colors.inkOnAmber} />
          <Text style={[styles.actionPrimaryText, { color: colors.inkOnAmber }]}>Nuovo gruppo</Text>
        </Pressable>
      </View>

      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Crea gruppo */}
      <BottomSheet visible={createOpen} onClose={() => setCreateOpen(false)}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Nuovo gruppo</Text>
        <Text style={[styles.sheetSub, { color: colors.textDim }]}>
          Dai un nome al gruppo. Dopo la creazione avrai un link di invito da mandare a chi vuoi far entrare.
        </Text>
        <TextInput
          style={[styles.mInput, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
          placeholder="Es. Weekend a Milano"
          placeholderTextColor={colors.textFaint}
          value={newName}
          onChangeText={setNewName}
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={createGroup}
        />
        {createError ? <Text style={{ color: colors.danger, fontSize: 11.5, marginTop: -4, marginBottom: 8 }}>{createError}</Text> : null}
        <View style={styles.sheetActions}>
          <Pressable onPress={() => setCreateOpen(false)} style={[styles.btnSecondary, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
          </Pressable>
          <Pressable
            onPress={createGroup}
            disabled={creating}
            style={[styles.btnPrimary, { backgroundColor: colors.amber, opacity: creating ? 0.6 : 1 }]}
          >
            <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>{creating ? 'Un attimo…' : 'Crea gruppo'}</Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* Invito creato */}
      <BottomSheet visible={!!inviteOpen} onClose={() => setInviteOpen(null)}>
        {inviteOpen ? (
          <>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Gruppo creato</Text>
            <Text style={[styles.sheetSub, { color: colors.textDim }]}>
              Per far entrare qualcuno in &quot;{inviteOpen.name}&quot; mandagli il link di invito: è
              l&apos;unico modo per accedere al gruppo. Puoi disattivarlo quando vuoi da Info gruppo.
            </Text>
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => shareInvite(inviteOpen)}
                disabled={sharing}
                style={[styles.btnSecondary, { borderColor: colors.border, opacity: sharing ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.textDim, fontWeight: '600' }}>
                  {sharing ? 'Un attimo…' : 'Condividi invito'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const g = inviteOpen;
                  setInviteOpen(null);
                  router.push(`/group/${g.id}`);
                }}
                style={[styles.btnPrimary, { backgroundColor: colors.amber }]}
              >
                <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>Vai al gruppo</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: { fontSize: 10, letterSpacing: 1.1, fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  meChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 999, paddingLeft: 6, paddingRight: 11, paddingVertical: 5, maxWidth: 120 },
  meAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  meAvatarText: { fontSize: 10, fontWeight: '700' },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30, paddingTop: 80 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
  groupCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.md, padding: 13 },
  groupIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  groupIconText: { fontWeight: '700', fontSize: 17, color: '#1B2530' },
  groupName: { fontSize: 14.5, fontWeight: '600' },
  groupSub: { fontSize: 10.5, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1 },
  actionPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: RADIUS.sm },
  actionPrimaryText: { fontWeight: '700', fontSize: 13 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  sheetSub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  mInput: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, marginBottom: 10 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center' },
  btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
});
