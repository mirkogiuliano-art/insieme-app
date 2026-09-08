import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Share } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTheme, RADIUS } from '@/theme/theme';
import { useAppStore } from '@/lib/appStore';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import { getMyGroup } from '@/lib/api/groups';
import { listRoster, subscribeToRoster } from '@/lib/api/groupMembers';
import { getInviteToken, rotateInvite, inviteUrl } from '@/lib/api/invites';
import { SettingsSheet } from '@/components/SettingsSheet';
import { GroupInfoSheet } from '@/components/GroupInfoSheet';
import { ChatTab } from '@/screens/ChatTab';
import { LinksTab } from '@/screens/LinksTab';
import { MapTab } from '@/screens/MapTab';
import {
  BackIcon,
  SettingsIcon,
  ShareIcon,
  SearchIcon,
  MoreIcon,
  ChatIcon,
  LinkIcon,
  MapIcon,
  UsersIcon,
} from '@/components/Icon';
import { initials } from '@/lib/utils';
import type { Group } from '@/types';

type TabName = 'chat' | 'links' | 'map';

const TAB_TITLES: Record<TabName, string> = {
  chat: 'Chat',
  links: 'Link e video',
  map: 'Mappa',
};

export default function GroupScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  const { getGroup, addGroup, ready: groupsReady } = useAppStore();
  const { session, ready: authReady, profile } = useAuth();
  const localGroup = getGroup(groupId);

  // Non essendo più possibile iscriversi da qui, questa schermata si limita
  // a verificare che il gruppo sia davvero raggiungibile: le regole di
  // sicurezza lo restituiscono solo ai membri, quindi `null` significa
  // "non ne fai parte" e non c'è niente da proporre. Per entrare serve un
  // invito (app/invite/[token].tsx).
  const [remoteGroup, setRemoteGroup] = useState<Group | null | undefined>(undefined);

  useEffect(() => {
    if (!authReady) return;
    if (!session) {
      router.replace('/');
      return;
    }
    if (localGroup || !groupsReady) return;
    let cancelled = false;
    getMyGroup(groupId).then((g) => {
      if (!cancelled) setRemoteGroup(g);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session, groupsReady, !!localGroup, groupId]);

  const [tab, setTab] = useState<TabName>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roster, setRoster] = useState<Record<string, string>>({});
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Le tab si smontano quando si cambia sezione, quindi il "vai a questo
  // posto" partito da una targhetta nella sezione Link deve passare da qui.
  const [focusPinId, setFocusPinId] = useState<string | null>(null);
  // Con la tastiera aperta la barra delle sezioni sparisce, per lasciare
  // spazio a quello che si sta scrivendo. Il selettore evita di ridisegnare
  // a ogni variazione dell'altezza della tastiera: serve solo il sì/no.
  const keyboardOpen = useKeyboardState((s) => s.isVisible);

  useEffect(() => {
    if (!localGroup) return;
    listRoster(groupId).then(setRoster);
    const unsubscribe = subscribeToRoster(groupId, (userId, displayName) => {
      setRoster((prev) => ({ ...prev, [userId]: displayName }));
    });
    return unsubscribe;
  }, [groupId, !!localGroup]);

  /** Condivide il link d'invito, creandolo al volo se il gruppo non ne ha
   * uno attivo (per esempio perché è stato revocato). */
  const shareInvite = async () => {
    if (!localGroup || sharing) return;
    setSharing(true);
    try {
      const token = (await getInviteToken(localGroup.id)) ?? (await rotateInvite(localGroup.id));
      await Share.share({
        message: `Entra nel gruppo "${localGroup.name}" su Insieme:\n${inviteUrl(token)}`,
      });
    } catch {
      toast.show('Non sono riuscito a preparare il link di invito.');
    } finally {
      setSharing(false);
    }
  };

  if (!authReady || !session || (!localGroup && !groupsReady)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  if (!localGroup && remoteGroup === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  // Il gruppo non è raggiungibile: o non esiste, o — molto più spesso — non
  // se ne fa parte. Non distinguiamo i due casi di proposito: dire "questo
  // gruppo esiste ma non sei dentro" confermerebbe l'esistenza di un gruppo
  // a chi non dovrebbe saperne nulla.
  if (!localGroup && remoteGroup === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.centerState}>
          <UsersIcon size={38} color={colors.textFaint} />
          <Text style={[styles.centerTitle, { color: colors.text }]}>Gruppo non disponibile</Text>
          <Text style={[styles.centerSub, { color: colors.textDim }]}>
            Non fai parte di questo gruppo. Per entrare serve un link di invito da parte di chi è già dentro.
          </Text>
          <Pressable onPress={() => router.replace('/')} style={[styles.centerBtn, { backgroundColor: colors.amber }]}>
            <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>Torna ai tuoi gruppi</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={[styles.iconBtn, { backgroundColor: colors.surface }]}
          >
            <BackIcon size={18} color={colors.textDim} />
          </Pressable>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.textFaint }]} numberOfLines={1}>
              {localGroup?.name ?? 'Gruppo'}
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>{TAB_TITLES[tab]}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={() => setMenuOpen(true)} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
            <MoreIcon size={18} color={colors.textDim} />
          </Pressable>
          <View style={[styles.meAvatar, { backgroundColor: colors.amber }]}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.inkOnAmber }}>{initials(profile?.displayName ?? '')}</Text>
          </View>
        </View>
      </View>

      {/* Contenuto e barra delle tab salgono insieme quando si apre la
          tastiera, così la parte bassa della schermata resta appoggiata sopra
          di essa invece di finirci sotto. L'intestazione resta ferma. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
      <View style={{ flex: 1 }}>
        {tab === 'chat' ? (
          <ChatTab groupId={groupId} roster={roster} searchOpen={chatSearchOpen} setSearchOpen={setChatSearchOpen} />
        ) : null}
        {tab === 'links' ? (
          <LinksTab
            groupId={groupId}
            roster={roster}
            onShowPlaceOnMap={(pinId) => {
              setFocusPinId(pinId);
              setTab('map');
            }}
          />
        ) : null}
        {tab === 'map' ? (
          <MapTab
            groupId={groupId}
            roster={roster}
            focusPinId={focusPinId}
            onFocusHandled={() => setFocusPinId(null)}
          />
        ) : null}
      </View>

      {/* Una pastiglia che galleggia sopra il contenuto invece di una
          fascia incollata al bordo: si vede che sotto la lista continua,
          e la sezione in cui ci si trova è l'unica con il nome scritto. */}
      {!keyboardOpen ? (
        <View style={[styles.tabbar, { backgroundColor: colors.surface }]}>
          <TabButton
            label="Chat"
            active={tab === 'chat'}
            onPress={() => setTab('chat')}
            icon={<ChatIcon size={21} color={tab === 'chat' ? colors.inkOnAmber : colors.textFaint} />}
            activeBg={colors.amber}
            activeText={colors.inkOnAmber}
          />
          <TabButton
            label="Link"
            active={tab === 'links'}
            onPress={() => setTab('links')}
            icon={<LinkIcon size={21} color={tab === 'links' ? colors.inkOnAmber : colors.textFaint} />}
            activeBg={colors.amber}
            activeText={colors.inkOnAmber}
          />
          <TabButton
            label="Mappa"
            active={tab === 'map'}
            onPress={() => setTab('map')}
            icon={<MapIcon size={21} color={tab === 'map' ? colors.inkOnAmber : colors.textFaint} />}
            activeBg={colors.amber}
            activeText={colors.inkOnAmber}
          />
        </View>
      ) : null}
      </KeyboardAvoidingView>

      <SettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        groupId={groupId}
        onLeaveGroup={() => router.replace('/')}
      />

      {localGroup ? (
        <GroupInfoSheet
          visible={groupInfoOpen}
          onClose={() => setGroupInfoOpen(false)}
          group={localGroup}
          roster={roster}
        />
      ) : null}

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        {tab === 'chat' ? (
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              setChatSearchOpen(true);
            }}
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
          >
            <SearchIcon size={18} color={colors.textDim} />
            <Text style={[styles.menuRowText, { color: colors.text }]}>Ricerca</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            setMenuOpen(false);
            setGroupInfoOpen(true);
          }}
          style={[styles.menuRow, { borderBottomColor: colors.border }]}
        >
          <UsersIcon size={18} color={colors.textDim} />
          <Text style={[styles.menuRowText, { color: colors.text }]}>Info gruppo</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMenuOpen(false);
            shareInvite();
          }}
          style={[styles.menuRow, { borderBottomColor: colors.border }]}
        >
          <ShareIcon size={18} color={colors.textDim} />
          <Text style={[styles.menuRowText, { color: colors.text }]}>Condividi</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMenuOpen(false);
            setSettingsOpen(true);
          }}
          style={[styles.menuRow, { borderBottomWidth: 0 }]}
        >
          <SettingsIcon size={18} color={colors.textDim} />
          <Text style={[styles.menuRowText, { color: colors.text }]}>Impostazioni</Text>
        </Pressable>
      </BottomSheet>
    </SafeAreaView>
  );
}

/** Solo la sezione attiva porta il nome scritto: le altre restano
 * l'icona, che è quanto basta a riconoscerle e lascia respiro alla
 * pastiglia. */
function TabButton({
  label,
  active,
  onPress,
  icon,
  activeBg,
  activeText,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  activeBg: string;
  activeText: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tabBtn, active ? { backgroundColor: activeBg } : null]}>
      {icon}
      {active ? <Text style={[styles.tabLabel, { color: activeText }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Niente riga di separazione: a staccare l'intestazione dal contenuto
  // bastano lo spazio e il fondo più chiaro dei pulsanti.
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10.5, letterSpacing: 1.1, fontWeight: '700' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1 },
  menuRowText: { fontSize: 15, fontWeight: '600' },
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4, marginTop: 1 },
  meAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabbar: { flexDirection: 'row', gap: 4, marginHorizontal: 14, marginBottom: 12, padding: 6, borderRadius: 22 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 17,
  },
  tabLabel: { fontSize: 13, fontWeight: '700' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  centerTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  centerSub: { fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 300, marginBottom: 6 },
  centerBtn: { paddingVertical: 13, paddingHorizontal: 28, borderRadius: RADIUS.sm, alignItems: 'center' },
});
