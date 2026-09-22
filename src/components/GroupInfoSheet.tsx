import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Share, ActivityIndicator } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';
import { useAuth } from '@/lib/authStore';
import { groupColor, useAppStore } from '@/lib/appStore';
import { useToast } from '@/components/Toast';
import { ShareIcon, LogoutIcon } from '@/components/Icon';
import { listLastReads, subscribeToLastReads, countMembers } from '@/lib/api/groupMembers';
import { getInviteToken, rotateInvite, revokeInvite, inviteUrl } from '@/lib/api/invites';
import { initials, colorForUser, dateLabel } from '@/lib/utils';
import type { Group } from '@/types';

interface GroupInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  group: Group;
  roster: Record<string, string>;
  /** Chiamata dopo l'uscita dal gruppo: chi apre il foglio sa dove portare
   * la persona, visto che la schermata del gruppo non ha più senso. */
  onLeaveGroup: () => void;
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

export function GroupInfoSheet({ visible, onClose, group, roster, onLeaveGroup }: GroupInfoSheetProps) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const toast = useToast();
  const [lastReads, setLastReads] = useState<Record<string, number | null>>({});
  // `undefined` = non ancora letto, `null` = nessun invito attivo.
  const [inviteToken, setInviteToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const { leaveGroup } = useAppStore();
  /** Conferma per l'uscita dal gruppo, mostrata al posto del contenuto
   * del foglio (vedi SettingsSheet per il perché non si usa Alert). */
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Quanti membri restano: se si è soli, uscire elimina il gruppo con tutto
  // il suo contenuto, e va detto prima e non dopo.
  const [memberCount, setMemberCount] = useState<number | null>(null);

  // Riaprendo il foglio si riparte dalle informazioni, mai da una
  // conferma rimasta a metà.
  useEffect(() => {
    if (visible) setConfirmLeave(false);
  }, [visible]);

  useEffect(() => {
    if (!confirmLeave) return;
    let alive = true;
    countMembers(group.id).then((n) => {
      if (alive) setMemberCount(n);
    });
    return () => {
      alive = false;
    };
  }, [confirmLeave, group.id]);

  const runLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await leaveGroup(group.id);
      onClose();
      onLeaveGroup();
    } catch {
      toast.show('Non sono riuscito a farti uscire dal gruppo, riprova.');
    } finally {
      setLeaving(false);
    }
  };

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

  if (confirmLeave) {
    const lastOne = memberCount === 1;
    return (
      <BottomSheet visible={visible} onClose={onClose}>
        <Text style={[styles.confirmTitle, { color: colors.text }]}>
          {lastOne ? 'Sei l’ultimo rimasto' : 'Lasciare il gruppo?'}
        </Text>
        <Text style={[styles.confirmBody, { color: colors.textDim }]}>
          {lastOne
            ? 'Uscendo, il gruppo verrà eliminato per intero: chat, link, posti e categorie. Non si può annullare.'
            : 'Non vedrai più chat, link e posti di questo gruppo. Per rientrare ti servirà un nuovo link di invito.'}
        </Text>
        <View style={styles.confirmActions}>
          <Pressable
            onPress={() => setConfirmLeave(false)}
            disabled={leaving}
            style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}
          >
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
          </Pressable>
          <Pressable
            onPress={runLeave}
            disabled={leaving}
            style={[styles.btnPrimary, { backgroundColor: colors.danger, opacity: leaving ? 0.6 : 1 }]}
          >
            {leaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>{lastOne ? 'Esci ed elimina' : 'Lascia'}</Text>
            )}
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

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

      <Text style={[styles.sectionLabel, styles.membersLabel, { color: colors.textDim }]}>MEMBRI — {members.length}</Text>
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

      {/* In fondo e staccata dal resto: è una cosa del gruppo, quindi sta
          qui e non nelle impostazioni, ma è anche l'unica che ti porta
          fuori. Passa da una conferma. */}
      <Pressable onPress={() => setConfirmLeave(true)} style={[styles.leaveRow, { backgroundColor: colors.surface2 }]}>
        <View style={[styles.leaveIcon, { backgroundColor: colors.danger + '26' }]}>
          <LogoutIcon size={15} color={colors.danger} strokeWidth={2} />
        </View>
        <Text style={{ color: colors.danger, fontSize: 14.5, fontWeight: '600' }}>Lascia il gruppo</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 4, marginBottom: 18 },
  groupAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  groupAvatarText: { fontSize: 22, fontWeight: '700', color: '#1B2530' },
  groupName: { fontSize: 18, fontWeight: '700' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  // Solo qui e non su "LINK DI INVITO": quella etichetta segue già il
  // margine del blocco con nome e avatar del gruppo, che le dà abbastanza
  // spazio da sé.
  membersLabel: { marginTop: 20 },
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
  leaveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    marginTop: 26, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 11, borderRadius: RADIUS.md,
  },
  leaveIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  confirmBody: { fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 16 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  btnSecondary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
  btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
});
