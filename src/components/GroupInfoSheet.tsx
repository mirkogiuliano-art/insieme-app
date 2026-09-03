import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Share } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';
import { useAuth } from '@/lib/authStore';
import { groupColor } from '@/lib/appStore';
import { useToast } from '@/components/Toast';
import { ShareIcon } from '@/components/Icon';
import { listLastReads, subscribeToLastReads } from '@/lib/api/groupMembers';
import { getInviteToken, rotateInvite, revokeInvite, inviteUrl } from '@/lib/api/invites';
import { initials, colorForUser, dateLabel } from '@/lib/utils';
import type { Group } from '@/types';

interface GroupInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  group: Group;
  roster: Record<string, string>;
}

function lastSeenLabel(ts: number | null | undefined): string {
  if (ts == null) return 'Mai aperta';
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'proprio ora';
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'ora' : 'ore'} fa`;
  return dateLabel(ts);
}

export function GroupInfoSheet({ visible, onClose, group, roster }: GroupInfoSheetProps) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const toast = useToast();
  const [lastReads, setLastReads] = useState<Record<string, number | null>>({});
  // `undefined` = non ancora letto, `null` = nessun invito attivo.
  const [inviteToken, setInviteToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    getInviteToken(group.id).then(setInviteToken);
  }, [visible, group.id]);

  const shareLink = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const token = inviteToken ?? (await rotateInvite(group.id));
      setInviteToken(token);
      await Share.share({ message: `Entra nel gruppo "${group.name}" su Insieme:\n${inviteUrl(token)}` });
    } catch {
      toast.show('Non sono riuscito a preparare il link.');
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setInviteToken(await rotateInvite(group.id));
      toast.show('Nuovo link creato. Il precedente non funziona più.');
    } catch {
      toast.show('Non sono riuscito a creare il nuovo link.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await revokeInvite(group.id);
      setInviteToken(null);
      toast.show('Link disattivato.');
    } catch {
      toast.show('Non sono riuscito a disattivare il link.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    listLastReads(group.id).then((data) => {
      if (!cancelled) setLastReads(data);
    });
    const unsubscribe = subscribeToLastReads(group.id, (userId, lastReadAt) => {
      setLastReads((prev) => ({ ...prev, [userId]: lastReadAt }));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [visible, group.id]);

  const members = Object.entries(roster).sort(([a], [b]) => (a === session?.user.id ? -1 : b === session?.user.id ? 1 : 0));

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <View style={[styles.groupAvatar, { backgroundColor: groupColor(group) }]}>
          <Text style={styles.groupAvatarText}>{group.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={[styles.groupName, { color: colors.text }]}>{group.name}</Text>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textDim }]}>LINK DI INVITO</Text>
      <Text style={[styles.inviteNote, { color: colors.textFaint }]}>
        {inviteToken === undefined
          ? 'Un attimo…'
          : inviteToken
            ? 'Chiunque abbia il link può entrare nel gruppo. Disattivalo se finisce dove non doveva.'
            : 'Nessun link attivo: al momento non può entrare nessuno. Creane uno per invitare qualcuno.'}
      </Text>
      <Pressable
        onPress={shareLink}
        disabled={busy || inviteToken === undefined}
        style={[styles.inviteBtn, { backgroundColor: colors.amber, opacity: busy || inviteToken === undefined ? 0.6 : 1 }]}
      >
        <ShareIcon size={15} color={colors.inkOnAmber} />
        <Text style={{ color: colors.inkOnAmber, fontWeight: '700', fontSize: 13 }}>
          {inviteToken ? 'Condividi il link' : 'Crea e condividi il link'}
        </Text>
      </Pressable>
      {inviteToken ? (
        <View style={styles.inviteActions}>
          <Pressable onPress={regenerate} disabled={busy} style={[styles.inviteMinor, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textDim, fontSize: 12.5, fontWeight: '600' }}>Genera nuovo</Text>
          </Pressable>
          <Pressable onPress={revoke} disabled={busy} style={[styles.inviteMinor, { borderColor: colors.border }]}>
            <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '600' }}>Disattiva</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, { color: colors.textDim }]}>MEMBRI — {members.length}</Text>
      <View style={{ gap: 2 }}>
        {members.map(([userId, name]) => {
          const isMe = userId === session?.user.id;
          return (
            <View key={userId} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.memberAvatar, { backgroundColor: colorForUser(name) }]}>
                <Text style={styles.memberAvatarText}>{initials(name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.memberName, { color: colors.text }]}>
                  {name}
                  {isMe ? ' (tu)' : ''}
                </Text>
                {!isMe ? (
                  <Text style={[styles.memberSeen, { color: colors.textFaint }]}>
                    Ultimo accesso: {lastSeenLabel(lastReads[userId])}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 4, marginBottom: 18 },
  groupAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  groupAvatarText: { fontSize: 22, fontWeight: '700', color: '#1B2530' },
  groupName: { fontSize: 18, fontWeight: '700' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  inviteNote: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: RADIUS.sm,
  },
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  inviteMinor: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: RADIUS.sm, borderWidth: 1 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  memberAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 13, fontWeight: '700', color: '#1B2530' },
  memberName: { fontSize: 14.5, fontWeight: '600' },
  memberSeen: { fontSize: 11.5, marginTop: 1 },
});
