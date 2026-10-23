import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Image,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Pressable } from '@/components/Tocco';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioRecorder, useAudioPlayer, useAudioPlayerStatus, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { useSpazioBarraAnimato } from '@/lib/tabBarSpace';
import Animated from 'react-native-reanimated';
import { useTheme, RADIUS } from '@/theme/theme';
import { SendIcon, ChatIcon, CloseIcon, PlayIcon, MicIcon, TrashIcon, SearchIcon, CheckIcon, ChevronIcon, PlusIcon, ShareIcon, UsersIcon } from '@/components/Icon';
import { ChatLinkPreview } from '@/components/ChatLinkPreview';
import { ChatPlaceCard } from '@/components/ChatPlaceCard';
import { VoiceBubble } from '@/components/VoiceBubble';
import { FileAttachmentBubble } from '@/components/FileAttachmentBubble';
import { ChatAttachSheet } from '@/components/ChatAttachSheet';
import { PollCard } from '@/components/PollCard';
import { NewPollSheet } from '@/components/NewPollSheet';
import { PollVotersSheet } from '@/components/PollVotersSheet';
import { MessageActionsSheet } from '@/components/MessageActionsSheet';
import { ChatArchive } from '@/components/ChatArchive';
import { LoadError } from '@/components/LoadError';
import { InCaricamento } from '@/components/InCaricamento';
import {
  timeLabel,
  initials,
  colorForUser,
  inchiostroPersona,
  splitTextByUrls,
  firstUrl,
  platformInfo,
  formatSeconds,
  normalizeUrl,
  parseGoogleMapsUrl,
  mapsUrlForPlace,
  fileLabelFor,
  withTimeout,
  WRITE_TIMEOUT,
  UPLOAD_TIMEOUT,
} from '@/lib/utils';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import { listMessages, sendMessage, deleteMessage, subscribeToMessages, type RawMessage } from '@/lib/api/messages';
import { toggleReaction, subscribeToReactions, type RawReaction } from '@/lib/api/reactions';
import { listVotes, createPoll, votePoll, closePoll, subscribeToPolls, type RawPoll, type RawVote } from '@/lib/api/polls';
import { uploadGroupMedia, uploadGroupFile, sweepGroupMedia, type AttachmentKind } from '@/lib/api/mediaUpload';
import { updateLastRead, subscribeToLastReads } from '@/lib/api/groupMembers';
import { subscribeToTyping } from '@/lib/api/typing';
import { avvisaDelMessaggio, setGruppoAperto } from '@/lib/api/push';
import { reportMessage, blockUser } from '@/lib/api/moderation';
import * as Location from 'expo-location';
import { parsePlaceMessage, placeMessageText } from '@/lib/chatPlace';
import type { RawPin } from '@/lib/api/pins';
import type { RawPlaceCategory } from '@/lib/api/placeCategories';
import { createLink, type RawLink } from '@/lib/api/links';
import type { RawLinkCategory } from '@/lib/api/linkCategories';
import { useT, dizionario, localeAttuale } from '@/i18n';
import { segnalaErrore } from '@/lib/sentry';
import { messaggioErrore, eProblemaDiRete } from '@/lib/errori';
import { leggiCopia, salvaCopia, useRiprovaDaSola } from '@/lib/copiaLocale';
import { leggiLinkEPosti, salvaCopieGruppo, type CopiaChat, type CopiaChatExtra } from '@/lib/precarica';
import { apriGruppo } from '@/lib/api/apriGruppo';
import { SenzaRete } from '@/components/SenzaRete';

/** Cosa c'è sopra i messaggi: niente, la ricerca o l'archivio. */
export type StrumentoChat = 'chat' | 'cerca' | 'archivio';

interface ChatTabProps {
  groupId: string;
  roster: Record<string, string>;
  /** Lo decidono la lente e la griglia nell'intestazione del gruppo. */
  strumento: StrumentoChat;
  onStrumento: (s: StrumentoChat) => void;
  /** Apre «Aggiungi persone»: lo offre la chat vuota di chi è solo. */
  onInvita?: () => void;
  /** La chat è la sezione a schermo. Resta montata anche dietro a Link e
   * Mappa, e lì non deve segnare come letto né nascondere gli avvisi. */
  attiva?: boolean;
  /** I nomi dei membri sono arrivati, o non arriveranno: la prima volta
   * la chat li aspetta per comparire. */
  nomiPronti: boolean;
}

/** Quanti messaggi per pagina, sia al primo caricamento sia scorrendo
 * all'indietro. */
const PAGE_SIZE = 150;

/** Due messaggi della stessa persona a meno di così si leggono come uno
 * solo: niente nome e niente faccia ripetuti in mezzo. */
const GROUP_GAP_MS = 5 * 60 * 1000;

/** "Oggi", "Ieri", "lunedì 14 settembre": l'etichetta fra i giorni. */
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const oggi = new Date();
  const ieri = new Date();
  ieri.setDate(oggi.getDate() - 1);
  const stesso = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (stesso(d, oggi)) return dizionario().date.oggi;
  if (stesso(d, ieri)) return dizionario().date.ieri;
  const sameYear = d.getFullYear() === oggi.getFullYear();
  const s = d.toLocaleDateString(localeAttuale(), { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}


function highlightSegments(text: string, term: string): { text: string; match: boolean }[] {
  if (!term) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const segments: { text: string; match: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(lowerTerm, i);
    if (idx === -1) {
      segments.push({ text: text.slice(i), match: false });
      break;
    }
    if (idx > i) segments.push({ text: text.slice(i, idx), match: false });
    segments.push({ text: text.slice(idx, idx + term.length), match: true });
    i = idx + term.length;
  }
  return segments;
}

type RigaInfo = { item: RawMessage; index: number };
type VersioneRighe = { disegna: (info: RigaInfo) => React.ReactElement };

/** Un fumetto della chat. Il disegno vero sta in ChatTab, che ne conosce i
 * dati; qui c'è solo il confine che lo salta quando il messaggio, la sua
 * posizione e i dati che mostra sono quelli di prima. */
const RigaMessaggio = memo(function RigaMessaggio({ item, index, versione }: RigaInfo & { versione: VersioneRighe }) {
  return versione.disegna({ item, index });
});

export function ChatTab({ groupId, roster, strumento, onStrumento, onInvita, nomiPronti, attiva = true }: ChatTabProps) {
  const { colors } = useTheme();
  const t = useT();
  const spazioBarra = useSpazioBarraAnimato();
  const { session } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [reactions, setReactions] = useState<RawReaction[]>([]);
  const [polls, setPolls] = useState<RawPoll[]>([]);
  const [votes, setVotes] = useState<RawVote[]>([]);
  const [draft, setDraft] = useState('');
  const [reactSheetFor, setReactSheetFor] = useState<string | null>(null);
  /** Le persone che ho bloccato: i loro messaggi non compaiono qui. */
  const [bloccati, setBloccati] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<RawMessage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [newPollOpen, setNewPollOpen] = useState(false);
  /** Il sondaggio di cui si sta guardando chi ha votato. */
  const [votersFor, setVotersFor] = useState<RawPoll | null>(null);
  /** Conversazione, o archivio di tutto ciò che vi è passato. */
  const mode: 'chat' | 'archive' = strumento === 'archivio' ? 'archive' : 'chat';
  /** Il messaggio a cui tornare uscendo dall'archivio. */
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  // Posti e link del gruppo: servono a disegnare i posti mandati in chat,
  // al "+" per mandarne uno, e a "Salva nei link".
  const [pins, setPins] = useState<RawPin[]>([]);
  const [placeCategories, setPlaceCategories] = useState<RawPlaceCategory[]>([]);
  const [links, setLinks] = useState<RawLink[]>([]);
  const [linkCategories, setLinkCategories] = useState<RawLinkCategory[]>([]);
  /** Posti e categorie arrivati, dal server o dalla copia (o non
   * arriveranno): servono alle schede dei posti mandati in chat. */
  const [postiLetti, setPostiLetti] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  /** Un vocale che non è partito resta sotto la chat, con «Riprova»:
   * prima spariva, e con lui quello che si era detto. */
  const [vocaleNonInviato, setVocaleNonInviato] = useState<{ uri: string; durationSeconds: number; replyToId: string | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Chiusa la ricerca, o passati all'archivio, il testo cercato non serve più.
  useEffect(() => {
    setSearchQuery('');
  }, [strumento]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [lastReads, setLastReads] = useState<Record<string, number | null>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState(false);
  /** Da quando si vede la copia salvata, se il server non ha risposto. */
  const [offlineDal, setOfflineDal] = useState<number | null>(null);
  /** Finita la prima lettura, dal server o dalla copia. Prima, una
   * sezione senza niente sta ancora leggendo, non è vuota. */
  const [letto, setLetto] = useState(false);
  /** Arrivati i dati veri, la copia non deve più sovrascriverli. */
  const daServer = useRef(false);
  /** I messaggi arrivati in tempo reale: una lettura dal server li tiene,
   * se sono più recenti del suo ultimo. Gli altri della copia sul telefono
   * no, perché nel frattempo possono essere stati eliminati. */
  const dalVivo = useRef(new Set<string>());
  // Scorrimento all'indietro: `hasMore` diventa falso quando il database
  // restituisce meno messaggi di quanti ne siano stati chiesti, cioè
  // quando si è arrivati all'inizio della conversazione.
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const listRef = useRef<FlatList<RawMessage>>(null);
  const lastReadCallRef = useRef(0);
  const typingSendRef = useRef<{ send: (userId: string) => void } | null>(null);
  const lastTypingSentRef = useRef(0);
  /** Quando è partito l'ultimo messaggio scritto: subito dopo l'invio il
   * tasto diventa il microfono, e un secondo tocco ravvicinato sullo stesso
   * punto non deve far partire una registrazione. */
  const ultimoInvioRef = useRef(0);

  /** Carica la pagina precedente quando si arriva in cima alla chat.
   * L'elenco è invertito, quindi "la fine" della lista è il messaggio più
   * vecchio: è lì che scatta. */
  const loadOlder = async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[messages.length - 1].ts;
      const older = await listMessages(groupId, PAGE_SIZE, oldest);
      setHasMore(older.length === PAGE_SIZE);
      if (older.length > 0) {
        setMessages((prev) => {
          const visti = new Set(prev.map((m) => m.id));
          return [...prev, ...older.filter((m) => !visti.has(m.id))];
        });
      }
    } catch {
      // silenzioso di proposito: la chat che si ha già resta leggibile, e
      // il tentativo si ripete scorrendo ancora.
    } finally {
      setLoadingOlder(false);
    }
  };

  // Finché questa chat è aperta, gli avvisi di questo gruppo non devono
  // comparire: il messaggio si sta già leggendo, arriva da solo in tempo
  // reale, e una banda che lo annuncia sopra sarebbe solo rumore.
  useEffect(() => {
    if (!attiva) return;
    setGruppoAperto(groupId);
    return () => setGruppoAperto(null);
  }, [groupId, attiva]);

  const markRead = () => {
    const now = Date.now();
    if (now - lastReadCallRef.current < 4000) return;
    lastReadCallRef.current = now;
    updateLastRead(groupId).catch(() => {});
  };

  // Ricerca "come su WhatsApp": scorre la chat già caricata invece di
  // aprire un'altra schermata. È client-side, quindi istantanea, e guarda
  // tutto ciò che è stato caricato — comprese le pagine precedenti tirate
  // su scorrendo all'indietro.
  /** Quello che si vede davvero: i messaggi di chi ho bloccato non
   * compaiono, né quelli vecchi né quelli che arrivano adesso. Il filtro
   * sta qui, in un punto solo, invece che dentro il disegno di ogni
   * riga. */
  const messaggiVisibili = useMemo(
    () => (bloccati.length === 0 ? messages : messages.filter((m) => !bloccati.includes(m.userId))),
    [messages, bloccati],
  );

  // Indici per i fumetti: citazione, sondaggio e posto si trovano qui invece
  // di scorrere le liste intere per ogni messaggio disegnato.
  const messaggiPerId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const sondaggiPerId = useMemo(() => new Map(polls.map((p) => [p.id, p])), [polls]);
  const posti = useMemo(() => {
    const perUrl = new Map<string, RawPin>();
    const perNome = new Map<string, RawPin>();
    // Vince il primo nell'ordine della lista, come faceva la ricerca.
    for (const pin of pins) {
      for (const url of [pin.mapsUrl, mapsUrlForPlace(pin)]) if (url && !perUrl.has(url)) perUrl.set(url, pin);
      if (!perNome.has(pin.name)) perNome.set(pin.name, pin);
    }
    return { perUrl, perNome };
  }, [pins]);

  const searching = mode === 'chat' && searchQuery.trim().length > 0;
  const matches = useMemo(() => {
    if (!searching) return [];
    const term = searchQuery.trim().toLowerCase();
    if (!term) return [];
    const found: { message: RawMessage; index: number }[] = [];
    messaggiVisibili.forEach((m, index) => {
      // Anche il nome dei documenti: "pdf" o "biglietti" devono trovarli.
      const hay = `${m.text ?? ''} ${m.attachmentName ?? ''}`.toLowerCase();
      if (hay.includes(term)) found.push({ message: m, index });
    });
    return found;
  }, [messaggiVisibili, searchQuery, searching]);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (matches.length === 0) return;
    const target = matches[Math.min(currentMatchIndex, matches.length - 1)];
    listRef.current?.scrollToIndex({ index: target.index, animated: true, viewPosition: 0.4 });
  }, [currentMatchIndex, matches]);

  const goToOlderMatch = () => setCurrentMatchIndex((i) => Math.min(i + 1, matches.length - 1));
  const goToNewerMatch = () => setCurrentMatchIndex((i) => Math.max(i - 1, 0));

  /** Posti e link del gruppo, riletti quando servono (aprendo il "+" o il
   * menu di un messaggio): cambiano nelle altre sezioni, e tenerli in
   * tempo reale anche qui costerebbe più di quanto serva. */
  const loadGroupStuff = useCallback(() => {
    // Sono gli stessi delle sezioni Link e Mappa, che così trovano già la
    // loro copia la prima volta che si aprono.
    leggiLinkEPosti(session?.user.id, groupId)
      .then(({ pins: p, placeCats: pc, links: l, linkCats: lc }) => {
        setPins(p);
        setPlaceCategories(pc);
        setLinks(l);
        setLinkCategories(lc);
        setPostiLetti(true);
        salvaCopia<CopiaChatExtra>(session?.user.id, `chat-extra:${groupId}`, { p, pc, l, lc });
      })
      .catch(async () => {
        // Senza rete, posti e categorie dell'ultima volta: servono alle
        // schede dei posti mandati in chat.
        const copia = await leggiCopia<CopiaChatExtra>(session?.user.id, `chat-extra:${groupId}`);
        setPostiLetti(true);
        if (!copia) return;
        setPins((x) => (x.length > 0 ? x : copia.dati.p));
        setPlaceCategories((x) => (x.length > 0 ? x : copia.dati.pc));
        setLinks((x) => (x.length > 0 ? x : copia.dati.l));
        setLinkCategories((x) => (x.length > 0 ? x : copia.dati.lc));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, session?.user.id]);

  useEffect(() => {
    // Posti e categorie dell'ultima volta subito, per le schede dei posti
    // in chat; il server li aggiorna dopo, insieme ai messaggi.
    leggiCopia<CopiaChatExtra>(session?.user.id, `chat-extra:${groupId}`).then((copia) => {
      if (!copia) return;
      setPostiLetti(true);
      setPins((x) => (x.length > 0 ? x : copia.dati.p));
      setPlaceCategories((x) => (x.length > 0 ? x : copia.dati.pc));
      setLinks((x) => (x.length > 0 ? x : copia.dati.l));
      setLinkCategories((x) => (x.length > 0 ? x : copia.dati.lc));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadGroupStuff]);

  // Uscendo dall'archivio si torna al messaggio toccato.
  useEffect(() => {
    if (mode !== 'chat' || !jumpTo) return;
    const index = messaggiVisibiliRef.current.findIndex((m) => m.id === jumpTo);
    setJumpTo(null);
    if (index < 0) return;
    setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 }), 250);
  }, [mode, jumpTo]);

  useEffect(() => {
    if (!recording) {
      setRecordingSeconds(0);
      return;
    }
    const id = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const utente = session?.user.id;
  const mostraCopia = (c: CopiaChat) => {
    setMessages((prev) => (prev.length > 0 ? prev : c.msgs));
    setReactions((prev) => (prev.length > 0 ? prev : c.reacts));
    setPolls((prev) => (prev.length > 0 ? prev : c.sondaggi));
    setVotes((prev) => (prev.length > 0 ? prev : c.voti));
    const bloccatiNellaCopia = c.bloccati;
    if (bloccatiNellaCopia) setBloccati((prev) => (prev.length > 0 ? prev : bloccatiNellaCopia));
  };

  /** Il messaggio vero al posto del suo segnaposto. Se il tempo reale l'ha
   * già portato, il segnaposto se ne va e basta: altrimenti il fumetto
   * compariva due volte. */
  const sostituisciSegnaposto = (tempId: string, sent: RawMessage) =>
    setMessages((prev) =>
      prev.some((m) => m.id === sent.id) ? prev.filter((m) => m.id !== tempId) : prev.map((m) => (m.id === tempId ? sent : m)),
    );

  const loadAll = useCallback(async () => {
    try {
      // Tutto il gruppo in una richiesta sola (vedi apriGruppo): erano una
      // quindicina, e sul telefono partono cinque alla volta.
      const g = await withTimeout(apriGruppo(groupId));
      daServer.current = true;
      // Restano quelli arrivati in tempo reale mentre si leggeva e quelli
      // in invio: il resto lo decide il server.
      const ultimo = g.messaggi[0]?.ts ?? 0;
      setMessages((prev) => [
        ...prev.filter(
          (m) => (m.id.startsWith('temp-') || (dalVivo.current.has(m.id) && m.ts > ultimo)) && !g.messaggi.some((x) => x.id === m.id),
        ),
        ...g.messaggi,
      ]);
      setReactions(g.reazioni);
      setPolls(g.sondaggi);
      setVotes(g.voti);
      // Chi ho bloccato cambia solo per mano di chi guarda, e in quel
      // caso lo aggiorniamo noi (vedi blocca).
      setBloccati(g.bloccati);
      setLastReads(g.lettoAlle);
      setPins(g.posti);
      setPlaceCategories(g.categoriePosti);
      setLinks(g.link);
      setLinkCategories(g.categorieLink);
      setPostiLetti(true);
      setHasMore(g.altriMessaggi);
      setLoadError(false);
      setOfflineDal(null);
      salvaCopieGruppo(utente, groupId, g);
    } catch (err) {
      if (!eProblemaDiRete(err)) segnalaErrore(err, 'caricamento.messaggi');
      // Senza rete la chat già letta resta a schermo, con l'ora della copia.
      const copia = await leggiCopia<CopiaChat>(utente, `chat:${groupId}`);
      if (copia) {
        mostraCopia(copia.dati);
        setOfflineDal(copia.ts);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
      // Posti e categorie restano quelli della copia, se c'è: la chat
      // non li aspetta.
      setPostiLetti(true);
    }
    setLetto(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, utente]);

  useRiprovaDaSola(loadError || offlineDal !== null, loadAll);

  useEffect(() => {
    let cancelled = false;
    daServer.current = false;
    dalVivo.current.clear();
    // Mentre si legge dal server, la copia dell'ultima volta: la chat
    // compare subito anche con la rete lenta o assente.
    leggiCopia<CopiaChat>(utente, `chat:${groupId}`).then((copia) => {
      if (!cancelled && copia && !daServer.current) {
        mostraCopia(copia.dati);
        setLetto(true);
      }
    });
    // Messaggi, posti, link, spunte e bloccati arrivano tutti insieme.
    loadAll();
    markRead();

    const unsubscribeMessages = subscribeToMessages(
      groupId,
      (message) => {
        dalVivo.current.add(message.id);
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [message, ...prev]));
      },
      (id) => setMessages((prev) => prev.filter((m) => m.id !== id)),
    );
    const unsubscribeReactions = subscribeToReactions(groupId, {
      onInsert: (r) => setReactions((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r])),
      onDelete: (id) => setReactions((prev) => prev.filter((r) => r.id !== id)),
    });
    // I conteggi arrivano dagli UPDATE sul sondaggio; chi ha votato cosa si
    // rilegge, perché i voti altrui passano dalle regole di accesso e in un
    // sondaggio segreto non arrivano affatto.
    const unsubscribePolls = subscribeToPolls(groupId, {
      onPoll: (poll) => setPolls((prev) => [poll, ...prev.filter((p) => p.id !== poll.id)]),
      onVotesChanged: () => {
        listVotes(groupId)
          .then(setVotes)
          .catch(() => {});
      },
    });
    const unsubscribeLastReads = subscribeToLastReads(groupId, (userId, lastReadAt) => {
      setLastReads((prev) => ({ ...prev, [userId]: lastReadAt }));
    });
    const typing = subscribeToTyping(groupId, (userId) => {
      setTypingUsers((prev) => ({ ...prev, [userId]: Date.now() }));
    });
    typingSendRef.current = typing;
    setTypingUsers({});

    return () => {
      cancelled = true;
      unsubscribeMessages();
      unsubscribeReactions();
      unsubscribePolls();
      unsubscribeLastReads();
      typing.unsubscribe();
      typingSendRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    // Anche tornando sulla chat: quello che è arrivato intanto ora si vede.
    if (messages.length === 0 || !attiva) return;
    markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, attiva]);

  // Rimuove chi non manda un segnale "sta scrivendo" da almeno 3s.
  useEffect(() => {
    const id = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        let changed = false;
        for (const [userId, ts] of Object.entries(prev)) {
          if (now - ts < 3000) next[userId] = ts;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleDraftChange = (text: string) => {
    setDraft(text);
    const now = Date.now();
    if (text.trim() && session && now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      typingSendRef.current?.send(session.user.id);
    }
  };

  const typingLabel = useMemo(() => {
    const names = Object.keys(typingUsers)
      .filter((uid) => !bloccati.includes(uid))
      .map((uid) => roster[uid] ?? t.segnaposto.qualcuno);
    if (names.length === 0) return null;
    if (names.length === 1) return t.chat.staScrivendo(names[0]);
    if (names.length === 2) return t.chat.stannoScrivendoDue(names[0], names[1]);
    return t.chat.stannoScrivendoTanti(names.length);
  }, [typingUsers, roster, t, bloccati]);

  const reactionsByMessage = useMemo(() => {
    const map: Record<string, { emoji: string; count: number; mine: boolean }[]> = {};
    for (const r of reactions) {
      const list = (map[r.messageId] ??= []);
      let entry = list.find((e) => e.emoji === r.emoji);
      if (!entry) {
        entry = { emoji: r.emoji, count: 0, mine: false };
        list.push(entry);
      }
      entry.count += 1;
      if (session && r.userId === session.user.id) entry.mine = true;
    }
    return map;
  }, [reactions, session]);

  const isReadByOthers = (ts: number) => {
    if (!session) return false;
    return Object.entries(lastReads).some(
      ([userId, readAt]) => userId !== session.user.id && readAt != null && readAt >= ts,
    );
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !session) return;
    const risposta = replyingTo;
    const replyToId = risposta?.id ?? null;
    ultimoInvioRef.current = Date.now();
    setDraft('');
    setReplyingTo(null);
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [{ id: tempId, userId: session.user.id, text, ts: Date.now(), replyToId }, ...prev]);
    try {
      const sent = await withTimeout(sendMessage(groupId, session.user.id, text, replyToId), WRITE_TIMEOUT);
      sostituisciSegnaposto(tempId, sent);
      avvisaDelMessaggio(sent.id);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      // Quello che si era scritto torna nel campo, con la risposta a cui
      // era agganciato: un invio fallito non deve costare il testo. Se nel
      // frattempo si è già cominciato a scrivere altro, non lo si tocca.
      setDraft((attuale) => (attuale.trim() ? attuale : text));
      setReplyingTo((attuale) => attuale ?? risposta);
      segnalaErrore(err, 'chat.erroreInvio');
      toast.show(t.chat.erroreInvio, 'error');
    }
  };

  /** Il tasto in fondo: invia quando c'è del testo, altrimenti registra.
   * Un tocco che arriva entro un attimo dall'invio è il secondo di un
   * doppio tocco su "Invia", non una richiesta di registrare. */
  const inviaORegistra = () => {
    if (draft.trim()) return send();
    if (Date.now() - ultimoInvioRef.current < 800) return;
    return toggleRecording();
  };

  /** Manda un testo preparato (un posto, un link salvato, la propria
   * posizione) con lo stesso invio ottimistico dei messaggi scritti. */
  const sendText = async (text: string) => {
    if (!session) return;
    const replyToId = replyingTo?.id ?? null;
    setReplyingTo(null);
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [{ id: tempId, userId: session.user.id, text, ts: Date.now(), replyToId }, ...prev]);
    try {
      const sent = await withTimeout(sendMessage(groupId, session.user.id, text, replyToId), WRITE_TIMEOUT);
      sostituisciSegnaposto(tempId, sent);
      avvisaDelMessaggio(sent.id);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      segnalaErrore(err, 'chat.erroreInvio');
      toast.show(t.chat.erroreInvio, 'error');
    }
  };

  const placeCategoryFor = (pin: RawPin) =>
    placeCategories.find((c) => c.id === pin.categoryId) ?? { name: t.segnaposto.altro, color: '#75828C' };

  const sendPlace = (pin: RawPin) => sendText(placeMessageText(pin.name, mapsUrlForPlace(pin)));

  /** Il sondaggio nasce sul server insieme al suo messaggio: qui non si
   * anticipa niente a schermo, arrivano entrambi dal tempo reale. */
  const creaSondaggio = async (question: string, options: string[], opts: { multi: boolean; secret: boolean }) => {
    try {
      await withTimeout(createPoll(groupId, question, options, opts), WRITE_TIMEOUT);
      setNewPollOpen(false);
      return null;
    } catch (err) {
      segnalaErrore(err, 'chat.erroreSondaggio');
      return messaggioErrore(err, t.chat.erroreSondaggio);
    }
  };

  /** Il voto si vede subito, e se il server rifiuta si torna com'era. */
  const vota = async (poll: RawPoll, scelte: number[]) => {
    if (!session) return;
    const me = session.user.id;
    const prima = votes;
    setVotes((prev) => [
      ...prev.filter((v) => !(v.pollId === poll.id && v.userId === me)),
      ...scelte.map((optionIndex) => ({ pollId: poll.id, userId: me, optionIndex })),
    ]);
    try {
      await withTimeout(votePoll(poll.id, scelte), WRITE_TIMEOUT);
    } catch (err) {
      setVotes(prima);
      segnalaErrore(err, 'chat.erroreVoto');
      toast.show(messaggioErrore(err, t.chat.erroreVoto), 'error');
    }
  };

  const chiudiSondaggio = async (poll: RawPoll) => {
    try {
      await withTimeout(closePoll(poll.id), WRITE_TIMEOUT);
      setVotersFor(null);
    } catch (err) {
      segnalaErrore(err, 'chat.erroreChiusura');
      toast.show(messaggioErrore(err, t.chat.erroreChiusura), 'error');
    }
  };

  /** Un link salvato: se è un file caricato (foto, video, documento) parte
   * come allegato vero, altrimenti come indirizzo con la sua anteprima. */
  const sendSavedLink = async (link: RawLink) => {
    if (!session) return;
    if (link.platform === 'image' || link.platform === 'video' || link.platform === 'file') {
      try {
        const attachment =
          link.platform === 'file' ? { url: link.url, type: 'file' as const, name: link.title } : { url: link.url, type: link.platform };
        const sent = await withTimeout(sendMessage(groupId, session.user.id, null, null, attachment), WRITE_TIMEOUT);
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [sent, ...prev]));
        avvisaDelMessaggio(sent.id);
      } catch (err) {
        segnalaErrore(err, 'chat.erroreInvio');
        toast.show(t.chat.erroreInvio, 'error');
      }
      return;
    }
    await sendText(link.url);
  };

  const sendMyPosition = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.show(t.chat.permessoPosizione, 'hint');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setAttachMenuOpen(false);
      const { latitude: lat, longitude: lng } = pos.coords;
      await sendText(placeMessageText(t.chat.miaPosizione, `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`));
    } catch (err) {
      segnalaErrore(err, 'chat.errorePosizione');
      toast.show(t.chat.errorePosizione, 'error');
    }
  };

  /** Cosa di un messaggio si può salvare nei link: l'allegato, oppure il
   * primo indirizzo del testo. I posti no: stanno già nella Mappa. */
  const saveableOf = (m: RawMessage | undefined): { url: string; title: string; kind: 'image' | 'video' | 'file' | 'web' } | null => {
    if (!m) return null;
    if (m.attachmentUrl && (m.attachmentType === 'image' || m.attachmentType === 'video' || m.attachmentType === 'file')) {
      return {
        url: m.attachmentUrl,
        kind: m.attachmentType,
        title:
          m.attachmentType === 'file'
            ? m.attachmentName || t.segnaposto.documento
            : m.attachmentType === 'video'
              ? t.segnaposto.video
              : t.segnaposto.foto,
      };
    }
    const url = m.text && !parsePlaceMessage(m.text) ? firstUrl(m.text) : null;
    if (!url) return null;
    const info = platformInfo(url);
    return { url, kind: 'web', title: info.platform === 'web' ? info.host : info.label };
  };

  const saveToLinks = async (m: RawMessage, categoryId: string) => {
    const what = saveableOf(m);
    if (!what || !session) return;
    const url = what.kind === 'web' ? normalizeUrl(what.url) : what.url;
    if (links.some((l) => l.url === url)) {
      toast.show(t.chat.giaNeiLink, 'hint');
      return;
    }
    try {
      const info = platformInfo(url);
      const maps = what.kind === 'web' ? parseGoogleMapsUrl(url) : null;
      const created = await withTimeout(
        createLink(groupId, session.user.id, {
          url,
          title: maps?.name || what.title,
          platform: what.kind === 'web' ? info.platform : what.kind,
          label:
            what.kind === 'file'
              ? fileLabelFor(what.title)
              : what.kind === 'image'
                ? t.segnaposto.foto
                : what.kind === 'video'
                  ? t.segnaposto.video
                  : maps
                    ? 'Google Maps'
                    : info.label,
          thumb: what.kind === 'image' ? url : what.kind === 'web' ? info.thumb : null,
          categoryId,
        }),
        WRITE_TIMEOUT,
      );
      setLinks((prev) => [created, ...prev]);
      toast.show(t.chat.salvatoNeiLink);
    } catch (err) {
      segnalaErrore(err, 'chat.erroreSalvataggio');
      toast.show(t.chat.erroreSalvataggio, 'error');
    }
  };


  const messaggiVisibiliRef = useRef<RawMessage[]>([]);
  messaggiVisibiliRef.current = messaggiVisibili;

  const messaggioSelezionato = reactSheetFor ? messaggiPerId.get(reactSheetFor) : undefined;

  /** La segnalazione non cancella niente e non avvisa la persona
   * segnalata: mette una riga da parte per chi gestisce il servizio. Va
   * detto con chiarezza, altrimenti chi segnala si aspetta che il
   * messaggio sparisca. */
  const segnala = async () => {
    if (!messaggioSelezionato) return;
    const id = messaggioSelezionato.id;
    setReactSheetFor(null);
    try {
      await reportMessage(id, '');
      toast.show(t.chat.segnalazioneInviata);
    } catch (err) {
      segnalaErrore(err, 'chat.erroreSegnalazione');
      toast.show(t.chat.erroreSegnalazione, 'error');
    }
  };

  /** Il blocco vale solo per me: nasconde i suoi messaggi qui, non la
   * caccia dal gruppo. Si toglie dalle impostazioni. */
  const blocca = async () => {
    if (!messaggioSelezionato) return;
    const autore = messaggioSelezionato.userId;
    const nome = roster[autore] ?? t.segnaposto.questaPersona;
    setReactSheetFor(null);
    try {
      await blockUser(autore);
      setBloccati((prev) => (prev.includes(autore) ? prev : [...prev, autore]));
      toast.show(t.chat.bloccato(nome));
    } catch (err) {
      segnalaErrore(err, 'chat.erroreBlocco');
      toast.show(t.chat.erroreBlocco, 'error');
    }
  };

  const pickAttachment = async () => {
    if (!session || uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show(t.chat.permessoFoto, 'hint');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;

    const kind: AttachmentKind = asset.type === 'video' ? 'video' : 'image';
    const replyToId = replyingTo?.id ?? null;
    setReplyingTo(null);
    setUploading(true);
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      { id: tempId, userId: session.user.id, text: null, ts: Date.now(), replyToId, attachmentUrl: asset.uri, attachmentType: kind },
      ...prev,
    ]);
    try {
      const url = await withTimeout(uploadGroupMedia(groupId, asset.uri), UPLOAD_TIMEOUT);
      const sent = await withTimeout(sendMessage(groupId, session.user.id, null, replyToId, { url, type: kind }), WRITE_TIMEOUT);
      sostituisciSegnaposto(tempId, sent);
      avvisaDelMessaggio(sent.id);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      segnalaErrore(err, 'chat.erroreAllegato');
      toast.show(t.chat.erroreAllegato, 'error');
    } finally {
      setUploading(false);
    }
  };

  /** Documenti (PDF, Word, Excel, ...): passa dal selettore di file di
   * sistema invece che dalla galleria foto — a differenza di questa,
   * `expo-document-picker` non richiede un permesso da chiedere prima. */
  const pickDocument = async () => {
    if (!session || uploading) return;
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;

    const replyToId = replyingTo?.id ?? null;
    setReplyingTo(null);
    setUploading(true);
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      {
        id: tempId,
        userId: session.user.id,
        text: null,
        ts: Date.now(),
        replyToId,
        attachmentUrl: asset.uri,
        attachmentType: 'file',
        attachmentName: asset.name,
        attachmentSize: asset.size ?? null,
      },
      ...prev,
    ]);
    try {
      const url = await withTimeout(uploadGroupFile(groupId, asset), UPLOAD_TIMEOUT);
      const sent = await withTimeout(
        sendMessage(groupId, session.user.id, null, replyToId, {
          url,
          type: 'file',
          name: asset.name,
          size: asset.size,
        }),
        WRITE_TIMEOUT,
      );
      sostituisciSegnaposto(tempId, sent);
      avvisaDelMessaggio(sent.id);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      segnalaErrore(err, 'chat.erroreDocumento');
      toast.show(t.chat.erroreDocumento, 'error');
    } finally {
      setUploading(false);
    }
  };

  /** Il proprio messaggio sparisce per tutti. Si toglie subito dallo
   * schermo; se il server rifiuta, torna dov'era. */
  const eliminaMessaggio = async (m: RawMessage) => {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    try {
      await withTimeout(deleteMessage(m.id), WRITE_TIMEOUT);
      // Foto, video, vocali e documenti: li toglie la spazzata, che
      // cerca i file rimasti senza messaggio.
      if (m.attachmentUrl) sweepGroupMedia(groupId);
    } catch (err) {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].sort((a, b) => b.ts - a.ts)));
      segnalaErrore(err, 'chat.erroreElimina');
      toast.show(messaggioErrore(err, t.chat.erroreElimina), 'error');
    }
  };

  /** Un vocale partito per sbaglio si butta: prima l'unico modo di
   * fermarlo era mandarlo. */
  const annullaRegistrazione = async () => {
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      // già fermo: non c'è niente da buttare
    }
  };

  /** Carica e manda un vocale già registrato. Se non riesce resta da
   * parte, per riprovare o buttarlo. */
  const inviaVocale = async (uri: string, durationSeconds: number, replyToId: string | null) => {
    if (!session) return;
    setVocaleNonInviato(null);
    setUploading(true);
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      {
        id: tempId,
        userId: session.user.id,
        text: null,
        ts: Date.now(),
        replyToId,
        attachmentUrl: uri,
        attachmentType: 'audio',
        attachmentDurationSeconds: durationSeconds,
      },
      ...prev,
    ]);
    try {
      const url = await withTimeout(uploadGroupMedia(groupId, uri), UPLOAD_TIMEOUT);
      const sent = await withTimeout(sendMessage(groupId, session.user.id, null, replyToId, { url, type: 'audio', durationSeconds }), WRITE_TIMEOUT);
      sostituisciSegnaposto(tempId, sent);
      avvisaDelMessaggio(sent.id);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setVocaleNonInviato({ uri, durationSeconds, replyToId });
      segnalaErrore(err, 'chat.erroreVocale');
      toast.show(t.chat.erroreVocale, 'error');
    } finally {
      setUploading(false);
    }
  };

  const toggleRecording = async () => {
    if (!session || uploading) return;
    if (recording) {
      setRecording(false);
      const durationSeconds = recordingSeconds;
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;
      const replyToId = replyingTo?.id ?? null;
      setReplyingTo(null);
      await inviaVocale(uri, durationSeconds, replyToId);
    } else {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        toast.show(t.chat.permessoMicrofono, 'hint');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    }
  };

  const toggleChip = async (messageId: string, emoji: string, mine: boolean) => {
    if (!session) return;
    try {
      await toggleReaction(messageId, groupId, session.user.id, emoji, mine);
    } catch (err) {
      segnalaErrore(err, 'chat.erroreReazione');
      toast.show(t.chat.erroreReazione, 'error');
    }
  };

  const currentMatchId = matches[Math.min(currentMatchIndex, matches.length - 1)]?.message.id;

  const renderText = (text: string, own: boolean, term: string) => (
    <Text style={[styles.text, { color: own ? colors.suMio : colors.text }]}>
      {splitTextByUrls(text).map((seg, segIdx) => {
        const inner = term
          ? highlightSegments(seg.text, term).map((s, idx) =>
              s.match ? (
                <Text key={idx} style={styles.matchHighlight}>
                  {s.text}
                </Text>
              ) : (
                <Text key={idx}>{s.text}</Text>
              ),
            )
          : seg.text;
        if (!seg.url) return <Text key={segIdx}>{inner}</Text>;
        return (
          <Text
            key={segIdx}
            style={[styles.link, { color: own ? colors.suMio : colors.teal }]}
            onPress={(e) => {
              // Altrimenti il tocco prosegue fino al fumetto e al posto del
              // link si aprirebbe il menu del messaggio.
              e.stopPropagation?.();
              Linking.openURL(seg.url!);
            }}
          >
            {inner}
          </Text>
        );
      })}
    </Text>
  );

  const disegnaRiga = ({ item, index }: RigaInfo) => {
    const own = session ? item.userId === session.user.id : false;
    const displayName = roster[item.userId] ?? t.segnaposto.utente;
    const chips = reactionsByMessage[item.id] ?? [];
    const quoted = item.replyToId ? (messaggiPerId.get(item.replyToId) ?? null) : null;

    // L'elenco è invertito: il messaggio precedente nel tempo sta dopo
    // nell'array, e si vede sopra.
    const older = messaggiVisibili[index + 1];
    const newer = messaggiVisibili[index - 1];
    const startsDay = !older || !sameDay(older.ts, item.ts);
    const sameAsOlder = !!older && !startsDay && older.userId === item.userId && item.ts - older.ts < GROUP_GAP_MS;
    const sameAsNewer = !!newer && sameDay(newer.ts, item.ts) && newer.userId === item.userId && newer.ts - item.ts < GROUP_GAP_MS;

    // Il testo del messaggio di un sondaggio è la domanda (serve alla
    // ricerca e alla notifica): a schermo però la dice la scheda, quindi
    // qui il fumetto non ci va.
    const poll = item.pollId ? (sondaggiPerId.get(item.pollId) ?? null) : null;
    const place = poll ? null : parsePlaceMessage(item.text);
    const bodyText = poll ? null : place ? place.note : item.text;
    const linkUrl = !poll && !item.attachmentUrl && !place && item.text ? firstUrl(item.text) : null;
    const hasBubble = !!(item.replyToId || item.attachmentUrl || bodyText);

    const term = searching ? searchQuery.trim() : '';
    const isMatch = !!term && `${item.text ?? ''} ${item.attachmentName ?? ''}`.toLowerCase().includes(term.toLowerCase());
    const isCurrentMatch = isMatch && item.id === currentMatchId;

    const placePin = place ? (posti.perUrl.get(place.url) ?? posti.perNome.get(place.name) ?? null) : null;

    const openMenu = () => {
      setReactSheetFor(item.id);
      loadGroupStuff();
    };

    const nomeCitato = quoted ? (roster[quoted.userId] ?? t.segnaposto.utente) : '';

    const timeRow = (
      <View style={styles.timeRow}>
        <Text style={[styles.time, { color: own && hasBubble ? colors.tenueSuMio : colors.textFaint }]}>{timeLabel(item.ts)}</Text>
        {own ? (
          isReadByOthers(item.ts) ? (
            <View style={styles.ticks}>
              <CheckIcon size={11} color={colors.teal} />
              <View style={{ marginLeft: -6 }}>
                <CheckIcon size={11} color={colors.teal} />
              </View>
            </View>
          ) : (
            <CheckIcon size={11} color={hasBubble ? colors.tenueSuMio : colors.textFaint} />
          )
        ) : null}
      </View>
    );

    return (
      <View>
        {startsDay ? (
          <View style={styles.dayWrap}>
            <Text style={[styles.day, { backgroundColor: colors.surface, color: colors.textDim }]}>{dayLabel(item.ts)}</Text>
          </View>
        ) : null}
        <View style={[styles.row, own && styles.rowOwn, { marginBottom: sameAsNewer ? 3 : 12 }]}>
          {!own ? (
            // La faccia sta sull'ultimo messaggio di una serie: la serie si
            // legge come una sola voce.
            sameAsNewer ? (
              <View style={styles.avatarSpacer} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colorForUser(displayName) }]}>
                <Text maxFontSizeMultiplier={1} style={styles.avatarText}>{initials(displayName)}</Text>
              </View>
            )
          ) : null}
          <View style={[styles.bubbleCol, own && { alignItems: 'flex-end' }]}>
            {!own && !sameAsOlder ? <Text style={[styles.name, { color: inchiostroPersona(displayName, colors.bg) }]}>{displayName}</Text> : null}
            {hasBubble ? (
              <Pressable
                onPress={openMenu}
                style={[
                  styles.bubble,
                  own ? styles.bubbleOwn : styles.bubbleOther,
                  own && sameAsOlder && { borderTopRightRadius: 8 },
                  !own && sameAsOlder && { borderTopLeftRadius: 8 },
                  {
                    backgroundColor: own ? colors.mio : colors.surface,
                    // Il contorno c'è sempre ma si vede solo sul risultato di
                    // ricerca corrente: così evidenziandolo il fumetto non
                    // cambia di dimensione e la lista non sobbalza.
                    borderColor: isCurrentMatch ? colors.teal : 'transparent',
                  },
                ]}
              >
                {item.replyToId ? (
                  // Nei messaggi degli altri la citazione prende il colore di
                  // chi viene citato, come il suo nome e le sue iniziali.
                  <View style={[styles.quoteBox, { borderLeftColor: own ? colors.lineaCitazioneMio : colorForUser(nomeCitato), backgroundColor: own ? colors.citazioneMio : colors.surface2 }]}>
                    <Text style={[styles.quoteAuthor, { color: own ? colors.suMio : inchiostroPersona(nomeCitato, colors.surface2) }]} numberOfLines={1}>
                      {quoted ? nomeCitato : ''}
                    </Text>
                    <Text style={[styles.quoteText, { color: own ? colors.tenueSuMio : colors.textDim }]} numberOfLines={2}>
                      {quoted ? (parsePlaceMessage(quoted.text)?.name ?? quoted.text ?? t.segnaposto.allegato) : t.chat.messaggioSparito}
                    </Text>
                  </View>
                ) : null}
                {item.attachmentUrl && item.attachmentType === 'image' ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.apriFoto} onPress={() => setPreviewImage(item.attachmentUrl!)} onLongPress={openMenu}>
                    <Image source={{ uri: item.attachmentUrl }} style={styles.attachmentImage} />
                  </Pressable>
                ) : null}
                {item.attachmentUrl && item.attachmentType === 'video' ? (
                  <Pressable accessibilityRole="button" onPress={() => Linking.openURL(item.attachmentUrl!)} onLongPress={openMenu} style={styles.videoCard}>
                    <PlayIcon size={30} color="#fff" />
                    <Text style={styles.videoCardLabel}>{t.segnaposto.video}</Text>
                  </Pressable>
                ) : null}
                {item.attachmentUrl && item.attachmentType === 'audio' ? (
                  <VoiceBubble uri={item.attachmentUrl} durationSeconds={item.attachmentDurationSeconds} own={own} />
                ) : null}
                {item.attachmentUrl && item.attachmentType === 'file' ? (
                  <FileAttachmentBubble
                    url={item.attachmentUrl}
                    name={item.attachmentName || t.segnaposto.documento}
                    size={item.attachmentSize ?? null}
                    own={own}
                  />
                ) : null}
                {bodyText ? (
                  <View style={{ marginTop: item.attachmentUrl ? 6 : 0 }}>{renderText(bodyText, own, isMatch ? term : '')}</View>
                ) : null}
                {!place && !linkUrl ? timeRow : null}
              </Pressable>
            ) : null}
            {place ? (
              <ChatPlaceCard name={place.name} url={place.url} pin={placePin} category={placePin ? placeCategoryFor(placePin) : null} onMenu={openMenu} />
            ) : null}
            {poll ? (
              <PollCard
                poll={poll}
                votes={votes.filter((v) => v.pollId === poll.id)}
                myId={session?.user.id ?? ''}
                roster={roster}
                onVote={(scelte) => vota(poll, scelte)}
                onOpenVoters={() => setVotersFor(poll)}
                onMenu={openMenu}
              />
            ) : null}
            {linkUrl ? <ChatLinkPreview url={linkUrl} onMenu={openMenu} /> : null}
            {place || linkUrl || poll ? <Pressable accessibilityRole="button" onPress={openMenu}>{timeRow}</Pressable> : null}
            {chips.length > 0 ? (
              <View style={styles.reactionsRow}>
                {chips.map((c) => (
                  <Pressable accessibilityRole="button"
                    key={c.emoji}
                    onPress={() => toggleChip(item.id, c.emoji, c.mine)}
                    style={[styles.reactionChip, { backgroundColor: colors.surface, borderColor: c.mine ? colors.amber : 'transparent' }]}
                  >
                    <Text style={[styles.reactionChipText, { color: colors.textDim }]}>
                      {c.emoji} {c.count}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  // Ogni fumetto si ridisegna solo quando cambia qualcosa che mostra.
  // Prima ogni lettera scritta nel campo in basso, ogni secondo di
  // registrazione e ogni "sta scrivendo" degli altri ridisegnavano tutti i
  // messaggi caricati: con 150 messaggi, su un telefono economico, un terzo
  // di secondo per tasto.
  const disegnaRigaRef = useRef(disegnaRiga);
  disegnaRigaRef.current = disegnaRiga;
  const versioneRighe = useMemo<VersioneRighe>(
    () => ({ disegna: (info) => disegnaRigaRef.current(info) }),
    // Tutto quello che il disegno di un fumetto legge, anche nei tocchi
    // (votare, reagire, aprire il menu). Un dato che cambia qui ridisegna
    // tutte le righe; uno che mancasse le lascerebbe alla versione vecchia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, roster, t, colors, groupId, messages, messaggiVisibili, reactionsByMessage, polls, votes, pins, placeCategories, lastReads, searching, searchQuery, currentMatchId, loadGroupStuff],
  );
  const renderItem = useCallback(
    ({ item, index }: RigaInfo) => <RigaMessaggio item={item} index={index} versione={versioneRighe} />,
    [versioneRighe],
  );

  const selezionato = messaggioSelezionato ?? null;
  /** Nel gruppo non c'è ancora nessun altro. */
  const soloIo = !!session && Object.keys(roster).length === 1 && !!roster[session.user.id];
  /** La prima volta la chat compare tutta insieme: messaggi, nomi e posti.
   * Arrivavano a pezzi, e per un attimo chi scriveva si chiamava «Utente»
   * e la scheda di un posto era grigia. Le volte dopo c'è già tutto nelle
   * copie salvate, e compare subito. */
  const pronta = letto && nomiPronti && postiLetti;
  const salvabile = saveableOf(messaggioSelezionato);

  return (
    // La gestione della tastiera è salita al contenitore della schermata
    // (app/group/[id].tsx), che alza insieme chat e barra delle tab: due
    // KeyboardAvoidingView annidati si ostacolerebbero a vicenda.
    <View style={{ flex: 1 }}>
      {/* La ricerca compare quando la si apre con la lente in alto, e
          nell'archivio. Sempre in vista toglieva ai messaggi una riga
          intera, per una cosa che si fa ogni tanto. */}
      {strumento !== 'chat' ? (
      <View style={styles.topBar}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: searching ? colors.amber : 'transparent' }]}>
          <SearchIcon size={15} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={mode === 'chat' ? t.chat.cerca : t.chat.cercaArchivio}
            autoFocus={strumento === 'cerca'}
            placeholderTextColor={colors.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? (
            <Text style={[styles.searchCounter, { color: colors.textFaint }]}>
              {t.chat.risultatoDi(matches.length === 0 ? 0 : currentMatchIndex + 1, matches.length)}
            </Text>
          ) : null}
          {searchQuery ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.cancellaRicerca} onPress={() => setSearchQuery('')} hitSlop={8}>
              <CloseIcon size={13} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        {searching ? (
          <>
            <Pressable accessibilityRole="button"
              onPress={goToOlderMatch}
              hitSlop={4}
              disabled={matches.length === 0}
              style={[styles.viewBtn, { backgroundColor: colors.surface, opacity: matches.length === 0 ? 0.4 : 1 }]}
              accessibilityLabel={t.chat.precedente}
            >
              <View style={{ transform: [{ rotate: '-90deg' }] }}>
                <ChevronIcon size={16} color={colors.textDim} />
              </View>
            </Pressable>
            <Pressable accessibilityRole="button"
              onPress={goToNewerMatch}
              hitSlop={4}
              disabled={matches.length === 0}
              style={[styles.viewBtn, { backgroundColor: colors.surface, opacity: matches.length === 0 ? 0.4 : 1 }]}
              accessibilityLabel={t.chat.successivo}
            >
              <View style={{ transform: [{ rotate: '90deg' }] }}>
                <ChevronIcon size={16} color={colors.textDim} />
              </View>
            </Pressable>
          </>
        ) : mode === 'archive' ? (
          <Pressable accessibilityRole="button"
            onPress={() => onStrumento('chat')}
            hitSlop={4}
            style={[styles.viewBtn, { backgroundColor: colors.amber }]}
            accessibilityLabel={t.chat.tornaChat}
          >
            <ChatIcon size={17} color={colors.inkOnAmber} />
          </Pressable>
        ) : null}
      </View>
      ) : null}

      {offlineDal ? (
        <SenzaRete dal={offlineDal} onRetry={loadAll} />
      ) : loadError ? (
        <LoadError what={t.erroreCaricamento.messaggi} onRetry={loadAll} />
      ) : null}

      {mode === 'archive' ? (
        <ChatArchive
          messages={messaggiVisibili}
          query={searchQuery}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
          onOpen={(id) => {
            setSearchQuery('');
            setJumpTo(id);
            onStrumento('chat');
          }}
        />
      ) : (
        <>
          {!pronta && !loadError ? (
            <View style={styles.empty}>
              <InCaricamento />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.empty}>
              {/* Con l’avviso d’errore sopra, «non c’è niente» sarebbe falso. */}
              {loadError ? null : soloIo ? (
                // Un gruppo con una persona sola non è ancora un gruppo: la
                // prima cosa da fare è far entrare qualcuno, non scrivere.
                <>
                  <View style={[styles.soloIcona, { backgroundColor: colors.surface }]}>
                    <UsersIcon size={28} color={colors.textDim} strokeWidth={1.8} />
                  </View>
                  <Text style={[styles.soloTitolo, { color: colors.text }]}>{t.chat.soloTuTitolo}</Text>
                  <Text style={[styles.emptyText, styles.soloTesto, { color: colors.textDim }]}>{t.chat.soloTuTesto}</Text>
                  {onInvita ? (
                    <Pressable accessibilityRole="button" onPress={onInvita} style={[styles.soloBtn, { backgroundColor: colors.amber }]}>
                      <ShareIcon size={16} color={colors.inkOnAmber} />
                      <Text style={[styles.soloBtnText, { color: colors.inkOnAmber }]}>{t.chat.soloTuInvita}</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
                  <ChatIcon size={38} color={colors.textFaint} strokeWidth={1.6} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>
                    {t.chat.vuoto}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <FlatList
              ref={listRef}
              inverted
              style={{ flex: 1 }}
              data={messaggiVisibili}
              keyExtractor={(m) => m.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              onEndReached={loadOlder}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                loadingOlder ? (
                  <View style={styles.olderLoader}>
                    <ActivityIndicator size="small" color={colors.textFaint} />
                  </View>
                ) : null
              }
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.4 });
                }, 100);
              }}
            />
          )}

          {replyingTo ? (
            <View style={[styles.replyBar, { backgroundColor: colors.surface }]}>
              <View style={[styles.replyBarStripe, { backgroundColor: colorForUser(roster[replyingTo.userId] ?? t.segnaposto.utente) }]} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.replyBarAuthor, { color: inchiostroPersona(roster[replyingTo.userId] ?? t.segnaposto.utente, colors.surface) }]}
                  numberOfLines={1}
                >
                  {roster[replyingTo.userId] ?? t.segnaposto.utente}
                </Text>
                <Text style={[styles.replyBarText, { color: colors.textDim }]} numberOfLines={1}>
                  {parsePlaceMessage(replyingTo.text)?.name ?? replyingTo.text ?? t.segnaposto.allegato}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.annullaRisposta} onPress={() => setReplyingTo(null)} hitSlop={8} style={{ padding: 4 }}>
                <CloseIcon size={14} color={colors.textFaint} />
              </Pressable>
            </View>
          ) : null}

          {typingLabel ? (
            <View style={styles.typingRow}>
              <Text style={{ fontSize: 12, color: colors.textFaint, fontStyle: 'italic' }}>{typingLabel}</Text>
            </View>
          ) : null}

          {vocaleNonInviato && !recording ? (
            <View style={[styles.replyBar, { backgroundColor: colors.surface }]}>
              <MicIcon size={16} color={colors.danger} />
              <Text style={[styles.vocaleFermo, { color: colors.text }]} numberOfLines={1}>
                {t.chat.vocaleNonInviato(formatSeconds(vocaleNonInviato.durationSeconds))}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setVocaleNonInviato(null)} hitSlop={8}>
                <Text style={[styles.vocaleAzione, { color: colors.textDim }]}>{t.comune.elimina}</Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                disabled={uploading}
                onPress={() => void inviaVocale(vocaleNonInviato.uri, vocaleNonInviato.durationSeconds, vocaleNonInviato.replyToId)}
                hitSlop={8}
              >
                <Text style={[styles.vocaleAzione, { color: colors.amberText }]}>{t.comune.riprova}</Text>
              </Pressable>
            </View>
          ) : null}

          {recording ? (
            <View style={[styles.inputBar, { backgroundColor: colors.surface }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.eliminaVocale} hitSlop={5} onPress={annullaRegistrazione} style={[styles.attachBtn, { backgroundColor: colors.surface2 }]}>
                <TrashIcon size={17} color={colors.danger} />
              </Pressable>
              <View style={styles.recordingRow}>
                <View style={styles.recordingDot} />
                <Text style={{ fontSize: 14, color: colors.text }}>{t.chat.registrazione(formatSeconds(recordingSeconds))}</Text>
              </View>
              {/* Lo stesso tasto che lo ha fatto partire, ora con la freccia:
                  si vede che fermandolo il vocale parte. */}
              <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.inviaVocale} hitSlop={5} onPress={toggleRecording} style={[styles.sendBtn, { backgroundColor: colors.amber }]}>
                <SendIcon size={18} color={colors.inkOnAmber} />
              </Pressable>
            </View>
          ) : (
            <View style={[styles.inputBar, { backgroundColor: colors.surface }]}>
              <Pressable accessibilityRole="button"
                onPress={() => {
                  loadGroupStuff();
                  setAttachMenuOpen(true);
                }}
                disabled={uploading}
                hitSlop={5}
                style={[styles.attachBtn, { backgroundColor: colors.surface2, opacity: uploading ? 0.5 : 1 }]}
                accessibilityLabel={t.chat.allega}
              >
                {uploading ? <ActivityIndicator size="small" color={colors.textDim} /> : <PlusIcon size={17} color={colors.textDim} />}
              </Pressable>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder={t.chat.scrivi}
                placeholderTextColor={colors.textFaint}
                value={draft}
                onChangeText={handleDraftChange}
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={send}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={draft.trim() ? t.accessibilita.invia : t.accessibilita.registra}
                hitSlop={5}
                onPress={inviaORegistra}
                disabled={uploading}
                style={[styles.sendBtn, { backgroundColor: colors.amber, opacity: uploading ? 0.5 : 1 }]}
              >
                {draft.trim() ? <SendIcon size={18} color={colors.inkOnAmber} /> : <MicIcon size={19} color={colors.inkOnAmber} />}
              </Pressable>
            </View>
          )}
        </>
      )}
      {/* Il posto della barra delle sezioni, che galleggia qui sotto. */}
      <Animated.View style={spazioBarra} />

      <NewPollSheet visible={newPollOpen} onClose={() => setNewPollOpen(false)} onCreate={creaSondaggio} />

      <PollVotersSheet
        poll={votersFor}
        votes={votersFor ? votes.filter((v) => v.pollId === votersFor.id) : []}
        myId={session?.user.id ?? ''}
        roster={roster}
        onClose={() => setVotersFor(null)}
        onCloseePoll={chiudiSondaggio}
      />

      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.chiudiFoto} style={styles.previewBackdrop} onPress={() => setPreviewImage(null)}>
          {previewImage ? <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>

      <MessageActionsSheet
        message={selezionato}
        authorName={selezionato ? (roster[selezionato.userId] ?? t.segnaposto.questaPersona) : ''}
        isMine={!!selezionato && selezionato.userId === session?.user.id}
        myReactions={selezionato ? (reactionsByMessage[selezionato.id] ?? []).filter((c) => c.mine).map((c) => c.emoji) : []}
        saveable={salvabile ? { title: salvabile.title } : null}
        linkCategories={linkCategories}
        onClose={() => setReactSheetFor(null)}
        onReact={(emoji) => {
          if (!selezionato || !session) return;
          const mine = reactionsByMessage[selezionato.id]?.find((e) => e.emoji === emoji)?.mine ?? false;
          toggleReaction(selezionato.id, groupId, session.user.id, emoji, mine).catch((err) => {
            segnalaErrore(err, 'chat.erroreReazione');
            toast.show(t.chat.erroreReazione, 'error');
          });
        }}
        onReply={() => selezionato && setReplyingTo(selezionato)}
        onSaveToLinks={(categoryId) => selezionato && saveToLinks(selezionato, categoryId)}
        onReport={segnala}
        onBlock={blocca}
        onCopied={() => toast.show(t.chat.testoCopiato)}
        onDelete={
          selezionato && selezionato.userId === session?.user.id && !selezionato.pollId && !selezionato.id.startsWith('temp-')
            ? () => eliminaMessaggio(selezionato)
            : undefined
        }
      />

      <ChatAttachSheet
        visible={attachMenuOpen}
        onClose={() => setAttachMenuOpen(false)}
        pins={pins}
        categoryFor={placeCategoryFor}
        links={links}
        onMedia={pickAttachment}
        onDocument={pickDocument}
        onPlace={sendPlace}
        onLink={sendSavedLink}
        onMyPosition={sendMyPosition}
        onPoll={() => setNewPollOpen(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  search: { flex: 1, height: 40, borderRadius: RADIUS.sm, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11 },
  searchInput: { flex: 1, fontSize: 13.5, paddingVertical: 0 },
  searchCounter: { fontSize: 11.5, fontWeight: '700' },
  viewBtn: { width: 40, height: 40, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  dayWrap: { alignItems: 'center', marginTop: 6, marginBottom: 12 },
  day: { fontSize: 10.5, fontWeight: '800', paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  avatarSpacer: { width: 26 },
  olderLoader: { paddingVertical: 14, alignItems: 'center' },
  list: { paddingHorizontal: 14, paddingVertical: 10 },
  row: { flexDirection: 'row', gap: 8, maxWidth: '88%', alignItems: 'flex-end' },
  rowOwn: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '800', color: '#1B2530' },
  bubbleCol: { flexShrink: 1, gap: 4 },
  // L'angolo dal lato di chi scrive resta stretto: è la "codina" che dice
  // da che parte arriva il messaggio, ora che i fumetti non hanno più un
  // contorno a delimitarli.
  bubble: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleOwn: { borderBottomRightRadius: 6 },
  bubbleOther: { borderBottomLeftRadius: 6 },
  matchHighlight: { backgroundColor: '#F2C14E', color: '#2B2109' },
  name: { fontSize: 11, fontWeight: '800', marginLeft: 4 },
  quoteBox: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  quoteAuthor: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  quoteText: { fontSize: 12 },
  text: { fontSize: 14.5, lineHeight: 20 },
  link: { textDecorationLine: 'underline', fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  time: { fontSize: 10 },
  ticks: { flexDirection: 'row', alignItems: 'center' },
  attachmentImage: { width: 220, height: 220, borderRadius: RADIUS.sm },
  videoCard: {
    width: 220,
    height: 140,
    borderRadius: RADIUS.sm,
    backgroundColor: '#1B2530',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  videoCardLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  reactionChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  reactionChipText: { fontSize: 11.5, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
  soloIcona: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  soloTitolo: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  soloTesto: { maxWidth: 280, fontSize: 13.5, lineHeight: 19 },
  soloBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 22, borderRadius: 999, marginTop: 8 },
  soloBtnText: { fontSize: 14.5, fontWeight: '800' },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 14, marginBottom: 6, borderRadius: RADIUS.sm },
  replyBarStripe: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  vocaleFermo: { flex: 1, fontSize: 13, fontWeight: '700' },
  vocaleAzione: { fontSize: 13, fontWeight: '800' },
  replyBarAuthor: { fontSize: 12, fontWeight: '700' },
  replyBarText: { fontSize: 12.5, marginTop: 1 },
  typingRow: { paddingHorizontal: 16, paddingTop: 6 },
  replyAction: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, marginTop: 4, borderTopWidth: 1 },
  // Una pastiglia sola che contiene graffetta, testo e invio, invece di
  // tre pezzi separati sopra una riga di separazione.
  inputBar: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 7,
    borderRadius: 26,
  },
  attachBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  recordingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D9555C' },
  input: { flex: 1, paddingHorizontal: 6, paddingVertical: 9, fontSize: 14.5 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '80%' },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 10 },
  emojiBtn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  emojiBtnText: { fontSize: 28 },
});
