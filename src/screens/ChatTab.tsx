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
import { SendIcon, ChatIcon, ReplyIcon, CloseIcon, AttachIcon, PlayIcon, MicIcon, StopIcon, PauseIcon, SearchIcon, CheckIcon, ChevronIcon, LinkIcon } from '@/components/Icon';
import { BottomSheet } from '@/components/BottomSheet';
import { ChatLinkPreview } from '@/components/ChatLinkPreview';
import { VoiceBubble } from '@/components/VoiceBubble';
import { FileAttachmentBubble } from '@/components/FileAttachmentBubble';
import { AttachMenuSheet } from '@/components/AttachMenuSheet';
import { LoadError } from '@/components/LoadError';
import {
  timeLabel,
  initials,
  colorForUser,
  splitTextByUrls,
  firstUrl,
  platformInfo,
  formatSeconds,
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
import { getLinkPreview, type LinkPreview as LinkPreviewData } from '@/lib/api/linkPreviews';

interface ChatTabProps {
  groupId: string;
  roster: Record<string, string>;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

/** Quanti messaggi per pagina, sia al primo caricamento sia scorrendo
 * all'indietro. */
const PAGE_SIZE = 150;

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];


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

export function ChatTab({ groupId, roster, searchOpen, setSearchOpen }: ChatTabProps) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [reactions, setReactions] = useState<RawReaction[]>([]);
  const [draft, setDraft] = useState('');
  const [reactSheetFor, setReactSheetFor] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<RawMessage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
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
  const matches = useMemo(() => {
    if (!searchOpen) return [];
    const term = searchQuery.trim().toLowerCase();
    if (!term) return [];
    const found: { message: RawMessage; index: number }[] = [];
    messages.forEach((m, index) => {
      if (m.text && m.text.toLowerCase().includes(term)) found.push({ message: m, index });
    });
    return found;
  }, [messages, searchQuery, searchOpen]);

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

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
  };

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
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.show('Messaggio non inviato, riprova.');
    }
  };

  const startReply = () => {
    const message = messages.find((m) => m.id === reactSheetFor);
    if (!message) return;
    setReplyingTo(message);
    setReactSheetFor(null);
  };

  const pickAttachment = async () => {
    if (!session || uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show('Serve il permesso per accedere alle foto.');
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
      setMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)));
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

  const pickReaction = async (emoji: string) => {
    const messageId = reactSheetFor;
    if (!messageId || !session) return;
    setReactSheetFor(null);
    const mine = reactionsByMessage[messageId]?.find((e) => e.emoji === emoji)?.mine ?? false;
    try {
      await toggleReaction(messageId, groupId, session.user.id, emoji, mine);
    } catch {
      toast.show('Non sono riuscito a salvare la reazione.');
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

  const renderItem = ({ item }: { item: RawMessage }) => {
    const own = session ? item.userId === session.user.id : false;
    const displayName = roster[item.userId] ?? 'Utente';
    const chips = reactionsByMessage[item.id] ?? [];
    const quoted = item.replyToId ? messages.find((m) => m.id === item.replyToId) : null;
    const term = searchOpen ? searchQuery.trim() : '';
    const isMatch = term && item.text && item.text.toLowerCase().includes(term.toLowerCase());
    const isCurrentMatch = isMatch && item.id === currentMatchId;
    return (
      <View style={[styles.row, own && styles.rowOwn]}>
        {!own ? (
          <View style={[styles.avatar, { backgroundColor: colorForUser(displayName) }]}>
            <Text style={styles.avatarText}>{initials(displayName)}</Text>
          </View>
        ) : null}
        <View style={styles.bubbleCol}>
          <Pressable
            onPress={() => setReactSheetFor(item.id)}
            style={[
              styles.bubble,
              own ? styles.bubbleOwn : styles.bubbleOther,
              {
                backgroundColor: own ? colors.amber : colors.surface,
                // Il contorno c'è sempre ma si vede solo sul risultato di
                // ricerca corrente: così evidenziandolo il fumetto non
                // cambia di dimensione e la lista non sobbalza.
                borderColor: isCurrentMatch ? colors.teal : 'transparent',
              },
            ]}
          >
            {!own ? <Text style={[styles.name, { color: colors.teal }]}>{displayName}</Text> : null}
            {item.replyToId ? (
              <View style={[styles.quoteBox, { borderLeftColor: own ? '#6B5730' : colors.teal, backgroundColor: own ? '#C98A22' : colors.surface2 }]}>
                <Text style={[styles.quoteAuthor, { color: own ? '#3D2E10' : colors.teal }]} numberOfLines={1}>
                  {quoted ? (roster[quoted.userId] ?? 'Utente') : ''}
                </Text>
                <Text style={[styles.quoteText, { color: own ? '#4A3A18' : colors.textDim }]} numberOfLines={2}>
                  {quoted ? quoted.text : 'Messaggio non disponibile'}
                </Text>
              </View>
            ) : null}
            {item.attachmentUrl && item.attachmentType === 'image' ? (
              <Pressable onPress={() => setPreviewImage(item.attachmentUrl!)}>
                <Image source={{ uri: item.attachmentUrl }} style={styles.attachmentImage} />
              </Pressable>
            ) : null}
            {item.attachmentUrl && item.attachmentType === 'video' ? (
              <Pressable onPress={() => Linking.openURL(item.attachmentUrl!)} style={styles.videoCard}>
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
            {item.text ? (
              <Text style={[styles.text, { color: own ? colors.inkOnAmber : colors.text, marginTop: item.attachmentUrl ? 6 : 0 }]}>
                {splitTextByUrls(item.text).map((seg, segIdx) => {
                  const inner = isMatch
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
                        // Altrimenti il tocco prosegue fino al fumetto e al
                        // posto del link si aprirebbe il pannello reazioni.
                        e.stopPropagation?.();
                        Linking.openURL(seg.url!);
                      }}
                    >
                      {inner}
                    </Text>
                  );
                })}
              </Text>
            ) : null}
            {!item.attachmentUrl && item.text && firstUrl(item.text) ? (
              <ChatLinkPreview url={firstUrl(item.text)!} own={own} />
            ) : null}
            <View style={styles.timeRow}>
              <Text style={[styles.time, { color: own ? '#6B5730' : colors.textFaint }]}>{timeLabel(item.ts)}</Text>
              {own ? (
                isReadByOthers(item.ts) ? (
                  <View style={styles.ticks}>
                    <CheckIcon size={11} color={colors.teal} />
                    <View style={{ marginLeft: -6 }}>
                      <CheckIcon size={11} color={colors.teal} />
                    </View>
                  </View>
                ) : (
                  <CheckIcon size={11} color="#6B5730" />
                )
              ) : null}
            </View>
          </Pressable>
          {chips.length > 0 ? (
            <View style={[styles.reactionsRow, { alignSelf: own ? 'flex-end' : 'flex-start' }]}>
              {chips.map((c) => (
                <Pressable
                  key={c.emoji}
                  onPress={() => toggleChip(item.id, c.emoji, c.mine)}
                  style={[
                    styles.reactionChip,
                    {
                      backgroundColor: colors.surface,
                      borderColor: c.mine ? colors.amber : colors.border,
                    },
                  ]}
                >
                  <Text style={styles.reactionChipText}>
                    {c.emoji} {c.count}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    // La gestione della tastiera è salita al contenitore della schermata
    // (app/group/[id].tsx), che alza insieme chat e barra delle tab: due
    // KeyboardAvoidingView annidati si ostacolerebbero a vicenda.
    <View style={{ flex: 1 }}>
      {searchOpen ? (
        <View style={[styles.chatHeader, { borderBottomColor: colors.border }]}>
          <SearchIcon size={16} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Cerca nei messaggi"
            placeholderTextColor={colors.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.trim() ? (
            <Text style={[styles.searchCounter, { color: colors.textFaint }]}>
              {matches.length === 0 ? 0 : currentMatchIndex + 1}/{matches.length}
            </Text>
          ) : null}
          <Pressable onPress={goToOlderMatch} disabled={matches.length === 0} hitSlop={8}>
            <View style={{ transform: [{ rotate: '-90deg' }], opacity: matches.length === 0 ? 0.3 : 1 }}>
              <ChevronIcon size={16} color={colors.textDim} />
            </View>
          </Pressable>
          <Pressable onPress={goToNewerMatch} disabled={matches.length === 0} hitSlop={8}>
            <View style={{ transform: [{ rotate: '90deg' }], opacity: matches.length === 0 ? 0.3 : 1 }}>
              <ChevronIcon size={16} color={colors.textDim} />
            </View>
          </Pressable>
          <Pressable onPress={closeSearch} hitSlop={8}>
            <CloseIcon size={16} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : null}

      {loadError ? <LoadError what="i messaggi" onRetry={loadAll} /> : null}

      {messages.length === 0 ? (
        <View style={styles.empty}>
          <ChatIcon size={38} color={colors.textFaint} strokeWidth={1.6} />
          <Text style={[styles.emptyText, { color: colors.textFaint }]}>
            Nessun messaggio ancora. Scrivi il primo per iniziare la conversazione.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          inverted
          style={{ flex: 1 }}
          data={messages}
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

      {!searchOpen && replyingTo ? (
        <View style={[styles.replyBar, { borderTopColor: colors.border, backgroundColor: colors.surface2 }]}>
          <View style={[styles.replyBarStripe, { backgroundColor: colors.teal }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.replyBarAuthor, { color: colors.teal }]} numberOfLines={1}>
              {roster[replyingTo.userId] ?? 'Utente'}
            </Text>
            <Text style={[styles.replyBarText, { color: colors.textDim }]} numberOfLines={1}>
              {replyingTo.text}
            </Text>
          </View>
          <Pressable onPress={() => setReplyingTo(null)} hitSlop={8} style={{ padding: 4 }}>
            <CloseIcon size={14} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : null}

      {!searchOpen && typingLabel ? (
        <View style={styles.typingRow}>
          <Text style={{ fontSize: 12, color: colors.textFaint, fontStyle: 'italic' }}>{typingLabel}</Text>
        </View>
      ) : null}

      {searchOpen ? null : recording ? (
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
            onPress={() => setAttachMenuOpen(true)}
            disabled={uploading}
            style={[styles.attachBtn, { opacity: uploading ? 0.5 : 1 }]}
          >
            {uploading ? <ActivityIndicator size="small" color={colors.textDim} /> : <AttachIcon size={19} color={colors.textDim} />}
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

      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewImage(null)}>
          {previewImage ? <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>

      <BottomSheet visible={!!reactSheetFor} onClose={() => setReactSheetFor(null)}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Reagisci</Text>
        <View style={styles.emojiRow}>
          {QUICK_REACTIONS.map((emoji) => (
            <Pressable key={emoji} onPress={() => pickReaction(emoji)} style={styles.emojiBtn}>
              <Text style={styles.emojiBtnText}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={startReply} style={[styles.replyAction, { borderTopColor: colors.border }]}>
          <ReplyIcon size={17} color={colors.textDim} />
          <Text style={{ fontSize: 14.5, fontWeight: '600', color: colors.text }}>Rispondi</Text>
        </Pressable>
      </BottomSheet>

      <AttachMenuSheet
        visible={attachMenuOpen}
        onClose={() => setAttachMenuOpen(false)}
        onPickMedia={pickAttachment}
        onPickDocument={pickDocument}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  searchInput: { flex: 1, fontSize: 14.5, paddingVertical: 2 },
  searchCounter: { fontSize: 12 },
  olderLoader: { paddingVertical: 14, alignItems: 'center' },
  list: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', gap: 8, maxWidth: '88%', alignItems: 'flex-end', marginBottom: 10 },
  rowOwn: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontWeight: '700', color: '#1B2530' },
  bubbleCol: { flexShrink: 1, gap: 4 },
  // L'angolo dal lato di chi scrive resta stretto: è la "codina" che dice
  // da che parte arriva il messaggio, ora che i fumetti non hanno più un
  // contorno a delimitarli.
  bubble: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleOwn: { borderBottomRightRadius: 6 },
  bubbleOther: { borderBottomLeftRadius: 6 },
  matchHighlight: { backgroundColor: '#F2C14E', color: '#2B2109' },
  name: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
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
  reactionChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  reactionChipText: { fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
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
