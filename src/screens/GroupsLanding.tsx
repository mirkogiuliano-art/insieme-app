import React, { useCallback, useState } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme, RADIUS, FONT_ROUNDED } from '@/theme/theme';
import { useAppStore, groupColor } from '@/lib/appStore';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import { BottomSheet } from '@/components/BottomSheet';
import { SettingsSheet, type SettingsPage } from '@/components/SettingsSheet';
import { LoadError } from '@/components/LoadError';
import { SettingsIcon, PlusIcon, UsersIcon } from '@/components/Icon';
import { createGroupWithMembership } from '@/lib/api/groups';
import { getInviteToken, rotateInvite, inviteUrl } from '@/lib/api/invites';
import { listGroupPreviews, type GroupPreview } from '@/lib/api/groupPreviews';
import { initials, inkOn, withTimeout, WRITE_TIMEOUT } from '@/lib/utils';
import { fitFontSize, LETTER_SPACING_EM } from '@/lib/fitText';
import type { Group } from '@/types';

/** Quante facce stanno sulla scheda prima di riassumere il resto in "+N". */
const AVATARS_SHOWN = 3;

/** Limiti del nome del gruppo. Sopra `MAX` un nome di tre lettere
 * diventerebbe un manifesto e urterebbe le facce in alto; sotto `MIN` non
 * si scende, e un nome lunghissimo finisce coi puntini. */
const NAME_MAX = 66;
const NAME_MIN = 24;

/**
 * Il nome del gruppo, grande quanto serve per riempire la scheda: corto →
 * enorme, lungo → più piccolo. La larghezza disponibile si misura al primo
 * disegno; fino ad allora si usa la dimensione minima, che sta sempre.
 */
function NomeGruppo({ name, color }: { name: string; color: string }) {
  const [width, setWidth] = useState(0);
  const size = width > 0 ? fitFontSize(name, width, NAME_MIN, NAME_MAX) : NAME_MIN;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Text
        style={[
          styles.groupName,
          {
            color,
            fontSize: size,
            // Interlinea stretta: con un carattere così grande quella
            // predefinita gonfierebbe la scheda senza motivo.
            lineHeight: Math.round(size * 1.22),
            letterSpacing: size * LETTER_SPACING_EM,
          },
        ]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}

export function GroupsLanding() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { profile } = useAuth();
  const { myGroups, addGroup, loadError, refreshGroups } = useAppStore();

  /** Da quale pagina aprire le impostazioni; `null` = chiuse. */
  const [settingsAt, setSettingsAt] = useState<SettingsPage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState<Group | null>(null);
  const [previews, setPreviews] = useState<Record<string, GroupPreview>>({});

  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Ricaricate a ogni ritorno sulla schermata, non solo al primo
  // montaggio: uscendo da una chat i non letti di quel gruppo sono
  // appena stati azzerati e l'ultimo messaggio è cambiato, e questa
  // schermata resta montata sotto quella del gruppo.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listGroupPreviews().then((p) => {
        if (alive) setPreviews(p);
      });
      return () => {
        alive = false;
      };
    }, [myGroups.length]),
  );

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
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.textFaint }]}>INSIEME</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>I tuoi gruppi</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={() => setSettingsAt('settings')} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
            <SettingsIcon size={18} color={colors.textDim} />
          </Pressable>
          {/* Le proprie iniziali portano dritte al profilo: nome, documenti,
              uscita ed eliminazione dell'account. */}
          <Pressable onPress={() => setSettingsAt('profile')} style={[styles.meAvatar, { backgroundColor: colors.amber }]}>
            <Text style={[styles.meAvatarText, { color: colors.inkOnAmber }]}>{initials(profile?.displayName ?? '')}</Text>
          </Pressable>
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
          myGroups.map((g) => {
            // La scheda è tutta della tinta del gruppo, e il testo sopra
            // è una versione molto scura della stessa tinta invece di un
            // nero qualunque: contro sette colori diversi un nero unico
            // risulta sempre un po' estraneo a ciascuno.
            const tint = groupColor(g);
            const ink = inkOn(tint);
            const preview = previews[g.id];
            const shown = preview?.memberNames.slice(0, AVATARS_SHOWN) ?? [];
            const extra = (preview?.memberCount ?? 0) - shown.length;

            return (
              <Pressable
                key={g.id}
                onPress={() => router.push(`/group/${g.id}`)}
                style={[styles.groupCard, { backgroundColor: tint }]}
              >
                {/* Solo luce: un cerchio appena più scuro della tinta, che
                    esce dall'angolo e viene ritagliato dalla scheda. */}
                <View style={styles.cardBlob} />

                {shown.length > 0 ? (
                  <View style={styles.avatars}>
                    {shown.map((name, i) => (
                      <View
                        key={`${name}-${i}`}
                        style={[styles.avatar, { borderColor: tint, marginLeft: i === 0 ? 0 : -8 }]}
                      >
                        <Text style={[styles.avatarText, { color: ink }]}>{initials(name)}</Text>
                      </View>
                    ))}
                    {extra > 0 ? (
                      <View style={[styles.avatar, { borderColor: tint, marginLeft: -8 }]}>
                        <Text style={[styles.avatarText, { color: ink }]}>+{extra}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <NomeGruppo name={g.name} color={ink} />

                {preview && preview.unread > 0 ? (
                  <View style={[styles.unread, { backgroundColor: ink }]}>
                    <Text style={[styles.unreadText, { color: tint }]}>
                      {preview.unread > 99 ? '99+' : preview.unread}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          onPress={() => setCreateOpen(true)}
          style={[styles.actionPrimary, { backgroundColor: colors.amber, shadowColor: colors.amber }]}
        >
          <PlusIcon size={16} color={colors.inkOnAmber} />
          <Text style={[styles.actionPrimaryText, { color: colors.inkOnAmber }]}>Nuovo gruppo</Text>
        </Pressable>
      </View>

      <SettingsSheet visible={settingsAt !== null} startAt={settingsAt ?? 'settings'} onClose={() => setSettingsAt(null)} />

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
          <Pressable onPress={() => setCreateOpen(false)} style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}>
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
                style={[styles.btnSecondary, { backgroundColor: colors.surface2, opacity: sharing ? 0.6 : 1 }]}
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
  // Niente riga di separazione sotto l'intestazione: a separarla dalla
  // lista bastano lo spazio e le schede colorate, che hanno un bordo
  // loro. Lo stesso vale per la barra in fondo.
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: { fontSize: 10.5, letterSpacing: 1.1, fontWeight: '700' },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  meAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  meAvatarText: { fontSize: 11, fontWeight: '800' },
  list: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 12, gap: 16, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30, paddingTop: 80 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 18 },

  // Il nome sta al centro dell'altezza: gli angoli sono occupati dalle
  // facce dei membri e dai non letti, quindi al centro non urta niente e
  // la scheda resta in equilibrio anche quando quei due mancano.
  // `overflow: hidden` ritaglia il cerchio decorativo che sborda.
  groupCard: {
    minHeight: 144,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardBlob: {
    position: 'absolute',
    right: -34,
    top: -42,
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: 'rgba(0,0,0,0.09)',
  },
  avatars: { position: 'absolute', top: 18, right: 20, flexDirection: 'row' },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  avatarText: { fontSize: 9.5, fontWeight: '800' },
  // Dimensione, interlinea e spaziatura le calcola NomeGruppo in base alla
  // lunghezza del nome: qui resta solo il carattere, arrotondato perché
  // quello di sistema risultava spento in mezzo a tutto quel colore.
  groupName: { fontFamily: FONT_ROUNDED },
  unread: {
    position: 'absolute',
    right: 20,
    bottom: 18,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { fontSize: 11.5, fontWeight: '800' },

  actions: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14 },
  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 15,
    borderRadius: 999,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  actionPrimaryText: { fontWeight: '800', fontSize: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  sheetSub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  mInput: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, marginBottom: 10 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
  btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
});
