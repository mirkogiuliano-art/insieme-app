import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import Constants from 'expo-constants';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';
import {
  SunIcon,
  MoonIcon,
  AutoThemeIcon,
  BanIcon,
  ChevronIcon,
  BackIcon,
  EditIcon,
  ShieldIcon,
  FileIcon,
  ExternalIcon,
  LogoutIcon,
  TrashIcon,
} from '@/components/Icon';
import { useAuth } from '@/lib/authStore';
import { updateDisplayName } from '@/lib/api/profiles';
import { deleteMyAccount } from '@/lib/api/account';
import { listBlockedWithNames, unblockUser } from '@/lib/api/moderation';
import { initials } from '@/lib/utils';
import { PRIVACY_URL, TERMINI_URL, haiPubblicatoIDocumenti } from '@/lib/legal';
import type { ThemePreference } from '@/types';

/**
 * Le pagine del foglio. Le impostazioni vere sono poche (aspetto e persone
 * bloccate); tutto ciò che riguarda la persona e il suo account sta in
 * "Profilo", raggiungibile da qui o direttamente toccando le proprie
 * iniziali in alto a destra.
 */
export type SettingsPage = 'settings' | 'profile';
type Page = SettingsPage | 'name' | 'blocked';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Da quale pagina aprire: le iniziali in alto portano dritte al profilo. */
  startAt?: SettingsPage;
}

/** Passaggio di conferma mostrato al posto del contenuto del foglio.
 * Usiamo questo invece di `Alert.alert` sia per coerenza grafica con il
 * resto dell'app (stesso schema dell'eliminazione di categorie e posti),
 * sia perché `Alert.alert` non fa assolutamente nulla su web in
 * react-native-web: lì i due pulsanti erano semplicemente inerti. */
type Confirm = 'signout' | 'delete-account';

const APP_VERSION = Constants.expoConfig?.version ?? '';

export function SettingsSheet({ visible, onClose, startAt = 'settings' }: SettingsSheetProps) {
  const { colors, preference, setPreference } = useTheme();
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [page, setPage] = useState<Page>(startAt);
  const [nameDraft, setNameDraft] = useState(profile?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  // Solo la cancellazione dell'account mostra i propri errori: se non
  // riesce, lasciar credere che i dati siano spariti sarebbe la bugia
  // peggiore che quest'app possa raccontare.
  const [confirmError, setConfirmError] = useState('');
  /** `null` finché non sono state lette: la riga mostra il numero solo
   * quando lo conosce davvero. */
  const [bloccati, setBloccati] = useState<{ id: string; name: string }[] | null>(null);

  // Riaprendo si riparte sempre dalla pagina richiesta, mai da una
  // conferma o da una sottopagina rimasta a metà.
  useEffect(() => {
    if (visible) {
      setPage(startAt);
      setConfirm(null);
      setBusy(false);
      setConfirmError('');
      listBlockedWithNames().then(setBloccati);
    }
  }, [visible, startAt]);

  const closeSheet = () => {
    setConfirm(null);
    onClose();
  };

  const openNameEditor = () => {
    setNameDraft(profile?.displayName ?? '');
    setPage('name');
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || savingName) return;
    setSavingName(true);
    try {
      await updateDisplayName(name);
      await refreshProfile();
      setPage('profile');
    } finally {
      setSavingName(false);
    }
  };

  const runSignOut = async () => {
    if (busy) return;
    setBusy(true);
    closeSheet();
    await signOut();
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

  const CONFIRMS: Record<Confirm, { title: string; body: string; action: string; onConfirm: () => void }> = {
    signout: {
      title: 'Uscire da Insieme?',
      body: 'Dovrai accedere di nuovo con email e password. I tuoi gruppi e i messaggi restano dove sono.',
      action: 'Esci',
      onConfirm: runSignOut,
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

  // ── Pezzi comuni ────────────────────────────────────────────────

  /** Titolo di una sottopagina, con la freccia per tornare indietro. */
  const PageTitle = ({ title, back }: { title: string; back?: Page }) => (
    <View style={styles.titleRow}>
      {back ? (
        <Pressable onPress={() => setPage(back)} hitSlop={10} style={styles.backBtn}>
          <BackIcon size={20} color={colors.textDim} />
        </Pressable>
      ) : null}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
    </View>
  );

  const SectionLabel = ({ children }: { children: string }) => (
    <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>{children}</Text>
  );

  /** Una riga di un blocco: icona su un quadratino tinto, nome, e a
   * destra un valore o una freccia. */
  const Row = ({
    icon,
    tint,
    label,
    value,
    trailing,
    danger,
    first,
    onPress,
  }: {
    icon: React.ReactNode;
    tint: string;
    label: string;
    value?: string;
    trailing?: React.ReactNode;
    danger?: boolean;
    first?: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: colors.border }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: tint + '26' }]}>{icon}</View>
      <Text style={[styles.rowLabel, { color: danger ? colors.danger : colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.rowRight}>
        {value ? <Text style={[styles.rowValue, { color: colors.textDim }]}>{value}</Text> : null}
        {trailing}
      </View>
    </Pressable>
  );

  const Block = ({ children }: { children: React.ReactNode }) => (
    <View style={[styles.block, { backgroundColor: colors.surface2 }]}>{children}</View>
  );

  const chevron = <ChevronIcon size={15} color={colors.textFaint} />;
  const external = <ExternalIcon size={13} color={colors.textFaint} />;
  const displayName = profile?.displayName ?? '';

  // ── Conferme ────────────────────────────────────────────────────

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

  // ── Profilo ─────────────────────────────────────────────────────

  if (page === 'profile') {
    return (
      <BottomSheet visible={visible} onClose={closeSheet}>
        {/* Aperto dalle iniziali, il profilo è la prima pagina: non c'è
            niente a cui tornare, quindi niente freccia. */}
        <PageTitle title="Profilo" back={startAt === 'profile' ? undefined : 'settings'} />

        <View style={styles.profileHero}>
          <View style={[styles.bigAvatar, { backgroundColor: colors.amber }]}>
            <Text style={[styles.bigAvatarText, { color: colors.inkOnAmber }]}>{initials(displayName)}</Text>
          </View>
          <Text style={[styles.heroName, { color: colors.text }]}>{displayName}</Text>
          {session?.user.email ? (
            <Text style={[styles.heroEmail, { color: colors.textDim }]}>{session.user.email}</Text>
          ) : null}
        </View>

        <Block>
          <Row
            first
            icon={<EditIcon size={15} color={colors.amber} strokeWidth={2} />}
            tint={colors.amber}
            label="Nome"
            value={displayName}
            trailing={chevron}
            onPress={openNameEditor}
          />
        </Block>

        {haiPubblicatoIDocumenti ? (
          <>
            <SectionLabel>DOCUMENTI</SectionLabel>
            <Block>
              {PRIVACY_URL ? (
                <Row
                  first
                  icon={<ShieldIcon size={15} color={colors.teal} strokeWidth={2} />}
                  tint={colors.teal}
                  label="Informativa privacy"
                  trailing={external}
                  onPress={() => Linking.openURL(PRIVACY_URL)}
                />
              ) : null}
              {TERMINI_URL ? (
                <Row
                  first={!PRIVACY_URL}
                  icon={<FileIcon size={15} color={colors.lilac} strokeWidth={2} />}
                  tint={colors.lilac}
                  label="Condizioni d’uso"
                  trailing={external}
                  onPress={() => Linking.openURL(TERMINI_URL)}
                />
              ) : null}
            </Block>
          </>
        ) : null}

        <SectionLabel>ACCOUNT</SectionLabel>
        <Block>
          <Row
            first
            icon={<LogoutIcon size={15} color={colors.textDim} strokeWidth={2} />}
            tint={colors.textDim}
            label="Esci dall’account"
            onPress={() => setConfirm('signout')}
          />
          {/* Ultima e in rosso: è l'unica azione da cui non si torna
              indietro, e passa comunque da una conferma. */}
          <Row
            icon={<TrashIcon size={15} color={colors.danger} />}
            tint={colors.danger}
            label="Elimina account"
            danger
            onPress={() => setConfirm('delete-account')}
          />
        </Block>
        <View style={{ height: 6 }} />
      </BottomSheet>
    );
  }

  // ── Cambio nome ─────────────────────────────────────────────────

  if (page === 'name') {
    const changed = nameDraft.trim() !== '' && nameDraft.trim() !== displayName;
    return (
      <BottomSheet visible={visible} onClose={closeSheet}>
        <PageTitle title="Il tuo nome" back="profile" />
        <Text style={[styles.note, { color: colors.textDim }]}>
          È il nome che vedono gli altri nei gruppi, accanto ai tuoi messaggi.
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
          value={nameDraft}
          onChangeText={setNameDraft}
          onSubmitEditing={saveName}
          maxLength={24}
          autoFocus
          returnKeyType="done"
        />
        <Pressable
          onPress={saveName}
          disabled={!changed || savingName}
          style={[styles.saveBtn, { backgroundColor: colors.amber, opacity: !changed || savingName ? 0.5 : 1 }]}
        >
          {savingName ? (
            <ActivityIndicator size="small" color={colors.inkOnAmber} />
          ) : (
            <Text style={{ color: colors.inkOnAmber, fontWeight: '700', fontSize: 14 }}>Salva</Text>
          )}
        </Pressable>
      </BottomSheet>
    );
  }

  // ── Persone bloccate ────────────────────────────────────────────

  if (page === 'blocked') {
    const list = bloccati ?? [];
    return (
      <BottomSheet visible={visible} onClose={closeSheet}>
        <PageTitle title="Persone bloccate" back="settings" />
        {list.length === 0 ? (
          <Text style={[styles.note, { color: colors.textDim }]}>
            Non hai bloccato nessuno. Per farlo, apri il menu di un suo messaggio in chat e scegli «Blocca».
          </Text>
        ) : (
          <>
            <Block>
              {list.map((p, i) => (
                <View
                  key={p.id}
                  style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Pressable
                    onPress={async () => {
                      await unblockUser(p.id);
                      setBloccati((prev) => (prev ?? []).filter((x) => x.id !== p.id));
                    }}
                    style={[styles.unblockBtn, { borderColor: colors.teal }]}
                  >
                    <Text style={{ color: colors.teal, fontSize: 12.5, fontWeight: '700' }}>Sblocca</Text>
                  </Pressable>
                </View>
              ))}
            </Block>
            <Text style={[styles.note, { color: colors.textFaint, marginTop: 10 }]}>
              I loro messaggi non ti compaiono nelle chat. Dopo lo sblocco tornano visibili riaprendo la chat.
            </Text>
          </>
        )}
      </BottomSheet>
    );
  }

  // ── Impostazioni ────────────────────────────────────────────────

  const ThemeOpt = ({ value, label, icon }: { value: ThemePreference; label: string; icon: (c: string) => React.ReactNode }) => {
    const active = preference === value;
    const tone = active ? colors.inkOnAmber : colors.textDim;
    return (
      <Pressable
        onPress={() => setPreference(value)}
        style={[styles.themeOpt, active && { backgroundColor: colors.amber }]}
      >
        {icon(tone)}
        <Text style={[styles.themeLabel, { color: tone }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <BottomSheet visible={visible} onClose={closeSheet}>
      <PageTitle title="Impostazioni" />

      <Pressable onPress={() => setPage('profile')} style={[styles.profileCard, { backgroundColor: colors.surface2 }]}>
        <View style={[styles.avatar, { backgroundColor: colors.amber }]}>
          <Text style={[styles.avatarText, { color: colors.inkOnAmber }]}>{initials(displayName)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.cardSub, { color: colors.textDim }]}>Gestisci profilo</Text>
        </View>
        <ChevronIcon size={18} color={colors.textFaint} />
      </Pressable>

      <SectionLabel>ASPETTO</SectionLabel>
      <View style={[styles.themeToggle, { backgroundColor: colors.surface2 }]}>
        <ThemeOpt value="light" label="Chiaro" icon={(c) => <SunIcon size={18} color={c} />} />
        <ThemeOpt value="dark" label="Scuro" icon={(c) => <MoonIcon size={18} color={c} />} />
        <ThemeOpt value="system" label="Automatico" icon={(c) => <AutoThemeIcon size={18} color={c} />} />
      </View>

      <SectionLabel>PRIVACY</SectionLabel>
      <Block>
        <Row
          first
          icon={<BanIcon size={15} color={colors.danger} strokeWidth={2} />}
          tint={colors.danger}
          label="Persone bloccate"
          value={bloccati ? String(bloccati.length) : undefined}
          trailing={chevron}
          onPress={() => setPage('blocked')}
        />
      </Block>

      {APP_VERSION ? (
        <Text style={[styles.version, { color: colors.textFaint }]}>Insieme · versione {APP_VERSION}</Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  backBtn: { marginLeft: -2 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, marginTop: 18, marginBottom: 7, marginLeft: 2 },
  note: { fontSize: 12.5, lineHeight: 18, marginBottom: 12 },

  block: { borderRadius: RADIUS.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 11, minHeight: 50 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowValue: { fontSize: 13, fontWeight: '500' },

  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: RADIUS.md },
  avatar: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800' },
  cardName: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  cardSub: { fontSize: 12.5, marginTop: 1 },

  profileHero: { alignItems: 'center', gap: 3, marginBottom: 16 },
  bigAvatar: { width: 72, height: 72, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  bigAvatarText: { fontSize: 24, fontWeight: '800' },
  heroName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  heroEmail: { fontSize: 12.5 },

  themeToggle: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14 },
  themeOpt: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 9, borderRadius: 11 },
  themeLabel: { fontSize: 12, fontWeight: '700' },

  input: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  saveBtn: { marginTop: 12, paddingVertical: 13, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  unblockBtn: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  version: { textAlign: 'center', fontSize: 11.5, marginTop: 18, marginBottom: 4 },

  confirmBody: { fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 16 },
  confirmError: { fontSize: 12.5, lineHeight: 18, marginTop: -8, marginBottom: 14 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  btnSecondary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
  btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
});
