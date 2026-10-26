import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
} from 'react-native';
import { Pressable } from '@/components/Tocco';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme, RADIUS, FONT_ROUNDED } from '@/theme/theme';
import { useAppStore, groupColor } from '@/lib/appStore';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import { BottomSheet } from '@/components/BottomSheet';
import { SettingsSheet, type SettingsPage } from '@/components/SettingsSheet';
import { LoadError } from '@/components/LoadError';
import { InCaricamento } from '@/components/InCaricamento';
import { SenzaRete } from '@/components/SenzaRete';
import { SettingsIcon, PlusIcon, UsersIcon, SearchIcon, CloseIcon, SortIcon, CheckIcon, MoreIcon, CalendarIcon, PollIcon, LockIcon } from '@/components/Icon';
import { FilterChip } from '@/components/FilterChip';
import { NewGroupSheet } from '@/components/NewGroupSheet';
import { GroupActionsSheet } from '@/components/GroupActionsSheet';
import { GroupInfoSheet } from '@/components/GroupInfoSheet';
import { createGroupWithMembership, setGroupColor } from '@/lib/api/groups';
import { listRoster, updateLastRead } from '@/lib/api/groupMembers';
import { storage } from '@/lib/storage';
import { leggiCopia, salvaCopia } from '@/lib/copiaLocale';
import { precaricaGruppi } from '@/lib/precarica';
import { AddPeopleSheet } from '@/components/AddPeopleSheet';
import { InvitoInArrivo } from '@/components/InvitoInArrivo';
import { RisultatiPubblici } from '@/components/RisultatiPubblici';
import { mieiInviti, rispondiInvito, type InvitoRicevuto } from '@/lib/api/invitiPersona';
import { listGroupPreviews, type GroupPreview } from '@/lib/api/groupPreviews';
import { initials, inkOn, withTimeout, WRITE_TIMEOUT, timeLabel, dateLabel } from '@/lib/utils';
import { countdownLabel, rangeLabel } from '@/lib/groupInfo';
import { fitFontSize, LETTER_SPACING_EM } from '@/lib/fitText';
import { useFinestra } from '@/lib/finestra';
import type { Group } from '@/types';
import { ScreenGlow } from '@/components/ScreenGlow';
import { Logo } from '@/components/Logo';
import { useT, dizionario, localeAttuale } from '@/i18n';
import { segnalaErrore } from '@/lib/sentry';
import { messaggioErrore } from '@/lib/errori';

/** Quante facce stanno sulla scheda prima di riassumere il resto in "+N". */
const AVATARS_SHOWN = 3;

/** In che ordine si vedono i gruppi. Preferenza di chi guarda. */
type GroupsSort = 'recent' | 'name' | 'created';
const SORT_KEY = 'groupsSort';
const SORT_ORDER: GroupsSort[] = ['recent', 'name', 'created'];

/** "attivo 2 min fa", "attivo ieri": per il menu del gruppo. Non è un
 * componente e non può usare un hook, quindi legge la lingua da `dizionario()`. */
function activityLabel(ts: number | null | undefined): string | null {
  if (!ts) return null;
  const a = dizionario().attivita;
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return a.ora;
  if (min < 60) return a.minuti(min);
  const ore = Math.floor(min / 60);
  if (ore < 24) return a.ore(ore);
  const giorni = Math.floor(ore / 24);
  return giorni === 1 ? a.ieri : a.giorni(giorni);
}

/** L'ora dell'ultimo messaggio se è di oggi, altrimenti il giorno. */
function quandoUltimo(ts: number): string {
  return new Date(ts).toDateString() === new Date().toDateString() ? timeLabel(ts) : dateLabel(ts);
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
        // Il nome è già grande quanto la scheda: se Android lo ingrandisse
        // ancora (testo di sistema più grande) finirebbe tagliato coi puntini.
        maxFontSizeMultiplier={1}
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

/**
 * La home. Con `pannello` è il riquadro a sinistra del gruppo aperto, sugli
 * schermi larghi: le schede restano in colonna, quella del gruppo aperto è
 * evidenziata, e toccarne un'altra cambia gruppo invece di aprirne uno sopra.
 */
export function GroupsLanding({ pannello }: { pannello?: { selezionato: string } } = {}) {
  const { colors } = useTheme();
  const t = useT();
  const { classe, larghezza } = useFinestra();
  // Sugli schermi larghi le schede vanno a griglia invece di allungarsi:
  // due colonne da tablet in su, tre oltre i 1200 punti.
  const colonne = pannello || classe === 'compatta' ? 1 : larghezza >= 1200 ? 3 : 2;
  const larghezzaScheda = colonne > 1 ? Math.floor((larghezza - 48 - 16 * (colonne - 1)) / colonne) : undefined;
  const SORT_LABELS: Record<GroupsSort, string> = {
    recent: t.home.ordineRecente,
    name: t.home.ordineNome,
    created: t.home.ordineCreazione,
  };
  const router = useRouter();
  const toast = useToast();
  const { profile, session } = useAuth();
  const utente = session?.user.id;
  const { myGroups, addGroup, loadError, offlineDal, refreshGroups, leaveGroup } = useAppStore();

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
  /** Il gruppo a cui si stanno aggiungendo persone. */
  const [aggiungiA, setAggiungiA] = useState<Group | null>(null);
  /** Gli inviti arrivati, in cima alla lista. */
  const [inviti, setInviti] = useState<InvitoRicevuto[]>([]);
  const [rispondendo, setRispondendo] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  /** Quali gruppi si vedono: tutti, quelli con novità, quelli con le date davanti. */
  const [filtro, setFiltro] = useState<'tutti' | 'novita' | 'arrivo'>('tutti');
  const [sort, setSort] = useState<GroupsSort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  /** Il gruppo di cui è aperto il menu. */
  const [actionsFor, setActionsFor] = useState<Group | null>(null);
  /** Info gruppo aperto dalla home, con i suoi membri. */
  const [infoFor, setInfoFor] = useState<{ group: Group; roster: Record<string, string> } | null>(null);

  /** Le anteprime ci sono, dal server o dalla copia sul telefono, e
   * l'ordine scelto è stato letto: sono loro a decidere dove sta ogni
   * gruppo. Prima la home li mostrava in un ordine e, un attimo dopo, li
   * rimescolava. */
  const [anteprimePronte, setAnteprimePronte] = useState(false);
  const [ordineLetto, setOrdineLetto] = useState(false);
  const pronta = anteprimePronte && ordineLetto;

  useEffect(() => {
    storage
      .get<GroupsSort>(SORT_KEY)
      .then((v) => {
        if (v && SORT_ORDER.includes(v)) setSort(v);
      })
      .finally(() => setOrdineLetto(true));
  }, []);

  // Le anteprime dell'ultima volta subito: l'ordine dei gruppi è già
  // quello giusto, e il server lo aggiorna appena risponde.
  useEffect(() => {
    leggiCopia<Record<string, GroupPreview>>(utente, 'anteprime').then((copia) => {
      if (!copia) return;
      setPreviews((prev) => (Object.keys(prev).length > 0 ? prev : copia.dati));
      setAnteprimePronte(true);
    });
  }, [utente]);

  /** Tiene le anteprime arrivate dal server e ne salva la copia. Una
   * lettura non riuscita torna vuota (vedi listGroupPreviews): allora
   * restano quelle che c'erano, invece di rimescolare i gruppi. */
  const tieniAnteprime = (p: Record<string, GroupPreview>): boolean => {
    setAnteprimePronte(true);
    if (Object.keys(p).length === 0 && myGroups.length > 0) return false;
    setPreviews(p);
    salvaCopia(utente, 'anteprime', p);
    return true;
  };

  const reloadPreviews = () => listGroupPreviews().then(tieniAnteprime);

  // Ricaricate a ogni ritorno sulla schermata, non solo al primo
  // montaggio: uscendo da una chat i non letti di quel gruppo sono
  // appena stati azzerati e l'ultimo messaggio è cambiato, e questa
  // schermata resta montata sotto quella del gruppo.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      mieiInviti()
        .then((i) => alive && setInviti(i))
        .catch(() => {});
      listGroupPreviews().then((p) => {
        if (!alive || !tieniAnteprime(p)) return;
        // Intanto si scaricano i gruppi non ancora aperti, o con novità.
        void precaricaGruppi(utente, myGroups, p);
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
      segnalaErrore(err, 'home.erroreCrea');
      return messaggioErrore(err, t.home.erroreCrea);
    }
  };

  const changeColor = async (g: Group, color: string) => {
    try {
      await withTimeout(setGroupColor(g.id, color), WRITE_TIMEOUT);
      await refreshGroups();
    } catch (err) {
      segnalaErrore(err, 'home.erroreColore');
      toast.show(t.home.erroreColore, 'error');
    }
  };

  const markRead = async (g: Group) => {
    try {
      await updateLastRead(g.id);
      await reloadPreviews();
    } catch (err) {
      segnalaErrore(err, 'home.erroreLetto');
      toast.show(t.home.erroreLetto, 'error');
    }
  };

  const openInfo = async (g: Group) => {
    // Il foglio si apre subito con i nomi salvati sul telefono, e quelli del
    // server li aggiornano quando arrivano. Prima si aspettava la rete, e
    // intanto il tocco sembrava non aver fatto niente.
    const copia = await leggiCopia<Record<string, string>>(utente, `membri:${g.id}`);
    setInfoFor({ group: g, roster: copia?.dati ?? {} });
    listRoster(g.id)
      .then((roster) => setInfoFor((aperto) => (aperto?.group.id === g.id ? { group: g, roster } : aperto)))
      .catch(() => {});
  };

  const leave = async (g: Group) => {
    try {
      await leaveGroup(g.id);
      await reloadPreviews();
    } catch (err) {
      segnalaErrore(err, 'home.erroreUscita');
      toast.show(t.home.erroreUscita, 'error');
    }
  };

  const chooseSort = (next: GroupsSort) => {
    setSort(next);
    storage.set(SORT_KEY, next);
    setSortOpen(false);
  };

  const term = query.trim().toLowerCase();
  const conNovita = (g: Group) => (previews[g.id]?.unread ?? 0) > 0;
  // Le date ancora davanti, o in corso: dove c'è un conto alla rovescia.
  const inArrivo = (g: Group) => countdownLabel(g.startsOn, g.endsOn) !== null;
  const shownGroups = myGroups
    .filter((g) => !term || g.name.toLowerCase().includes(term))
    .filter((g) => (filtro === 'novita' ? conNovita(g) : filtro === 'arrivo' ? inArrivo(g) : true))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, localeAttuale(), { sensitivity: 'base' });
      if (sort === 'created') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      const la = previews[a.id]?.lastAt ?? a.createdAt ?? 0;
      const lb = previews[b.id]?.lastAt ?? b.createdAt ?? 0;
      return lb - la;
    });

  // Sul telefono un gruppo è grande, il primo con novità nell'ordine scelto
  // (o il primo, se non ce ne sono), e gli altri vanno a coppie. Sugli
  // schermi larghi e nel riquadro accanto al gruppo aperto sono tutti grandi.
  const aCoppie = colonne === 1 && !pannello;
  const inEvidenza = aCoppie ? (shownGroups.find(conNovita) ?? shownGroups[0]) : undefined;
  const larghezzaPiccola = Math.floor((larghezza - 48 - 12) / 2);

  const apri = (g: Group) => (pannello ? router.replace(`/group/${g.id}`) : router.push(`/group/${g.id}`));

  /** Nel gruppo ci sono solo io e l'ultimo messaggio è mio: il nome non
   * direbbe niente. Se è di qualcuno che poi è uscito, il nome resta. */
  const scrittoDaMe = (g: Group) => {
    const p = previews[g.id];
    return p?.memberCount === 1 && p.ultimo?.autore === p.memberNames[0];
  };

  /** Le iniziali dei primi membri, appena sovrapposte: si leggono tutte. */
  const facce = (g: Group, tint: string, ink: string, quante: number) => {
    const preview = previews[g.id];
    const shown = preview?.memberNames.slice(0, quante) ?? [];
    const extra = (preview?.memberCount ?? 0) - shown.length;
    if (shown.length === 0) return null;
    if (preview?.memberCount === 1) {
      return (
        <View style={styles.soloTu}>
          <LockIcon size={11} color={ink} />
          <Text maxFontSizeMultiplier={1} style={[styles.avatarText, { color: ink }]}>{t.home.soloTu}</Text>
        </View>
      );
    }
    return (
      <View style={styles.avatars}>
        {shown.map((name, i) => (
          <View key={`${name}-${i}`} style={[styles.avatar, { borderColor: tint, marginLeft: i === 0 ? 0 : -4 }]}>
            <Text maxFontSizeMultiplier={1} style={[styles.avatarText, { color: ink }]}>{initials(name)}</Text>
          </View>
        ))}
        {extra > 0 ? (
          <View style={[styles.avatar, { borderColor: tint, marginLeft: -4 }]}>
            <Text maxFontSizeMultiplier={1} style={[styles.avatarText, { color: ink }]}>+{extra}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  /** Il menu del gruppo: anche tenendo premuta la scheda, ma sul web la
   * pressione lunga non arriva. */
  const tastoMenu = (g: Group, ink: string) => (
    <Pressable
      accessibilityRole="button"
      onPress={(e) => {
        e.stopPropagation?.();
        setActionsFor(g);
      }}
      hitSlop={10}
      style={styles.cardMore}
      accessibilityLabel={t.home.menuDi(g.name)}
    >
      <MoreIcon size={18} color={ink} />
    </Pressable>
  );

  const nuovi = (n: number, tint: string, ink: string) => (
    <View style={[styles.unread, { backgroundColor: ink }]}>
      <Text style={[styles.unreadText, { color: tint }]}>{t.home.nuoviN(n)}</Text>
    </View>
  );

  /**
   * La scheda grande: il nome, quanto manca e, in un riquadro un tono più
   * scuro, l'ultimo messaggio e il sondaggio da votare. La scheda è tutta
   * della tinta del gruppo, e il testo sopra è una versione molto scura
   * della stessa tinta invece di un nero qualunque: contro sette colori
   * diversi un nero unico risulta sempre un po' estraneo a ciascuno.
   */
  const schedaGrande = (g: Group) => {
    const tint = groupColor(g);
    const ink = inkOn(tint);
    const preview = previews[g.id];
    const quando = countdownLabel(g.startsOn, g.endsOn) ?? rangeLabel(g.startsOn, g.endsOn);
    const ultimo = preview?.ultimo;
    const daVotare = preview?.daVotare;
    const mio = scrittoDaMe(g);
    return (
      <Pressable
        key={g.id}
        onPress={() => apri(g)}
        onLongPress={() => setActionsFor(g)}
        accessibilityState={pannello ? { selected: pannello.selezionato === g.id } : undefined}
        style={[
          styles.groupCard,
          { backgroundColor: tint },
          larghezzaScheda ? { width: larghezzaScheda } : null,
          pannello?.selezionato === g.id ? [styles.aperta, { borderColor: colors.text }] : null,
        ]}
      >
        <View style={styles.cardTesta}>
          {preview && preview.unread > 0 ? nuovi(preview.unread, tint, ink) : <View />}
          {facce(g, tint, ink, AVATARS_SHOWN)}
        </View>
        <NomeGruppo name={g.name} color={ink} />
        <View style={styles.cardRiga}>
          {quando ? <CalendarIcon size={14} color={ink} strokeWidth={2} /> : null}
          <Text maxFontSizeMultiplier={1.3} style={[styles.cardStato, { color: ink }]} numberOfLines={1}>
            {quando ?? (ultimo ? '' : t.home.nessunMessaggio)}
          </Text>
          {tastoMenu(g, ink)}
        </View>
        {ultimo || daVotare ? (
          <View style={styles.dentro}>
            {ultimo ? (
              <View style={styles.dentroRiga}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.dentroChi, { color: ink }]} numberOfLines={1}>
                  {mio ? null : <Text style={styles.dentroForte}>{ultimo.autore}</Text>}
                  {preview?.lastAt ? `${mio ? '' : ' · '}${quandoUltimo(preview.lastAt)}` : ''}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.dentroTesto, { color: ink }]} numberOfLines={1}>
                  {ultimo.testo}
                </Text>
              </View>
            ) : null}
            {daVotare ? (
              <View style={[styles.dentroRiga, ultimo ? styles.dentroSotto : null]}>
                <View style={styles.dentroEtichetta}>
                  <PollIcon size={13} color={ink} />
                  <Text maxFontSizeMultiplier={1.3} style={[styles.dentroChi, styles.dentroForte, { color: ink }]}>
                    {t.home.daVotare(daVotare.quanti)}
                  </Text>
                </View>
                <Text maxFontSizeMultiplier={1.3} style={[styles.dentroTesto, { color: ink }]} numberOfLines={1}>
                  {daVotare.domanda}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    );
  };

  /** Le altre schede, a coppie: il nome su due righe, l'ultimo messaggio o
   * quanto manca, le iniziali. */
  const tessera = (g: Group) => {
    const tint = groupColor(g);
    const ink = inkOn(tint);
    const preview = previews[g.id];
    const ultimo = preview?.ultimo;
    const riga = ultimo
      ? (scrittoDaMe(g) ? ultimo.testo : `${ultimo.autore}: ${ultimo.testo}`)
      : (countdownLabel(g.startsOn, g.endsOn) ?? rangeLabel(g.startsOn, g.endsOn) ?? t.home.nessunMessaggio);
    return (
      <Pressable
        key={g.id}
        onPress={() => apri(g)}
        onLongPress={() => setActionsFor(g)}
        style={[styles.tessera, { backgroundColor: tint, width: larghezzaPiccola }]}
      >
        <View style={styles.tesseraTesta}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.tesseraNome, { color: ink }]} numberOfLines={2}>
            {g.name}
          </Text>
          {tastoMenu(g, ink)}
        </View>
        <Text maxFontSizeMultiplier={1.3} style={[styles.tesseraRiga, { color: ink }]} numberOfLines={2}>
          {riga}
        </Text>
        <View style={styles.tesseraPiede}>
          {facce(g, tint, ink, 2)}
          {preview && preview.unread > 0 ? nuovi(preview.unread, tint, ink) : null}
        </View>
      </Pressable>
    );
  };

  const rispondi = async (invito: InvitoRicevuto, entra: boolean) => {
    if (rispondendo) return;
    setRispondendo(invito.id);
    try {
      const g = await withTimeout(rispondiInvito(invito.id, entra), WRITE_TIMEOUT);
      setInviti((prev) => prev.filter((i) => i.id !== invito.id));
      if (g) {
        addGroup(g);
        router.push(`/group/${g.id}`);
      }
    } catch (err) {
      segnalaErrore(err, 'invitoRicevuto.errore');
      toast.show(t.invitoRicevuto.errore, 'error');
    } finally {
      setRispondendo(null);
    }
  };

  return (
    // Anche `bottom`: senza, la barra in fondo finisce sotto la barra di
    // navigazione di sistema, che in modalità edge-to-edge si sovrappone al
    // contenuto invece di restringere la finestra.
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <ScreenGlow />
      <View style={styles.header}>
        <View style={styles.marchio}>
          <Logo size={28} />
          <Text style={[styles.nomeApp, { color: colors.text }]}>{t.home.marchio}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.impostazioni} hitSlop={6} onPress={() => setSettingsAt('settings')} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
            <SettingsIcon size={18} color={colors.textDim} />
          </Pressable>
          {/* Le proprie iniziali portano dritte al profilo: nome, documenti,
              uscita ed eliminazione dell'account. */}
          <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.profilo} hitSlop={6} onPress={() => setSettingsAt('profile')} style={[styles.meAvatar, { backgroundColor: colors.amber }]}>
            <Text maxFontSizeMultiplier={1} style={[styles.meAvatarText, { color: colors.inkOnAmber }]}>{initials(profile?.displayName ?? '')}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{t.home.titolo}</Text>

      {/* La stessa riga di Link, Mappa e Chat: la ricerca e "Nuovo". */}
      <View style={styles.topBar}>
        <View style={[styles.search, { backgroundColor: colors.surface }]}>
          <SearchIcon size={15} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t.home.cerca}
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.cancellaRicerca} onPress={() => setQuery('')} hitSlop={8}>
              <CloseIcon size={13} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setCreateOpen(true)} style={[styles.newBtn, { backgroundColor: colors.amber }]}>
          <PlusIcon size={13} color={colors.inkOnAmber} />
          <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 13 }}>{t.home.nuovo}</Text>
        </Pressable>
      </View>
      {myGroups.length > 1 ? (
        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24 }}>
            {/* L'ordine è un'icona sola: il criterio lo dice il foglio che apre. */}
            <FilterChip label={t.accessibilita.ordina(SORT_LABELS[sort])} soloIcona icon={<SortIcon size={13} color={colors.textDim} />} onPress={() => setSortOpen(true)} />
            <FilterChip label={t.home.tutti} count={myGroups.length} active={filtro === 'tutti'} onPress={() => setFiltro('tutti')} />
            <FilterChip label={t.home.conNovita} count={myGroups.filter(conNovita).length} active={filtro === 'novita'} onPress={() => setFiltro('novita')} />
            <FilterChip label={t.home.inArrivo} count={myGroups.filter(inArrivo).length} active={filtro === 'arrivo'} onPress={() => setFiltro('arrivo')} />
          </ScrollView>
        </View>
      ) : null}

      {offlineDal ? (
        <SenzaRete dal={offlineDal} onRetry={refreshGroups} style={styles.avviso} />
      ) : loadError ? (
        <LoadError what={t.erroreCaricamento.gruppi} onRetry={refreshGroups} style={styles.avviso} />
      ) : null}

      <ScrollView contentContainerStyle={[styles.list, colonne > 1 && styles.griglia]}>
        {inviti.map((i) => (
          <InvitoInArrivo
            key={i.id}
            invito={i}
            busy={rispondendo === i.id}
            onRisposta={(entra) => rispondi(i, entra)}
            style={larghezzaScheda ? { width: larghezzaScheda } : null}
          />
        ))}
        {pronta && myGroups.length > 0 && shownGroups.length === 0 && !term ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textFaint }]}>
              {term ? t.home.nessunoCon(query.trim()) : filtro === 'arrivo' ? t.home.nessunoInArrivo : t.home.tuttiLetti}
            </Text>
          </View>
        ) : null}
        {myGroups.length === 0 && !loadError ? (
          <View style={styles.empty}>
            <UsersIcon size={38} color={colors.textFaint} />
            <Text style={[styles.emptyText, { color: colors.textFaint }]}>
              {t.home.vuoto}
            </Text>
          </View>
        ) : !pronta ? (
          // La prima volta su questo telefono, finché non arrivano le
          // anteprime: i gruppi compaiono già al loro posto.
          <View style={styles.empty}>
            <InCaricamento />
          </View>
        ) : aCoppie ? (
          <>
            {inEvidenza ? schedaGrande(inEvidenza) : null}
            {shownGroups.length > 1 ? (
              <View style={styles.coppie}>{shownGroups.filter((g) => g !== inEvidenza).map(tessera)}</View>
            ) : null}
          </>
        ) : (
          shownGroups.map((g) => schedaGrande(g))
        )}
        {/* Cercando, sotto i tuoi gruppi: gruppi pubblici e persone. */}
        {term ? <RisultatiPubblici testo={query} tuoiTrovati={shownGroups.length} /> : null}
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
        onInvite={setAggiungiA}
        onInfo={openInfo}
        onColor={changeColor}
        onMarkRead={markRead}
        onLeave={leave}
      />

      {aggiungiA ? <AddPeopleSheet visible onClose={() => setAggiungiA(null)} group={aggiungiA} /> : null}

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
        <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 8 }]}>{t.home.ordinaPer}</Text>
        {SORT_ORDER.map((k, i) => (
          <Pressable accessibilityRole="button"
            key={k}
            onPress={() => chooseSort(k)}
            style={[styles.sortRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <Text style={[styles.sortLabel, { color: colors.text, fontWeight: sort === k ? '800' : '600' }]}>{SORT_LABELS[k]}</Text>
            {sort === k ? <CheckIcon size={17} color={colors.amberText} /> : null}
          </Pressable>
        ))}
      </BottomSheet>

      {/* Invito creato */}
      <BottomSheet visible={!!inviteOpen} onClose={() => setInviteOpen(null)}>
        {inviteOpen ? (
          <>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{t.home.creatoTitolo}</Text>
            <Text style={[styles.sheetSub, { color: colors.textDim }]}>
              {t.home.creatoTesto(inviteOpen.name)}
            </Text>
            {/* Un gruppo si può tenere per sé: «Per ora solo io» apre il
                gruppo, l'invito resta il tasto principale. */}
            <View style={styles.sheetActions}>
              <Pressable accessibilityRole="button"
                onPress={() => {
                  const g = inviteOpen;
                  setInviteOpen(null);
                  router.push(`/group/${g.id}`);
                }}
                style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{t.home.perOraSoloIo}</Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                onPress={() => {
                  const g = inviteOpen;
                  setInviteOpen(null);
                  setAggiungiA(g);
                }}
                style={[styles.btnPrimary, styles.btnConIcona, { backgroundColor: colors.amber }]}
              >
                <PlusIcon size={14} color={colors.inkOnAmber} />
                <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>{t.aggiungiPersone.titolo}</Text>
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
  marchio: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nomeApp: { fontFamily: FONT_ROUNDED, fontSize: 20, letterSpacing: -0.3 },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, paddingHorizontal: 24, paddingBottom: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  meAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  meAvatarText: { fontSize: 11, fontWeight: '800' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingBottom: 8 },
  search: { flex: 1, height: 40, borderRadius: RADIUS.sm, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 13.5, paddingVertical: 0 },
  newBtn: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, borderRadius: 999 },
  filters: { paddingBottom: 4 },
  sortRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  sortLabel: { flex: 1, fontSize: 15 },
  cardMore: { opacity: 0.75 },
  cardStato: { flex: 1, fontSize: 13, fontWeight: '700' },
  list: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 12, gap: 16, flexGrow: 1 },
  griglia: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  // Gli avvisi sopra le schede, con gli stessi margini delle schede.
  avviso: { marginHorizontal: 24 },
  // Il gruppo aperto accanto, nel riquadro a sinistra.
  aperta: { borderWidth: 3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30, paddingTop: 80 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 18 },

  // La scheda grande: in cima i nuovi e le facce, poi il nome, quanto manca
  // col menu, e il riquadro con l'ultimo messaggio e il sondaggio.
  groupCard: { borderRadius: 24, padding: 18, paddingBottom: 16, gap: 8, overflow: 'hidden' },
  cardTesta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 26 },
  cardRiga: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatars: { flexDirection: 'row' },
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
  soloTu: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 9, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.42)' },
  // Dimensione, interlinea e spaziatura le calcola NomeGruppo in base alla
  // lunghezza del nome: qui resta solo il carattere, arrotondato perché
  // quello di sistema risultava spento in mezzo a tutto quel colore.
  groupName: { fontFamily: FONT_ROUNDED },
  unread: { height: 22, paddingHorizontal: 9, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  unreadText: { fontSize: 11, fontWeight: '800' },
  // Un tono più scuro della tinta, senza bordo: si legge come parte della
  // scheda.
  dentro: { marginTop: 4, borderRadius: 16, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.1)' },
  dentroRiga: { paddingVertical: 9, gap: 2 },
  dentroSotto: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' },
  dentroEtichetta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dentroChi: { fontSize: 12 },
  dentroForte: { fontWeight: '800' },
  dentroTesto: { fontSize: 14 },
  // Le schede a coppie: due per riga, alte uguali.
  coppie: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tessera: { minHeight: 150, borderRadius: 22, padding: 14, gap: 6 },
  tesseraTesta: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  tesseraNome: { flex: 1, fontFamily: FONT_ROUNDED, fontSize: 19, lineHeight: 23, letterSpacing: 19 * LETTER_SPACING_EM },
  tesseraRiga: { fontSize: 12.5, fontWeight: '700' },
  tesseraPiede: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

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
  sheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 2 },
  sheetSub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  mInput: { borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14.5, marginBottom: 10 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnConIcona: { flexDirection: 'row', gap: 7 },
});
