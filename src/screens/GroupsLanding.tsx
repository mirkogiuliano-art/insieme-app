import React, { useCallback, useEffect, useState } from 'react';
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
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme, RADIUS, FONT_ROUNDED } from '@/theme/theme';
import { useAppStore, groupColor } from '@/lib/appStore';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import { BottomSheet } from '@/components/BottomSheet';
import { SettingsSheet, type SettingsPage } from '@/components/SettingsSheet';
import { LoadError } from '@/components/LoadError';
import { SettingsIcon, PlusIcon, UsersIcon, SearchIcon, CloseIcon, SortIcon, CheckIcon, MoreIcon } from '@/components/Icon';
import { FilterChip } from '@/components/FilterChip';
import { NewGroupSheet } from '@/components/NewGroupSheet';
import { GroupActionsSheet } from '@/components/GroupActionsSheet';
import { GroupInfoSheet } from '@/components/GroupInfoSheet';
import { createGroupWithMembership, setGroupColor } from '@/lib/api/groups';
import { listRoster, updateLastRead } from '@/lib/api/groupMembers';
import { storage } from '@/lib/storage';
import { getInviteToken, rotateInvite, inviteUrl } from '@/lib/api/invites';
import { listGroupPreviews, type GroupPreview } from '@/lib/api/groupPreviews';
import { initials, inkOn, withTimeout, WRITE_TIMEOUT } from '@/lib/utils';
import { fitFontSize, LETTER_SPACING_EM } from '@/lib/fitText';
import type { Group } from '@/types';
import { ScreenGlow } from '@/components/ScreenGlow';

/** Quante facce stanno sulla scheda prima di riassumere il resto in "+N". */
const AVATARS_SHOWN = 3;

/** In che ordine si vedono i gruppi. Preferenza di chi guarda. */
type GroupsSort = 'recent' | 'name' | 'created';
const SORT_KEY = 'groupsSort';
const SORT_LABELS: Record<GroupsSort, string> = {
  recent: 'Attività recente',
  name: 'Nome (A–Z)',
  created: 'Creati di recente',
};

/** "attivo 2 min fa", "attivo ieri": per il menu del gruppo. */
function activityLabel(ts: number | null | undefined): string | null {
  if (!ts) return null;
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return 'attivo ora';
  if (min < 60) return `attivo ${min} min fa`;
  const ore = Math.floor(min / 60);
  if (ore < 24) return `attivo ${ore} ${ore === 1 ? 'ora' : 'ore'} fa`;
  const giorni = Math.floor(ore / 24);
  return giorni === 1 ? 'attivo ieri' : `attivo ${giorni} giorni fa`;
}

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
  const { myGroups, addGroup, loadError, refreshGroups, leaveGroup } = useAppStore();

  /** Da quale pagina aprire le impostazioni; `null` = chiuse. */
  const [settingsAt, setSettingsAt] = useState<SettingsPage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  /** Arrivando da "Incolla un altro invito" il foglio Nuovo si apre già
   * su "Entra con un invito". */
  const { nuovo } = useLocalSearchParams<{ nuovo?: string }>();
  const [newStartOn, setNewStartOn] = useState<'create' | 'join' | undefined>(undefined);
  useEffect(() => {
    if (nuovo === 'invito') {
      setNewStartOn('join');
      setCreateOpen(true);
      router.setParams({ nuovo: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuovo]);
  const [inviteOpen, setInviteOpen] = useState<Group | null>(null);
  const [previews, setPreviews] = useState<Record<string, GroupPreview>>({});
  const [sharing, setSharing] = useState(false);

  const [query, setQuery] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [sort, setSort] = useState<GroupsSort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  /** Il gruppo di cui è aperto il menu. */
  const [actionsFor, setActionsFor] = useState<Group | null>(null);
  /** Info gruppo aperto dalla home, con i suoi membri. */
  const [infoFor, setInfoFor] = useState<{ group: Group; roster: Record<string, string> } | null>(null);

  useEffect(() => {
    storage.get<GroupsSort>(SORT_KEY).then((v) => {
      if (v && v in SORT_LABELS) setSort(v);
    });
  }, []);

  const reloadPreviews = () => listGroupPreviews().then(setPreviews);

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

  /** Restituisce il messaggio d'errore da mostrare, o `null` se è andata. */
  const createGroup = async (name: string, color: string): Promise<string | null> => {
    try {
      const meta = await withTimeout(createGroupWithMembership(name, color), WRITE_TIMEOUT);
      addGroup(meta);
      setCreateOpen(false);
      setInviteOpen(meta);
      return null;
    } catch (err) {
      return (err as { message?: string })?.message || 'Non sono riuscito a creare il gruppo, riprova.';
    }
  };

  const changeColor = async (g: Group, color: string) => {
    try {
      await withTimeout(setGroupColor(g.id, color), WRITE_TIMEOUT);
      await refreshGroups();
    } catch {
      toast.show('Non sono riuscito a cambiare il colore.');
    }
  };

  const markRead = async (g: Group) => {
    try {
      await updateLastRead(g.id);
      await reloadPreviews();
    } catch {
      toast.show('Non sono riuscito a segnare come letto.');
    }
  };

  const openInfo = async (g: Group) => {
    const roster = await listRoster(g.id).catch(() => ({}) as Record<string, string>);
    setInfoFor({ group: g, roster });
  };

  const leave = async (g: Group) => {
    try {
      await leaveGroup(g.id);
      await reloadPreviews();
    } catch {
      toast.show('Non sono riuscito a farti uscire dal gruppo, riprova.');
    }
  };

  const chooseSort = (next: GroupsSort) => {
    setSort(next);
    storage.set(SORT_KEY, next);
    setSortOpen(false);
  };

  const term = query.trim().toLowerCase();
  const newCount = myGroups.filter((g) => (previews[g.id]?.unread ?? 0) > 0).length;
  const shownGroups = myGroups
    .filter((g) => !term || g.name.toLowerCase().includes(term))
    .filter((g) => !onlyNew || (previews[g.id]?.unread ?? 0) > 0)
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
      if (sort === 'created') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      const la = previews[a.id]?.lastAt ?? a.createdAt ?? 0;
      const lb = previews[b.id]?.lastAt ?? b.createdAt ?? 0;
      return lb - la;
    });

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
      <ScreenGlow />
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

      {/* La stessa riga di Link, Mappa e Chat: la ricerca e "Nuovo". */}
      <View style={styles.topBar}>
        <View style={[styles.search, { backgroundColor: colors.surface }]}>
          <SearchIcon size={15} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={myGroups.length > 0 ? `Cerca fra ${myGroups.length} ${myGroups.length === 1 ? 'gruppo' : 'gruppi'}` : 'Cerca'}
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <CloseIcon size={13} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => setCreateOpen(true)} style={[styles.newBtn, { backgroundColor: colors.amber }]}>
          <PlusIcon size={13} color={colors.inkOnAmber} />
          <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 13 }}>Nuovo</Text>
        </Pressable>
      </View>
      {myGroups.length > 1 ? (
        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24 }}>
            <FilterChip label={SORT_LABELS[sort]} icon={<SortIcon size={12} color={colors.textDim} />} onPress={() => setSortOpen(true)} />
            <View style={[styles.chipDivider, { backgroundColor: colors.border }]} />
            <FilterChip label="Tutti" active={!onlyNew} onPress={() => setOnlyNew(false)} />
            <FilterChip
              label={newCount > 0 ? `Con novità · ${newCount}` : 'Con novità'}
              dotColor={colors.amber}
              active={onlyNew}
              onPress={() => setOnlyNew(true)}
            />
          </ScrollView>
        </View>
      ) : null}

      {loadError ? <LoadError what="i tuoi gruppi" onRetry={refreshGroups} /> : null}

      <ScrollView contentContainerStyle={styles.list}>
        {myGroups.length > 0 && shownGroups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textFaint }]}>
              {term ? `Nessun gruppo si chiama «${query.trim()}».` : 'Nessun gruppo con messaggi nuovi. Sei in pari.'}
            </Text>
          </View>
        ) : null}
        {myGroups.length === 0 && !loadError ? (
          <View style={styles.empty}>
            <UsersIcon size={38} color={colors.textFaint} />
            <Text style={[styles.emptyText, { color: colors.textFaint }]}>
              Non fai ancora parte di nessun gruppo. Tocca «Nuovo» per crearne uno, o per entrare con un invito.
            </Text>
          </View>
        ) : (
          shownGroups.map((g) => {
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
                onLongPress={() => setActionsFor(g)}
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
                      {preview.unread > 99 ? '99+ nuovi' : `${preview.unread} ${preview.unread === 1 ? 'nuovo' : 'nuovi'}`}
                    </Text>
                  </View>
                ) : null}

                {/* Il menu del gruppo: anche tenendo premuta la scheda, ma
                    sul web la pressione lunga non arriva. */}
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    setActionsFor(g);
                  }}
                  hitSlop={10}
                  style={styles.cardMore}
                  accessibilityLabel={`Menu di ${g.name}`}
                >
                  <MoreIcon size={18} color={ink} />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <SettingsSheet visible={settingsAt !== null} startAt={settingsAt ?? 'settings'} onClose={() => setSettingsAt(null)} />

      <NewGroupSheet
        visible={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setNewStartOn(undefined);
        }}
        startOn={newStartOn}
        onCreate={createGroup}
        onJoin={(token) => router.push(`/invite/${token}`)}
      />

      <GroupActionsSheet
        group={actionsFor}
        memberCount={actionsFor ? (previews[actionsFor.id]?.memberCount ?? null) : null}
        unread={actionsFor ? (previews[actionsFor.id]?.unread ?? 0) : 0}
        activity={actionsFor ? activityLabel(previews[actionsFor.id]?.lastAt) : null}
        onClose={() => setActionsFor(null)}
        onInvite={shareInvite}
        onInfo={openInfo}
        onColor={changeColor}
        onMarkRead={markRead}
        onLeave={leave}
      />

      {infoFor ? (
        <GroupInfoSheet
          visible
          onClose={() => setInfoFor(null)}
          group={infoFor.group}
          roster={infoFor.roster}
          onLeaveGroup={() => reloadPreviews()}
        />
      ) : null}

      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)}>
        <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 8 }]}>Ordina per</Text>
        {(Object.keys(SORT_LABELS) as GroupsSort[]).map((k, i) => (
          <Pressable
            key={k}
            onPress={() => chooseSort(k)}
            style={[styles.sortRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <Text style={[styles.sortLabel, { color: colors.text, fontWeight: sort === k ? '800' : '600' }]}>{SORT_LABELS[k]}</Text>
            {sort === k ? <CheckIcon size={17} color={colors.amber} /> : null}
          </Pressable>
        ))}
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
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingBottom: 8 },
  search: { flex: 1, height: 40, borderRadius: RADIUS.sm, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 13.5, paddingVertical: 0 },
  newBtn: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, borderRadius: 999 },
  filters: { paddingBottom: 4 },
  chipDivider: { width: 1, alignSelf: 'stretch', marginVertical: 6, marginRight: 8 },
  sortRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  sortLabel: { flex: 1, fontSize: 15 },
  cardMore: { position: 'absolute', right: 16, bottom: 12, opacity: 0.75 },
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
  // In alto a sinistra: l'angolo libero, dall'altra parte delle facce.
  unread: {
    position: 'absolute',
    left: 16,
    top: 14,
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { fontSize: 11, fontWeight: '800' },

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
  mInput: { borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14.5, marginBottom: 10 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
