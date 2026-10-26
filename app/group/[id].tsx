import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTheme, RADIUS } from '@/theme/theme';
import { useAppStore } from '@/lib/appStore';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import { getMyGroup, subscribeToGroup, setGroupColor } from '@/lib/api/groups';
import { subscribeToRoster } from '@/lib/api/groupMembers';
import { apriGruppo } from '@/lib/api/apriGruppo';
import { AddPeopleSheet } from '@/components/AddPeopleSheet';
import { GroupActionsSheet } from '@/components/GroupActionsSheet';
import { GroupInfoSheet } from '@/components/GroupInfoSheet';
import { ChatTab, type StrumentoChat } from '@/screens/ChatTab';
import { LinksTab } from '@/screens/LinksTab';
import { MapTab } from '@/screens/MapTab';
import {
  BackIcon,
  SearchIcon,
  MoreIcon,
  ChatIcon,
  LinkIcon,
  MapIcon,
  UsersIcon,
  CalendarIcon,
  GridIcon,
  GlobeIcon,
} from '@/components/Icon';
import { listPins } from '@/lib/api/pins';
import { rangeLabel, countdownLabel } from '@/lib/groupInfo';
import type { Group } from '@/types';
import { ScreenGlow } from '@/components/ScreenGlow';
import { TabBarSpaceContext, TABBAR_SPACE } from '@/lib/tabBarSpace';
import { BarraSezioni, Sezione } from '@/components/BarraSezioni';
import { useT } from '@/i18n';
import { segnalaErrore } from '@/lib/sentry';
import { useFinestra } from '@/lib/finestra';
import { withTimeout, WRITE_TIMEOUT } from '@/lib/utils';
import { leggiCopia, salvaCopia } from '@/lib/copiaLocale';
import { GroupsLanding } from '@/screens/GroupsLanding';

type TabName = 'chat' | 'links' | 'map';

export default function GroupScreen() {
  const { colors, theme } = useTheme();
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  const { getGroup, addGroup, refreshGroups, leaveGroup, ready: groupsReady } = useAppStore();
  const { session, ready: authReady } = useAuth();
  const localGroup = getGroup(groupId);
  const { classe } = useFinestra();

  // Il nome della meta, per la riga sotto il nome del gruppo.
  const metaId = localGroup?.placePinId ?? null;
  const [meta, setMeta] = useState<string | null>(null);
  useEffect(() => {
    if (!metaId) {
      setMeta(null);
      return;
    }
    let attivo = true;
    let arrivato = false;
    leggiCopia<string | null>(session?.user.id, `meta:${groupId}`).then((copia) => {
      if (attivo && copia && !arrivato) setMeta(copia.dati);
    });
    listPins(groupId)
      .then((pins) => {
        arrivato = true;
        const nome = pins.find((p) => p.id === metaId)?.name ?? null;
        if (attivo) setMeta(nome);
        salvaCopia(session?.user.id, `meta:${groupId}`, nome);
      })
      .catch(async () => {
        // Senza rete, il nome dell'ultima volta.
        const copia = await leggiCopia<string | null>(session?.user.id, `meta:${groupId}`);
        if (attivo && copia) setMeta(copia.dati);
      });
    return () => {
      attivo = false;
    };
  }, [groupId, metaId]);

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
      if (cancelled) return;
      setRemoteGroup(g);
      // Nell'elenco del telefono, così partono anche nomi e aggiornamenti:
      // senza, la chat aspettava i nomi per sempre.
      if (g) addGroup(g);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session, groupsReady, !!localGroup, groupId]);

  // Le info del gruppo si scrivono in due: se le cambia qualcun altro
  // mentre si è dentro, devono comparire senza riaprire l'app.
  useEffect(() => {
    if (!localGroup) return;
    const unsubscribe = subscribeToGroup(groupId, () => {
      refreshGroups().catch(() => {});
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, !!localGroup]);

  const [tab, setTab] = useState<TabName>('chat');
  // La ricerca e l'archivio della chat si aprono dall'intestazione.
  const [strumentoChat, setStrumentoChat] = useState<StrumentoChat>('chat');
  /** Cambiando sezione la chat torna normale (ricerca e archivio chiusi),
   * nello stesso ridisegno: con un effetto ce n'era un secondo, durante
   * il passaggio. */
  const apriSezione = (s: TabName) => {
    setTab(s);
    setStrumentoChat('chat');
  };
  const [roster, setRoster] = useState<Record<string, string>>({});
  /** I nomi sono arrivati, dal server o dalla copia: la prima volta la
   * chat li aspetta, invece di mostrare per un attimo «Utente». */
  const [nomiPronti, setNomiPronti] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aggiungendo, setAggiungendo] = useState(false);
  // La mappa si smonta quando si cambia sezione (vedi Sezione), quindi il
  // "vai a questo posto" partito da una targhetta in Link passa da qui.
  const [focusPinId, setFocusPinId] = useState<string | null>(null);
  // Con la tastiera aperta la barra delle sezioni sparisce, per lasciare
  // spazio a quello che si sta scrivendo. Il selettore evita di ridisegnare
  // a ogni variazione dell'altezza della tastiera: serve solo il sì/no.
  const keyboardOpen = useKeyboardState((s) => s.isVisible);

  useEffect(() => {
    if (!localGroup) return;
    // I nomi dei membri hanno la loro copia sul telefono: compare subito,
    // e senza rete la chat dell'ultima volta dice ancora chi ha scritto cosa.
    leggiCopia<Record<string, string>>(session?.user.id, `membri:${groupId}`).then((copia) => {
      if (!copia) return;
      setRoster((prev) => (Object.keys(prev).length > 0 ? prev : copia.dati));
      setNomiPronti(true);
    });
    // Nomi e info arrivano con la stessa richiesta della chat
    // (apriGruppo), che aprendo il gruppo parte una volta sola.
    apriGruppo(groupId)
      .then((g) => {
        // Le copie di nomi e info le salva la chat, con tutto il resto
        // (salvaCopieGruppo).
        setRoster(g.nomi);
        setNomiPronti(true);
      })
      .catch(async () => {
        const copia = await leggiCopia<Record<string, string>>(session?.user.id, `membri:${groupId}`);
        if (copia) setRoster((prev) => (Object.keys(prev).length > 0 ? prev : copia.dati));
        // Senza nomi la chat compare lo stesso: meglio «Utente» che
        // restare ad aspettare.
        setNomiPronti(true);
      });
    const unsubscribe = subscribeToRoster(groupId, (userId, displayName) => {
      setRoster((prev) => ({ ...prev, [userId]: displayName }));
    });
    return unsubscribe;
  }, [groupId, !!localGroup]);


  const cambiaColore = async (g: Group, color: string) => {
    try {
      await withTimeout(setGroupColor(g.id, color), WRITE_TIMEOUT);
      await refreshGroups();
    } catch (err) {
      segnalaErrore(err, 'home.erroreColore');
      toast.show(t.home.erroreColore, 'error');
    }
  };

  const esci = async (g: Group) => {
    try {
      await leaveGroup(g.id);
      router.replace('/');
    } catch (err) {
      segnalaErrore(err, 'home.erroreUscita');
      toast.show(t.home.erroreUscita, 'error');
    }
  };

  if (!authReady || !session || (!localGroup && !groupsReady)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ScreenGlow />
        <ActivityIndicator color={colors.amberText} />
      </View>
    );
  }

  if (!localGroup && remoteGroup === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ScreenGlow />
        <ActivityIndicator color={colors.amberText} />
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
        <ScreenGlow />
        <View style={styles.centerState}>
          <UsersIcon size={38} color={colors.textFaint} />
          <Text style={[styles.centerTitle, { color: colors.text }]}>{t.gruppo.nonDisponibile}</Text>
          <Text style={[styles.centerSub, { color: colors.textDim }]}>
            {t.gruppo.nonDisponibileTesto}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={[styles.centerBtn, { backgroundColor: colors.amber }]}>
            <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>{t.invito.tornaAiGruppi}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // «mancano 39 giorni · Lisbona» sotto il nome. Niente info, niente riga.
  const quando = localGroup
    ? (countdownLabel(localGroup.startsOn, localGroup.endsOn) ?? rangeLabel(localGroup.startsOn, localGroup.endsOn))
    : null;
  // La meta fuori dalla mappa ha il nome sulla riga del gruppo.
  const nomeMeta = meta ?? localGroup?.metaLibera?.nome ?? null;
  // Prima quanto manca, che cambia, poi il posto: con la lente accanto la
  // riga si accorcia, e restava tagliata proprio la parte utile.
  const sottotitolo = [localGroup?.pubblico ? t.pubblico.pubblico : null, quando, nomeMeta].filter(Boolean).join(' · ') || null;

  const gruppo = (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <ScreenGlow />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.comune.indietro}
            hitSlop={6}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={[styles.iconBtn, { backgroundColor: colors.surface }]}
          >
            <BackIcon size={18} color={colors.textDim} />
          </Pressable>
          {/* Il nome del gruppo, e sotto dove si va e quanto manca. La
              sezione aperta la dice già la barra in basso. Toccando si
              aprono le info, come nelle chat di gruppo. */}
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t.menuGruppo.info}
            onPress={() => setGroupInfoOpen(true)}
            style={{ flexShrink: 1 }}
          >
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {localGroup?.name ?? t.gruppo.nomeMancante}
            </Text>
            {sottotitolo ? (
              <View style={styles.subRow}>
                {localGroup?.pubblico ? (
                  <GlobeIcon size={13} color={colors.teal} strokeWidth={2} />
                ) : quando ? (
                  <CalendarIcon size={13} color={colors.amberText} strokeWidth={2} />
                ) : (
                  <MapIcon size={13} color={colors.teal} strokeWidth={2} />
                )}
                <Text style={[styles.sub, { color: colors.textDim }]} numberOfLines={1}>
                  {sottotitolo}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          {tab === 'chat' ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strumentoChat === 'cerca' ? t.accessibilita.chiudiRicerca : t.chat.cerca}
                accessibilityState={{ selected: strumentoChat === 'cerca' }}
                hitSlop={6}
                onPress={() => setStrumentoChat((s) => (s === 'cerca' ? 'chat' : 'cerca'))}
                style={[styles.iconBtn, { backgroundColor: strumentoChat === 'cerca' ? colors.amber : colors.surface }]}
              >
                <SearchIcon size={17} color={strumentoChat === 'cerca' ? colors.inkOnAmber : colors.textDim} />
              </Pressable>
            </>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.menuGruppo} hitSlop={6} onPress={() => setMenuOpen(true)} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
            <MoreIcon size={18} color={colors.textDim} />
          </Pressable>
        </View>
      </View>

      {/* Contenuto e barra delle tab salgono insieme quando si apre la
          tastiera, così la parte bassa della schermata resta appoggiata sopra
          di essa invece di finirci sotto. L'intestazione resta ferma. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
      <TabBarSpaceContext.Provider value={keyboardOpen ? 0 : TABBAR_SPACE}>
      <Sezione attiva={tab === 'chat'}>
        <ChatTab
          groupId={groupId}
          roster={roster}
          attiva={tab === 'chat'}
          strumento={strumentoChat}
          onStrumento={setStrumentoChat}
          onInvita={() => setAggiungendo(true)}
          nomiPronti={nomiPronti}
        />
      </Sezione>
      <Sezione attiva={tab === 'links'}>
        <LinksTab
          groupId={groupId}
          roster={roster}
          onShowPlaceOnMap={(pinId) => {
            setFocusPinId(pinId);
            apriSezione('map');
          }}
        />
      </Sezione>
      {/* La mappa invece si rimonta: il posto da mostrare (focusPinId) lo
          cerca all'arrivo, e una mappa nascosta e poi riapparsa potrebbe
          non essere pronta a spostarsi. */}
      <Sezione attiva={tab === 'map'} resta={false}>
        <MapTab
          groupId={groupId}
          roster={roster}
          focusPinId={focusPinId}
          onFocusHandled={() => setFocusPinId(null)}
        />
      </Sezione>

      <BarraSezioni
        voci={[
          { chiave: 'chat', label: t.gruppo.chat, icona: (c) => <ChatIcon size={21} color={c} /> },
          { chiave: 'links', label: t.gruppo.link, icona: (c) => <LinkIcon size={21} color={c} /> },
          { chiave: 'map', label: t.gruppo.mappa, icona: (c) => <MapIcon size={21} color={c} /> },
        ]}
        attiva={tab}
        onCambia={apriSezione}
      />
      </TabBarSpaceContext.Provider>
      </KeyboardAvoidingView>

      {localGroup ? (
        <GroupInfoSheet
          visible={groupInfoOpen}
          onClose={() => setGroupInfoOpen(false)}
          group={localGroup}
          roster={roster}
          metaNome={meta}
          onLeaveGroup={() => router.replace('/')}
          onShowPlace={(pinId) => {
            setGroupInfoOpen(false);
            setFocusPinId(pinId);
            apriSezione('map');
          }}
        />
      ) : null}

      {localGroup ? <AddPeopleSheet visible={aggiungendo} onClose={() => setAggiungendo(false)} group={localGroup} /> : null}

      {/* Lo stesso menu che il gruppo ha nella home (GroupActionsSheet):
          stesse voci, stesso ordine. Qui in più c'è l'archivio della chat;
          le impostazioni dell'app stanno nella home, non nel gruppo. */}
      <GroupActionsSheet
        group={menuOpen && localGroup ? localGroup : null}
        memberCount={Object.keys(roster).length || null}
        unread={0}
        activity={null}
        extra={
          tab === 'chat'
            ? { icon: <GridIcon size={17} color={colors.textDim} />, label: t.menuGruppo.archivio, onPress: () => setStrumentoChat('archivio') }
            : undefined
        }
        onClose={() => setMenuOpen(false)}
        onInvite={() => setAggiungendo(true)}
        onInfo={() => setGroupInfoOpen(true)}
        onColor={cambiaColore}
        onMarkRead={() => {}}
        onLeave={esci}
      />
    </SafeAreaView>
  );

  if (classe !== 'ampia') return gruppo;
  // Tablet in orizzontale e schermi larghi: i tuoi gruppi a sinistra, il
  // gruppo aperto a destra, come la posta o i messaggi di Android.
  return (
    <View style={[styles.affiancati, { backgroundColor: colors.bg }]}>
      <View style={[styles.elenco, { borderRightColor: colors.border }]}>
        <GroupsLanding pannello={{ selezionato: groupId }} />
      </View>
      {gruppo}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  affiancati: { flex: 1, flexDirection: 'row' },
  elenco: { width: 380, borderRightWidth: 1 },
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
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4, marginTop: 1 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  sub: { fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  centerTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  centerSub: { fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 300, marginBottom: 6 },
  centerBtn: { height: 46, paddingHorizontal: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
