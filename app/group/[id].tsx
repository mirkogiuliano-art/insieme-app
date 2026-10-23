import React, { useEffect, useRef, useState } from 'react';
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
} from '@/components/Icon';
import { listPins } from '@/lib/api/pins';
import { rangeLabel, countdownLabel } from '@/lib/groupInfo';
import type { Group } from '@/types';
import { ScreenGlow } from '@/components/ScreenGlow';
import { TabBarSpaceContext, TABBAR_SPACE, useBarraAnimata } from '@/lib/tabBarSpace';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DECELERA } from '@/lib/movimento';
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
  const barraAnimata = useBarraAnimata();
  // La pastiglia della sezione aperta scorre fino a quella nuova invece
  // di saltarci: si vede da dove si arriva e dove si va.
  const indiceTab = (['chat', 'links', 'map'] as const).indexOf(tab);
  const posizioneTab = useSharedValue(indiceTab);
  const larghezzaTab = useSharedValue(0);
  useEffect(() => {
    posizioneTab.value = withTiming(indiceTab, { duration: 260, easing: DECELERA });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indiceTab]);
  const pastiglia = useAnimatedStyle(() => ({
    width: larghezzaTab.value,
    transform: [{ translateX: posizioneTab.value * (larghezzaTab.value + 4) }],
  }));

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

  // «Lisbona · mancano 39 giorni» sotto il nome. Niente info, niente riga.
  const quando = localGroup
    ? (countdownLabel(localGroup.startsOn, localGroup.endsOn) ?? rangeLabel(localGroup.startsOn, localGroup.endsOn))
    : null;
  // La meta fuori dalla mappa ha il nome sulla riga del gruppo.
  const nomeMeta = meta ?? localGroup?.metaLibera?.nome ?? null;
  const sottotitolo = [nomeMeta, quando].filter(Boolean).join(' · ') || null;

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
                {nomeMeta ? (
                  <MapIcon size={13} color={colors.teal} strokeWidth={2} />
                ) : (
                  <CalendarIcon size={13} color={colors.amberText} strokeWidth={2} />
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

      {/* La barra galleggia davvero sopra il contenuto: le liste e la mappa
          le passano sotto fino al bordo dello schermo, e lei resta leggibile
          perché è quasi opaca e staccata da un'ombra. Quanto spazio lasciarle
          libero in fondo, le sezioni lo leggono da TabBarSpaceContext.
          È sempre presente: con la tastiera si dissolve seguendone il
          movimento, invece di sparire di colpo (vedi useBarraAnimata), e
          mentre è nascosta non si tocca. */}
      <View pointerEvents="box-none" style={styles.tabbarZona}>
      <Animated.View
        accessibilityRole="tablist"
        accessibilityLabel={t.accessibilita.sezioni}
        pointerEvents={keyboardOpen ? 'none' : 'auto'}
        style={[styles.tabbar, { backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(33,44,56,0.9)' }, barraAnimata]}
        onLayout={(e) => {
          // Tre sezioni larghe uguali: la barra meno i 6 punti di bordo per
          // lato e i 4 fra una sezione e l'altra.
          larghezzaTab.value = (e.nativeEvent.layout.width - 12 - 8) / 3;
        }}
      >
        <Animated.View pointerEvents="none" style={[styles.pastiglia, { backgroundColor: colors.amber }, pastiglia]} />
        <TabButton
          label={t.gruppo.chat}
          active={tab === 'chat'}
          onPress={() => apriSezione('chat')}
          icon={<ChatIcon size={21} color={tab === 'chat' ? colors.inkOnAmber : colors.textFaint} />}
          activeText={colors.inkOnAmber}
          inactiveText={colors.textFaint}
        />
        <TabButton
          label={t.gruppo.link}
          active={tab === 'links'}
          onPress={() => apriSezione('links')}
          icon={<LinkIcon size={21} color={tab === 'links' ? colors.inkOnAmber : colors.textFaint} />}
          activeText={colors.inkOnAmber}
          inactiveText={colors.textFaint}
        />
        <TabButton
          label={t.gruppo.mappa}
          active={tab === 'map'}
          onPress={() => apriSezione('map')}
          icon={<MapIcon size={21} color={tab === 'map' ? colors.inkOnAmber : colors.textFaint} />}
          activeText={colors.inkOnAmber}
          inactiveText={colors.textFaint}
        />
      </Animated.View>
      </View>
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

/** Tutte e tre le sezioni portano il nome scritto: con la sola icona due
 * su tre si riconoscevano a memoria, e quella dei link sembrava un video. */
function TabButton({
  label,
  active,
  onPress,
  icon,
  activeText,
  inactiveText,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  activeText: string;
  inactiveText: string;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={3}
      onPress={onPress}
      style={styles.tabBtn}>
      {icon}
      <Text style={[styles.tabLabel, { color: active ? activeText : inactiveText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Una sezione del gruppo. Si monta la prima volta che si apre e poi resta,
 * nascosta quando se ne apre un'altra: rimontarla a ogni cambio rifaceva
 * disegno, letture e iscrizioni al tempo reale, e il cambio si sentiva.
 * Tornando compare in dissolvenza, tranne quella aperta col gruppo, che
 * arriva già con la schermata. Con `resta={false}` si smonta uscendo.
 */
function Sezione({ attiva, resta = true, children }: { attiva: boolean; resta?: boolean; children: React.ReactNode }) {
  const [aperta, setAperta] = useState(attiva);
  const opacita = useSharedValue(attiva ? 1 : 0);
  const prima = useRef(true);
  useEffect(() => {
    const iniziale = prima.current;
    prima.current = false;
    if (!attiva) {
      // Già trasparente quando torna: niente lampo prima della dissolvenza.
      opacita.value = 0;
      return;
    }
    setAperta(true);
    if (iniziale) return;
    opacita.value = withTiming(1, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attiva]);
  const dissolvenza = useAnimatedStyle(() => ({ opacity: opacita.value }));
  if (!attiva && !(resta && aperta)) return null;
  return <Animated.View style={[styles.sezione, dissolvenza, !attiva && styles.nascosta]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  sezione: { flex: 1 },
  nascosta: { display: 'none' },
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
  // La barra resta della misura di un telefono anche sugli schermi
  // larghi, al centro: allungata su 1200 punti le tre sezioni finivano
  // lontanissime fra loro.
  tabbarZona: { position: 'absolute', left: 14, right: 14, bottom: 12, alignItems: 'center' },
  tabbar: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  // Il fondo della sezione aperta, uno solo per tutta la barra: scorre
  // sotto i tasti (vedi `pastiglia` nella schermata).
  pastiglia: { position: 'absolute', top: 6, bottom: 6, left: 6, borderRadius: 17 },
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
  centerBtn: { height: 46, paddingHorizontal: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
