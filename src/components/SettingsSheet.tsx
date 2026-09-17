import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';
import { SunIcon, MoonIcon } from '@/components/Icon';
import { useAppStore } from '@/lib/appStore';
import { useAuth } from '@/lib/authStore';
import { updateDisplayName } from '@/lib/api/profiles';
import { countMembers } from '@/lib/api/groupMembers';
import { deleteMyAccount } from '@/lib/api/account';
import { listBlockedWithNames, unblockUser } from '@/lib/api/moderation';
import { PRIVACY_URL, TERMINI_URL, haiPubblicatoIDocumenti } from '@/lib/legal';
import type { ThemeName } from '@/types';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  groupId?: string;
  onLeaveGroup?: () => void;
}

/** Passaggio di conferma mostrato al posto del contenuto del foglio.
 * Usiamo questo invece di `Alert.alert` sia per coerenza grafica con il
 * resto dell'app (stesso schema dell'eliminazione di categorie e posti),
 * sia perché `Alert.alert` non fa assolutamente nulla su web in
 * react-native-web: lì i due pulsanti erano semplicemente inerti. */
type Confirm = 'signout' | 'leave' | 'delete-account';

export function SettingsSheet({ visible, onClose, groupId, onLeaveGroup }: SettingsSheetProps) {
  const { colors, theme, setTheme } = useTheme();
  const { leaveGroup } = useAppStore();
  const { profile, refreshProfile, signOut } = useAuth();
  const [nameDraft, setNameDraft] = useState(profile?.displayName ?? '');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  // Solo la cancellazione dell'account mostra i propri errori: se non
  // riesce, lasciar credere che i dati siano spariti sarebbe la bugia
  // peggiore che quest'app possa raccontare.
  const [confirmError, setConfirmError] = useState('');
  // Quanti membri restano: se si è soli, uscire elimina il gruppo con tutto
  // il suo contenuto, e va detto prima e non dopo.
  const [memberCount, setMemberCount] = useState<number | null>(null);
  /** Le persone bloccate: questa è l'unica strada per sbloccarle, quindi
   * la sezione compare solo quando ce n'è almeno una. */
  const [bloccati, setBloccati] = useState<{ id: string; name: string }[]>([]);

  // Riaprendo le impostazioni si riparte sempre dall'elenco, mai da una
  // conferma rimasta a metà.
  useEffect(() => {
    if (visible) {
      setConfirm(null);
      setBusy(false);
      setConfirmError('');
      listBlockedWithNames().then(setBloccati);
    }
  }, [visible]);

  useEffect(() => {
    if (confirm !== 'leave' || !groupId) return;
    let alive = true;
    countMembers(groupId).then((n) => {
      if (alive) setMemberCount(n);
    });
    return () => {
      alive = false;
    };
  }, [confirm, groupId]);

  const closeSheet = () => {
    setConfirm(null);
    onClose();
  };

  const saveName = async () => {
    if (nameDraft.trim()) {
      await updateDisplayName(nameDraft);
      await refreshProfile();
    } else {
      setNameDraft(profile?.displayName ?? '');
    }
  };

  const runSignOut = async () => {
    if (busy) return;
    setBusy(true);
    closeSheet();
    await signOut();
  };

  const runLeave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (groupId) await leaveGroup(groupId);
      closeSheet();
      onLeaveGroup?.();
    } finally {
      setBusy(false);
    }
  };

  /** La cancellazione dell'account è l'unica operazione senza ritorno e
   * senza rete di sicurezza: il foglio resta aperto se fallisce, e si
   * chiude solo quando l'account non c'è più davvero. Al termine non
   * serve uscire a mano — sparito l'utente, la sessione decade e l'app
   * torna da sola alla schermata di accesso. */
  const runDeleteAccount = async () => {
    if (busy) return;
    setBusy(true);
    setConfirmError('');
    try {
      await deleteMyAccount();
      closeSheet();
      await signOut();
    } catch (err) {
      setConfirmError(
        (err as { message?: string })?.message ||
          'Non sono riuscito a eliminare l’account. Riprova, o scrivici se il problema resta.',
      );
    } finally {
      setBusy(false);
    }
  };

  const lastOne = memberCount === 1;

  const CONFIRMS: Record<Confirm, { title: string; body: string; action: string; onConfirm: () => void }> = {
    signout: {
      title: 'Uscire da Insieme?',
      body: 'Dovrai accedere di nuovo con email e password. I tuoi gruppi e i messaggi restano dove sono.',
      action: 'Esci',
      onConfirm: runSignOut,
    },
    leave: {
      title: lastOne ? 'Sei l’ultimo rimasto' : 'Lasciare il gruppo?',
      body: lastOne
        ? 'Uscendo, il gruppo verrà eliminato per intero: chat, link, posti e categorie. Non si può annullare.'
        : 'Non vedrai più chat, link e posti di questo gruppo. Per rientrare ti servirà un nuovo link di invito.',
      action: lastOne ? 'Esci ed elimina' : 'Lascia',
      onConfirm: runLeave,
    },
    'delete-account': {
      title: 'Eliminare il tuo account?',
      body:
        'Spariscono per sempre il tuo profilo, i tuoi messaggi, i link e i posti che hai aggiunto, in tutti i gruppi. ' +
        'I gruppi in cui resta qualcun altro continuano a esistere senza di te; quelli in cui eri solo vengono eliminati per intero. ' +
        'Non si può annullare e non serve altro: la cancellazione è immediata.',
      action: 'Elimina tutto',
      onConfirm: runDeleteAccount,
    },
  };

  const ThemeOpt = ({ value, label, icon }: { value: ThemeName; label: string; icon: React.ReactNode }) => {
    const active = theme === value;
    return (
      <Pressable
        onPress={() => setTheme(value)}
        style={[
          styles.themeOpt,
          { borderColor: active ? colors.amber : colors.border, backgroundColor: active ? colors.surface2 : 'transparent' },
        ]}
      >
        {icon}
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: active ? colors.text : colors.textDim }}>{label}</Text>
      </Pressable>
    );
  };

  if (confirm) {
    const c = CONFIRMS[confirm];
    return (
      <BottomSheet visible={visible} onClose={closeSheet}>
        <Text style={[styles.title, { color: colors.text }]}>{c.title}</Text>
        <Text style={[styles.confirmBody, { color: colors.textDim }]}>{c.body}</Text>
        {confirmError ? (
          <Text style={[styles.confirmError, { color: colors.danger }]}>{confirmError}</Text>
        ) : null}
        <View style={styles.confirmActions}>
          <Pressable
            onPress={() => setConfirm(null)}
            disabled={busy}
            style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}
          >
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
          </Pressable>
          <Pressable
            onPress={c.onConfirm}
            disabled={busy}
            style={[styles.btnPrimary, { backgroundColor: colors.danger, opacity: busy ? 0.6 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>{c.action}</Text>
            )}
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={closeSheet}>
      <Text style={[styles.title, { color: colors.text }]}>Impostazioni</Text>

      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.textDim }]}>IL TUO NOME</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
          value={nameDraft}
          onChangeText={setNameDraft}
          onBlur={saveName}
          onSubmitEditing={saveName}
          maxLength={24}
          returnKeyType="done"
        />
      </View>

      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.textDim }]}>TEMA</Text>
        <View style={styles.themeToggle}>
          <ThemeOpt value="light" label="Chiaro" icon={<SunIcon size={18} color={theme === 'light' ? colors.text : colors.textDim} />} />
          <ThemeOpt value="dark" label="Scuro" icon={<MoonIcon size={18} color={theme === 'dark' ? colors.text : colors.textDim} />} />
        </View>
      </View>

      {groupId ? (
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textDim }]}>GRUPPO ATTUALE</Text>
          <Text style={{ color: colors.textDim, fontSize: 12.5 }}>
            Per invitare qualcuno usa il link di invito, in Info gruppo.
          </Text>
        </View>
      ) : null}

      {groupId ? (
        <Pressable onPress={() => setConfirm('leave')} style={styles.leaveBtn}>
          <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Lascia questo gruppo</Text>
        </Pressable>
      ) : null}

      {bloccati.length > 0 ? (
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textDim }]}>PERSONE BLOCCATE</Text>
          {bloccati.map((p) => (
            <View key={p.id} style={styles.bloccatoRow}>
              <Text style={{ color: colors.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>
                {p.name}
              </Text>
              <Pressable
                onPress={async () => {
                  await unblockUser(p.id);
                  setBloccati((prev) => prev.filter((x) => x.id !== p.id));
                }}
              >
                <Text style={{ color: colors.teal, fontSize: 12.5, fontWeight: '700' }}>Sblocca</Text>
              </Pressable>
            </View>
          ))}
          <Text style={{ color: colors.textFaint, fontSize: 11.5, lineHeight: 16 }}>
            I loro messaggi non ti compaiono nelle chat. Riaprendo una chat dopo lo sblocco tornano visibili.
          </Text>
        </View>
      ) : null}

      {haiPubblicatoIDocumenti ? (
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textDim }]}>DOCUMENTI</Text>
          <View style={styles.legalRow}>
            {PRIVACY_URL ? (
              <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
                <Text style={[styles.legalLink, { color: colors.teal }]}>Informativa privacy</Text>
              </Pressable>
            ) : null}
            {TERMINI_URL ? (
              <Pressable onPress={() => Linking.openURL(TERMINI_URL)}>
                <Text style={[styles.legalLink, { color: colors.teal }]}>Condizioni d&apos;uso</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <Pressable onPress={() => setConfirm('signout')} style={styles.leaveBtn}>
        <Text style={{ color: colors.textDim, fontSize: 13, fontWeight: '600' }}>Esci</Text>
      </Pressable>

      {/* In fondo e staccata da tutto il resto: è l'unica azione da cui
          non si torna indietro. */}
      <Pressable onPress={() => setConfirm('delete-account')} style={styles.deleteBtn}>
        <Text style={{ color: colors.textFaint, fontSize: 12.5, fontWeight: '600' }}>Elimina il tuo account</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  row: { paddingVertical: 13, borderBottomWidth: 1, gap: 9 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  input: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5 },
  themeToggle: { flexDirection: 'row', gap: 8 },
  themeOpt: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  leaveBtn: { paddingVertical: 14, alignItems: 'center' },
  deleteBtn: { paddingTop: 2, paddingBottom: 10, alignItems: 'center' },
  bloccatoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  legalRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap' },
  legalLink: { fontSize: 12.5, fontWeight: '600' },
  confirmBody: { fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 16 },
  confirmError: { fontSize: 12.5, lineHeight: 18, marginTop: -8, marginBottom: 14 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  btnSecondary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
  btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
});
