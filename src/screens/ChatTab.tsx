import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  Image,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioRecorder, useAudioPlayer, useAudioPlayerStatus, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { useTheme, RADIUS } from '@/theme/theme';
import { SendIcon, ChatIcon, CloseIcon, PlayIcon, MicIcon, StopIcon, SearchIcon, CheckIcon, ChevronIcon, PlusIcon, GridIcon } from '@/components/Icon';
import { ChatLinkPreview } from '@/components/ChatLinkPreview';
import { ChatPlaceCard } from '@/components/ChatPlaceCard';
import { VoiceBubble } from '@/components/VoiceBubble';
import { FileAttachmentBubble } from '@/components/FileAttachmentBubble';
import { ChatAttachSheet } from '@/components/ChatAttachSheet';
import { MessageActionsSheet } from '@/components/MessageActionsSheet';
import { ChatArchive } from '@/components/ChatArchive';
import { LoadError } from '@/components/LoadError';
import {
  timeLabel,
  initials,
  colorForUser,
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
import { listMessages, sendMessage, subscribeToMessages, type RawMessage } from '@/lib/api/messages';
import { listReactions, toggleReaction, subscribeToReactions, type RawReaction } from '@/lib/api/reactions';
import { uploadGroupMedia, uploadGroupFile, type AttachmentKind } from '@/lib/api/mediaUpload';
import { listLastReads, updateLastRead, subscribeToLastReads } from '@/lib/api/groupMembers';
import { subscribeToTyping } from '@/lib/api/typing';
import { avvisaDelMessaggio, setGruppoAperto } from '@/lib/api/push';
import { reportMessage, blockUser, listBlocked } from '@/lib/api/moderation';
import * as Location from 'expo-location';
import { parsePlaceMessage, placeMessageText } from '@/lib/chatPlace';
import { listPins, type RawPin } from '@/lib/api/pins';
import { listCategories as listPlaceCategories, type RawPlaceCategory } from '@/lib/api/placeCategories';
import { listLinks, createLink, type RawLink } from '@/lib/api/links';
import { listCategories as listLinkCategories, type RawLinkCategory } from '@/lib/api/linkCategories';

interface ChatTabProps {
  groupId: string;
  roster: Record<string, string>;
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
  if (stesso(d, oggi)) return 'Oggi';
  if (stesso(d, ieri)) return 'Ieri';
  const sameYear = d.getFullYear() === oggi.getFullYear();
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
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

export function ChatTab({ groupId, roster }: ChatTabProps) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [reactions, setReactions] = useState<RawReaction[]>([]);
  const [draft, setDraft] = useState('');
  const [reactSheetFor, setReactSheetFor] = useState<string | null>(null);
  /** Le persone che ho bloccato: i loro messaggi non compaiono qui. */
  const [bloccati, setBloccati] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<RawMessage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  /** Conversazione, o archivio di tutto ciò che vi è passato. */
  const [mode, setMode] = useState<'chat' | 'archive'>('chat');
  /** Il messaggio a cui tornare uscendo dall'archivio. */
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  // Posti e link del gruppo: servono a disegnare i posti mandati in chat,
  // al "+" per mandarne uno, e a "Salva nei link".
  const [pins, setPins] = useState<RawPin[]>([]);
  const [placeCategories, setPlaceCategories] = useState<RawPlaceCategory[]>([]);
  const [links, setLinks] = useState<RawLink[]>([]);
  const [linkCategories, setLinkCategories] = useState<RawLinkCategory[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [lastReads, setLastReads] = useState<Record<string, number | null>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState(false);
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
    setGruppoAperto(groupId);
    return () => setGruppoAperto(null);
  }, [groupId]);

  // L'elenco dei bloccati si legge una volta all'apertura: cambia solo
  // per mano di chi sta guardando, e in quel caso lo aggiorniamo noi.
  useEffect(() => {
    let alive = true;
    listBlocked().then((ids) => {
      if (alive) setBloccati(ids);
    });
    return () => {
      alive = false;
    };
  }, []);

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
    Promise.all([listPins(groupId), listPlaceCategories(groupId), listLinks(groupId), listLinkCategories(groupId)])
      .then(([p, pc, l, lc]) => {
        setPins(p);
        setPlaceCategories(pc);
        setLinks(l);
        setLinkCategories(lc);
      })
      .catch(() => {});
  }, [groupId]);

  useEffect(() => {
    loadGroupStuff();
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

  /** Messaggi e reazioni insieme: se la lettura fallisce si mostra
   * l'avviso, invece di una chat che sembra semplicemente vuota. */
  const loadAll = useCallback(async () => {
    try {
      const [msgs, reacts] = await withTimeout(Promise.all([listMessages(groupId, PAGE_SIZE), listReactions(groupId)]));
      setMessages(msgs);
      setReactions(reacts);
      setHasMore(msgs.length === PAGE_SIZE);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [groupId]);

  useEffect(() => {
    let cancelled = false;
    loadAll();
    listLastReads(groupId).then((data) => {
      if (!cancelled) setLastReads(data);
    });
    markRead();

    const unsubscribeMessages = subscribeToMessages(groupId, (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [message, ...prev]));
    });
    const unsubscribeReactions = subscribeToReactions(groupId, {
      onInsert: (r) => setReactions((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r])),
      onDelete: (id) => setReactions((prev) => prev.filter((r) => r.id !== id)),
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
      unsubscribeLastReads();
      typing.unsubscribe();
      typingSendRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (messages.length === 0) return;
    markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

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
    const names = Object.keys(typingUsers).map((uid) => roster[uid] ?? 'Qualcuno');
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} sta scrivendo…`;
    if (names.length === 2) return `${names[0]} e ${names[1]} stanno scrivendo…`;
    return `${names.length} persone stanno scrivendo…`;
  }, [typingUsers, roster]);

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
    const replyToId = replyingTo?.id ?? null;
    setDraft('');
    setReplyingTo(null);
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [{ id: tempId, userId: session.user.id, text, ts: Date.now(), replyToId }, ...prev]);
    try {
      const sent = await withTimeout(sendMessage(groupId, session.user.id, text, replyToId), WRITE_TIMEOUT);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)));
      avvisaDelMessaggio(sent.id);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.show('Messaggio non inviato, riprova.');
    }
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
      setMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)));
      avvisaDelMessaggio(sent.id);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.show('Messaggio non inviato, riprova.');
    }
  };

  const placeCategoryFor = (pin: RawPin) =>
    placeCategories.find((c) => c.id === pin.categoryId) ?? { name: 'Altro', color: '#75828C' };

  const sendPlace = (pin: RawPin) => sendText(placeMessageText(pin.name, mapsUrlForPlace(pin)));

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
      } catch {
        toast.show('Messaggio non inviato, riprova.');
      }
      return;
    }
    await sendText(link.url);
  };

  const sendMyPosition = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.show('Serve il permesso di posizione per mandare dove sei.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setAttachMenuOpen(false);
      const { latitude: lat, longitude: lng } = pos.coords;
      await sendText(placeMessageText('La mia posizione', `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`));
    } catch {
      toast.show('Non sono riuscito a leggere la tua posizione.');
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
        title: m.attachmentType === 'file' ? m.attachmentName || 'Documento' : m.attachmentType === 'video' ? 'Video' : 'Foto',
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
      toast.show('È già nella sezione Link.');
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
                ? 'Foto'
                : what.kind === 'video'
                  ? 'Video'
                  : maps
                    ? 'Google Maps'
                    : info.label,
          thumb: what.kind === 'image' ? url : what.kind === 'web' ? info.thumb : null,
          categoryId,
        }),
        WRITE_TIMEOUT,
      );
      setLinks((prev) => [created, ...prev]);
      toast.show('Salvato nella sezione Link');
    } catch {
      toast.show('Non sono riuscito a salvarlo nei link.');
    }
  };


  const messaggiVisibiliRef = useRef<RawMessage[]>([]);
  messaggiVisibiliRef.current = messaggiVisibili;

  const messaggioSelezionato = reactSheetFor ? messages.find((m) => m.id === reactSheetFor) : undefined;

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
      toast.show('Segnalazione inviata. La guarderemo al più presto.');
    } catch {
      toast.show('Non sono riuscito a inviare la segnalazione.');
    }
  };

  /** Il blocco vale solo per me: nasconde i suoi messaggi qui, non la
   * caccia dal gruppo. Si toglie dalle impostazioni. */
  const blocca = async () => {
    if (!messaggioSelezionato) return;
    const autore = messaggioSelezionato.userId;
    const nome = roster[autore] ?? 'questa persona';
    setReactSheetFor(null);
    try {
      await blockUser(autore);
      setBloccati((prev) => (prev.includes(autore) ? prev : [...prev, autore]));
      toast.show(`Non vedrai più i messaggi di ${nome}.`);
    } catch {
      toast.show('Non sono riuscito a bloccare questa persona.');
    }
  };

  const pickAttachment = async (mediaType: 'images' | 'videos') => {
    if (!session || uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show('Serve il permesso per accedere alle foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [mediaType], quality: 0.7 });
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
      setMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)));
      avvisaDelMessaggio(sent.id);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.show("Invio dell'allegato non riuscito, riprova.");
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
      setMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)));
      avvisaDelMessaggio(sent.id);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.show("Invio del documento non riuscito, riprova.");
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
        setMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)));
      avvisaDelMessaggio(sent.id);
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        toast.show('Invio del vocale non riuscito, riprova.');
      } finally {
        setUploading(false);
      }
    } else {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        toast.show('Serve il permesso per usare il microfono.');
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
    } catch {
      toast.show('Non sono riuscito a salvare la reazione.');
    }
  };

  const currentMatchId = matches[Math.min(currentMatchIndex, matches.length - 1)]?.message.id;

  const renderText = (text: string, own: boolean, term: string) => (
    <Text style={[styles.text, { color: own ? colors.inkOnAmber : colors.text }]}>
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
            style={[styles.link, { color: own ? colors.inkOnAmber : colors.teal }]}
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

  const renderItem = ({ item, index }: { item: RawMessage; index: number }) => {
    const own = session ? item.userId === session.user.id : false;
    const displayName = roster[item.userId] ?? 'Utente';
    const chips = reactionsByMessage[item.id] ?? [];
    const quoted = item.replyToId ? messages.find((m) => m.id === item.replyToId) : null;

    // L'elenco è invertito: il messaggio precedente nel tempo sta dopo
    // nell'array, e si vede sopra.
    const older = messaggiVisibili[index + 1];
    const newer = messaggiVisibili[index - 1];
    const startsDay = !older || !sameDay(older.ts, item.ts);
    const sameAsOlder = !!older && !startsDay && older.userId === item.userId && item.ts - older.ts < GROUP_GAP_MS;
    const sameAsNewer = !!newer && sameDay(newer.ts, item.ts) && newer.userId === item.userId && newer.ts - item.ts < GROUP_GAP_MS;

    const place = parsePlaceMessage(item.text);
    const bodyText = place ? place.note : item.text;
    const linkUrl = !item.attachmentUrl && !place && item.text ? firstUrl(item.text) : null;
    const hasBubble = !!(item.replyToId || item.attachmentUrl || bodyText);

    const term = searching ? searchQuery.trim() : '';
    const isMatch = !!term && `${item.text ?? ''} ${item.attachmentName ?? ''}`.toLowerCase().includes(term.toLowerCase());
    const isCurrentMatch = isMatch && item.id === currentMatchId;

    const placePin = place
      ? pins.find((p) => p.mapsUrl === place.url || mapsUrlForPlace(p) === place.url) ?? pins.find((p) => p.name === place.name) ?? null
      : null;

    const openMenu = () => {
      setReactSheetFor(item.id);
      loadGroupStuff();
    };

    const timeRow = (
      <View style={styles.timeRow}>
        <Text style={[styles.time, { color: own && hasBubble ? '#6B5730' : colors.textFaint }]}>{timeLabel(item.ts)}</Text>
        {own ? (
          isReadByOthers(item.ts) ? (
            <View style={styles.ticks}>
              <CheckIcon size={11} color={colors.teal} />
              <View style={{ marginLeft: -6 }}>
                <CheckIcon size={11} color={colors.teal} />
              </View>
            </View>
          ) : (
            <CheckIcon size={11} color={hasBubble ? '#6B5730' : colors.textFaint} />
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
                <Text style={styles.avatarText}>{initials(displayName)}</Text>
              </View>
            )
          ) : null}
          <View style={[styles.bubbleCol, own && { alignItems: 'flex-end' }]}>
            {!own && !sameAsOlder ? <Text style={[styles.name, { color: colors.teal }]}>{displayName}</Text> : null}
            {hasBubble ? (
              <Pressable
                onPress={openMenu}
                style={[
                  styles.bubble,
                  own ? styles.bubbleOwn : styles.bubbleOther,
                  own && sameAsOlder && { borderTopRightRadius: 8 },
                  !own && sameAsOlder && { borderTopLeftRadius: 8 },
                  {
                    backgroundColor: own ? colors.amber : colors.surface,
                    // Il contorno c'è sempre ma si vede solo sul risultato di
                    // ricerca corrente: così evidenziandolo il fumetto non
                    // cambia di dimensione e la lista non sobbalza.
                    borderColor: isCurrentMatch ? colors.teal : 'transparent',
                  },
                ]}
              >
                {item.replyToId ? (
                  <View style={[styles.quoteBox, { borderLeftColor: own ? '#6B5730' : colors.teal, backgroundColor: own ? '#C98A22' : colors.surface2 }]}>
                    <Text style={[styles.quoteAuthor, { color: own ? '#3D2E10' : colors.teal }]} numberOfLines={1}>
                      {quoted ? (roster[quoted.userId] ?? 'Utente') : ''}
                    </Text>
                    <Text style={[styles.quoteText, { color: own ? '#4A3A18' : colors.textDim }]} numberOfLines={2}>
                      {quoted ? (parsePlaceMessage(quoted.text)?.name ?? quoted.text ?? 'Allegato') : 'Messaggio non disponibile'}
                    </Text>
                  </View>
                ) : null}
                {item.attachmentUrl && item.attachmentType === 'image' ? (
                  <Pressable onPress={() => setPreviewImage(item.attachmentUrl!)} onLongPress={openMenu}>
                    <Image source={{ uri: item.attachmentUrl }} style={styles.attachmentImage} />
                  </Pressable>
                ) : null}
                {item.attachmentUrl && item.attachmentType === 'video' ? (
                  <Pressable onPress={() => Linking.openURL(item.attachmentUrl!)} onLongPress={openMenu} style={styles.videoCard}>
                    <PlayIcon size={30} color="#fff" />
                    <Text style={styles.videoCardLabel}>Video</Text>
                  </Pressable>
                ) : null}
                {item.attachmentUrl && item.attachmentType === 'audio' ? (
                  <VoiceBubble uri={item.attachmentUrl} durationSeconds={item.attachmentDurationSeconds} own={own} />
                ) : null}
                {item.attachmentUrl && item.attachmentType === 'file' ? (
                  <FileAttachmentBubble
                    url={item.attachmentUrl}
                    name={item.attachmentName || 'Documento'}
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
            {linkUrl ? <ChatLinkPreview url={linkUrl} onMenu={openMenu} /> : null}
            {place || linkUrl ? <Pressable onPress={openMenu}>{timeRow}</Pressable> : null}
            {chips.length > 0 ? (
              <View style={styles.reactionsRow}>
                {chips.map((c) => (
                  <Pressable
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

  const selezionato = messaggioSelezionato ?? null;
  const salvabile = saveableOf(messaggioSelezionato);

  return (
    // La gestione della tastiera è salita al contenitore della schermata
    // (app/group/[id].tsx), che alza insieme chat e barra delle tab: due
    // KeyboardAvoidingView annidati si ostacolerebbero a vicenda.
    <View style={{ flex: 1 }}>
      {/* La stessa riga di Link e Mappa: la ricerca, e il modo di guardare —
          qui la conversazione o l'archivio di ciò che vi è passato. */}
      <View style={styles.topBar}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: searching ? colors.amber : 'transparent' }]}>
          <SearchIcon size={15} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={mode === 'chat' ? 'Cerca nei messaggi' : 'Cerca nell’archivio'}
            placeholderTextColor={colors.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? (
            <Text style={[styles.searchCounter, { color: colors.textFaint }]}>
              {matches.length === 0 ? 0 : currentMatchIndex + 1} di {matches.length}
            </Text>
          ) : null}
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <CloseIcon size={13} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        {searching ? (
          <>
            <Pressable
              onPress={goToOlderMatch}
              disabled={matches.length === 0}
              style={[styles.viewBtn, { backgroundColor: colors.surface, opacity: matches.length === 0 ? 0.4 : 1 }]}
              accessibilityLabel="Risultato precedente"
            >
              <View style={{ transform: [{ rotate: '-90deg' }] }}>
                <ChevronIcon size={16} color={colors.textDim} />
              </View>
            </Pressable>
            <Pressable
              onPress={goToNewerMatch}
              disabled={matches.length === 0}
              style={[styles.viewBtn, { backgroundColor: colors.surface, opacity: matches.length === 0 ? 0.4 : 1 }]}
              accessibilityLabel="Risultato successivo"
            >
              <View style={{ transform: [{ rotate: '90deg' }] }}>
                <ChevronIcon size={16} color={colors.textDim} />
              </View>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => {
              setSearchQuery('');
              setMode((m) => (m === 'chat' ? 'archive' : 'chat'));
            }}
            style={[styles.viewBtn, { backgroundColor: mode === 'archive' ? colors.amber : colors.surface }]}
            accessibilityLabel={mode === 'chat' ? 'Apri l’archivio' : 'Torna alla chat'}
          >
            {mode === 'chat' ? <GridIcon size={17} color={colors.textDim} /> : <ChatIcon size={17} color={colors.inkOnAmber} />}
          </Pressable>
        )}
      </View>

      {loadError ? <LoadError what="i messaggi" onRetry={loadAll} /> : null}

      {mode === 'archive' ? (
        <ChatArchive
          messages={messaggiVisibili}
          query={searchQuery}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
          onOpen={(id) => {
            setSearchQuery('');
            setJumpTo(id);
            setMode('chat');
          }}
        />
      ) : (
        <>
          {messages.length === 0 ? (
            <View style={styles.empty}>
              {/* Con l’avviso d’errore sopra, «non c’è niente» sarebbe falso. */}
              {loadError ? null : (
                <>
                  <ChatIcon size={38} color={colors.textFaint} strokeWidth={1.6} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>
                    Nessun messaggio ancora. Scrivi il primo per iniziare la conversazione.
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
              <View style={[styles.replyBarStripe, { backgroundColor: colors.teal }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.replyBarAuthor, { color: colors.teal }]} numberOfLines={1}>
                  {roster[replyingTo.userId] ?? 'Utente'}
                </Text>
                <Text style={[styles.replyBarText, { color: colors.textDim }]} numberOfLines={1}>
                  {parsePlaceMessage(replyingTo.text)?.name ?? replyingTo.text ?? 'Allegato'}
                </Text>
              </View>
              <Pressable onPress={() => setReplyingTo(null)} hitSlop={8} style={{ padding: 4 }}>
                <CloseIcon size={14} color={colors.textFaint} />
              </Pressable>
            </View>
          ) : null}

          {typingLabel ? (
            <View style={styles.typingRow}>
              <Text style={{ fontSize: 12, color: colors.textFaint, fontStyle: 'italic' }}>{typingLabel}</Text>
            </View>
          ) : null}

          {recording ? (
            <View style={[styles.inputBar, { backgroundColor: colors.surface }]}>
              <View style={styles.recordingRow}>
                <View style={styles.recordingDot} />
                <Text style={{ fontSize: 14, color: colors.text }}>Registrazione… {formatSeconds(recordingSeconds)}</Text>
              </View>
              <Pressable onPress={toggleRecording} style={[styles.sendBtn, { backgroundColor: colors.amber }]}>
                <StopIcon size={17} color={colors.inkOnAmber} />
              </Pressable>
            </View>
          ) : (
            <View style={[styles.inputBar, { backgroundColor: colors.surface }]}>
              <Pressable
                onPress={() => {
                  loadGroupStuff();
                  setAttachMenuOpen(true);
                }}
                disabled={uploading}
                style={[styles.attachBtn, { backgroundColor: colors.surface2, opacity: uploading ? 0.5 : 1 }]}
                accessibilityLabel="Manda foto, documenti, posti o link"
              >
                {uploading ? <ActivityIndicator size="small" color={colors.textDim} /> : <PlusIcon size={17} color={colors.textDim} />}
              </Pressable>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Scrivi un messaggio"
                placeholderTextColor={colors.textFaint}
                value={draft}
                onChangeText={handleDraftChange}
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={send}
              />
              <Pressable
                onPress={draft.trim() ? send : toggleRecording}
                disabled={uploading}
                style={[styles.sendBtn, { backgroundColor: colors.amber, opacity: uploading ? 0.5 : 1 }]}
              >
                {draft.trim() ? <SendIcon size={18} color={colors.inkOnAmber} /> : <MicIcon size={19} color={colors.inkOnAmber} />}
              </Pressable>
            </View>
          )}
        </>
      )}

      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewImage(null)}>
          {previewImage ? <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>

      <MessageActionsSheet
        message={selezionato}
        authorName={selezionato ? (roster[selezionato.userId] ?? 'questa persona') : ''}
        isMine={!!selezionato && selezionato.userId === session?.user.id}
        myReactions={selezionato ? (reactionsByMessage[selezionato.id] ?? []).filter((c) => c.mine).map((c) => c.emoji) : []}
        saveable={salvabile ? { title: salvabile.title } : null}
        linkCategories={linkCategories}
        onClose={() => setReactSheetFor(null)}
        onReact={(emoji) => {
          if (!selezionato || !session) return;
          const mine = reactionsByMessage[selezionato.id]?.find((e) => e.emoji === emoji)?.mine ?? false;
          toggleReaction(selezionato.id, groupId, session.user.id, emoji, mine).catch(() =>
            toast.show('Non sono riuscito a salvare la reazione.'),
          );
        }}
        onReply={() => selezionato && setReplyingTo(selezionato)}
        onSaveToLinks={(categoryId) => selezionato && saveToLinks(selezionato, categoryId)}
        onReport={segnala}
        onBlock={blocca}
        onCopied={() => toast.show('Testo copiato')}
      />

      <ChatAttachSheet
        visible={attachMenuOpen}
        onClose={() => setAttachMenuOpen(false)}
        pins={pins}
        categoryFor={placeCategoryFor}
        links={links}
        onPhoto={() => pickAttachment('images')}
        onVideo={() => pickAttachment('videos')}
        onDocument={pickDocument}
        onPlace={sendPlace}
        onLink={sendSavedLink}
        onMyPosition={sendMyPosition}
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
  day: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
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
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 14, marginBottom: 6, borderRadius: RADIUS.sm },
  replyBarStripe: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
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
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 10 },
  emojiBtn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  emojiBtnText: { fontSize: 28 },
});
