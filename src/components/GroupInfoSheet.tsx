import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS, FONT_ROUNDED } from '@/theme/theme';
import { fitFontSize } from '@/lib/fitText';
import { useAuth } from '@/lib/authStore';
import { groupColor, useAppStore } from '@/lib/appStore';
import { useToast } from '@/components/Toast';
import { LogoutIcon, EditIcon, CalendarIcon, MapIcon, PlusIcon, CloseIcon, ChevronIcon, CheckIcon, SearchIcon } from '@/components/Icon';
import { listPins, type RawPin } from '@/lib/api/pins';
import { searchPlaces, placeLocation, type FoundPlace } from '@/lib/api/places';
import { CampoData } from '@/components/CampoData';
import { listFacts, addFact, editFact, removeFact, subscribeToFacts, type RawFact } from '@/lib/api/groupFacts';
import { setGroupInfo } from '@/lib/api/groups';
import { rangeLabel, countdownLabel } from '@/lib/groupInfo';
import { listLastReads, subscribeToLastReads, countMembers } from '@/lib/api/groupMembers';
import { AddPeopleContent } from '@/components/AddPeopleSheet';
import { RigaVisibilita, ContenutoVisibilita } from '@/components/Visibilita';
import { invitiInAttesa } from '@/lib/api/invitiPersona';
import { initials, colorForUser, dateLabel, inkOn, googleMapsPlaceUrl, withTimeout, WRITE_TIMEOUT } from '@/lib/utils';
import type { Group, MetaLibera } from '@/types';
import { useT, dizionario } from '@/i18n';
import { segnalaErrore } from '@/lib/sentry';
import { messaggioErrore, eProblemaDiRete } from '@/lib/errori';
import { leggiCopia, salvaCopia, useRiprovaDaSola } from '@/lib/copiaLocale';
import { SenzaRete } from '@/components/SenzaRete';

interface GroupInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  group: Group;
  roster: Record<string, string>;
  /** Chiamata dopo l'uscita dal gruppo: chi apre il foglio sa dove portare
   * la persona, visto che la schermata del gruppo non ha più senso. */
  onLeaveGroup: () => void;
  /** Apre sulla mappa il posto scelto come meta, quando c'è. */
  onShowPlace?: (pinId: string) => void;
  /** Il nome della meta, dalla schermata del gruppo che ne tiene la copia:
   * senza rete i posti qui non si leggono, e la meta diventava un invito
   * a sceglierla. */
  metaNome?: string | null;
}

function lastSeenLabel(ts: number | null | undefined): string {
  const i = dizionario().infoGruppo;
  if (ts == null) return i.maiAperta;
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return i.proprioOra;
  if (minutes < 60) return i.minutiFa(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i.oreFa(hours);
  return dateLabel(ts);
}

/**
 * Una riga della bacheca mentre la si scrive: etichetta corta a sinistra,
 * valore a destra. Sta fuori dal componente che la usa, altrimenti a ogni
 * lettera scritta i campi verrebbero ricreati e perderebbero il fuoco.
 */
function FactEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  onRemove,
  first,
}: {
  draft: { id: string | null; label: string; value: string };
  onChange: (d: { id: string | null; label: string; value: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove?: () => void;
  first: boolean;
}) {
  const { colors } = useTheme();
  const t = useT();
  const pronto = draft.label.trim().length > 0 && draft.value.trim().length > 0;
  return (
    <View style={[styles.factEditor, !first && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <TextInput
        style={[styles.factInputLabel, { backgroundColor: colors.surface, color: colors.text }]}
        placeholder={t.infoGruppo.esempioEtichetta}
        placeholderTextColor={colors.textFaint}
        value={draft.label}
        onChangeText={(t) => onChange({ ...draft, label: t })}
        maxLength={40}
      />
      <TextInput
        style={[styles.factInputValue, { backgroundColor: colors.surface, color: colors.text }]}
        placeholder={t.infoGruppo.esempioValore}
        placeholderTextColor={colors.textFaint}
        value={draft.value}
        onChangeText={(t) => onChange({ ...draft, value: t })}
        maxLength={200}
        onSubmitEditing={onSave}
      />
      <View style={styles.factActions}>
        {onRemove ? (
          <Pressable accessibilityRole="button" onPress={onRemove} hitSlop={8} accessibilityLabel={t.infoGruppo.togliRiga}>
            <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '700' }}>{t.infoGruppo.togli}</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={t.comune.annulla} onPress={onCancel} hitSlop={8}>
          <CloseIcon size={16} color={colors.textFaint} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.accessibilita.salvaRiga}
          hitSlop={7}
          onPress={onSave}
          disabled={!pronto}
          style={[styles.factSave, { backgroundColor: colors.amber, opacity: pronto ? 1 : 0.5 }]}
        >
          <CheckIcon size={13} color={colors.inkOnAmber} strokeWidth={3} />
        </Pressable>
      </View>
    </View>
  );
}

/** La meta scelta: un posto della mappa del gruppo, o uno trovato
 * cercando per nome, che resta fuori dalla mappa. */
type Meta = { tipo: 'posto'; id: string } | { tipo: 'libera'; posto: MetaLibera } | null;

type Ricerca = { stato: 'ferma' } | { stato: 'cerca' } | { stato: 'errore' } | { stato: 'trovati'; posti: FoundPlace[] };

/**
 * La pagina di modifica delle info: descrizione, date e meta insieme, in
 * un colpo solo. Le date si scelgono dal calendario; la meta fra i posti
 * della mappa del gruppo, o cercandola per nome.
 */
function InfoEditor({
  group,
  pins,
  onCancel,
  onSaved,
}: {
  group: Group;
  pins: RawPin[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const [description, setDescription] = useState(group.description ?? '');
  const [dal, setDal] = useState<string | null>(group.startsOn ?? null);
  const [al, setAl] = useState<string | null>(group.endsOn ?? null);
  const [meta, setMeta] = useState<Meta>(
    group.placePinId ? { tipo: 'posto', id: group.placePinId } : group.metaLibera ? { tipo: 'libera', posto: group.metaLibera } : null,
  );
  const [query, setQuery] = useState('');
  const [ricerca, setRicerca] = useState<Ricerca>({ stato: 'ferma' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Ricerca mentre si scrive, con una piccola attesa, come nella mappa.
  const ultima = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRicerca({ stato: 'ferma' });
      return;
    }
    const mia = ++ultima.current;
    setRicerca({ stato: 'cerca' });
    const timer = setTimeout(async () => {
      const posti = await searchPlaces(q);
      // Arrivata dopo una ricerca più recente: si butta.
      if (mia !== ultima.current) return;
      setRicerca(posti ? { stato: 'trovati', posti: posti.slice(0, 5) } : { stato: 'errore' });
    }, 700);
    return () => clearTimeout(timer);
  }, [query]);

  const scegliTrovato = async (posto: FoundPlace) => {
    // Se è già nella mappa del gruppo si sceglie quello, senza doppioni.
    const giaSalvato = pins.find((p) => p.mapsUrl?.includes(posto.placeId));
    if (giaSalvato) {
      setMeta({ tipo: 'posto', id: giaSalvato.id });
      setQuery('');
      return;
    }
    const mia = ++ultima.current;
    setRicerca({ stato: 'cerca' });
    const pos = await placeLocation(posto.placeId);
    if (mia !== ultima.current) return;
    if (!pos) {
      setRicerca({ stato: 'errore' });
      return;
    }
    setMeta({ tipo: 'libera', posto: { nome: posto.name, ...pos, mapsUrl: googleMapsPlaceUrl(posto.name, posto.placeId) } });
    setQuery('');
  };

  const scegliDal = (iso: string | null) => {
    setDal(iso);
    // La fine non viene prima dell'inizio: si sposta con lui.
    if (iso && al && al < iso) setAl(iso);
    setError('');
  };

  const salva = async () => {
    setBusy(true);
    setError('');
    try {
      await withTimeout(
        setGroupInfo(group.id, {
          description: description.trim() || null,
          startsOn: dal,
          endsOn: al,
          placePinId: meta?.tipo === 'posto' ? meta.id : null,
          metaLibera: meta?.tipo === 'libera' ? meta.posto : null,
        }),
        WRITE_TIMEOUT,
      );
      onSaved();
    } catch (err) {
      segnalaErrore(err, 'infoGruppo.erroreInfo');
      // Qui nel foglio, e non in un avviso: sopra un foglio aperto, su
      // Android, l'avviso finisce sotto e non si vede. Il foglio resta
      // aperto con quello che si era scritto, per riprovare.
      setError(messaggioErrore(err, t.infoGruppo.erroreInfo));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible onClose={onCancel}>
      <Text style={[styles.editTitle, { color: colors.text }]}>{t.infoGruppo.modifica}</Text>

      <Text style={[styles.sectionLabel, { color: colors.textDim }]}>{t.infoGruppo.descrizione}</Text>
      <TextInput
        style={[styles.editArea, { backgroundColor: colors.surface2, color: colors.text }]}
        placeholder={t.infoGruppo.aCosaServe}
        placeholderTextColor={colors.textFaint}
        value={description}
        onChangeText={setDescription}
        maxLength={300}
        multiline
      />
      <Text style={[styles.counter, { color: colors.textFaint }]}>{description.trim().length} / 300</Text>

      <Text style={[styles.sectionLabel, styles.spacedLabel, { color: colors.textDim }]}>{t.infoGruppo.quando}</Text>
      <View style={styles.editDates}>
        <CampoData valore={dal} onCambia={scegliDal} segnaposto={t.infoGruppo.dal} etichetta={t.accessibilita.dataInizio} />
        <CampoData
          valore={al}
          onCambia={(iso) => {
            setAl(iso);
            setError('');
          }}
          segnaposto={t.infoGruppo.al}
          etichetta={t.accessibilita.dataFine}
          minimo={dal}
        />
      </View>

      <Text style={[styles.sectionLabel, styles.spacedLabel, { color: colors.textDim }]}>{t.infoGruppo.dove}</Text>
      <View style={[styles.cercaPosto, { backgroundColor: colors.surface2 }]}>
        <SearchIcon size={15} color={colors.textFaint} />
        <TextInput
          style={[styles.cercaPostoInput, { color: colors.text }]}
          placeholder={t.infoGruppo.cercaPosto}
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
      {ricerca.stato === 'cerca' ? (
        <View style={styles.ricercaNota}>
          <ActivityIndicator size="small" color={colors.textDim} />
        </View>
      ) : ricerca.stato === 'errore' ? (
        <Text style={[styles.ricercaTesto, { color: colors.textDim }]}>{t.nuovoPosto.ricercaFallita}</Text>
      ) : ricerca.stato === 'trovati' && ricerca.posti.length === 0 ? (
        <Text style={[styles.ricercaTesto, { color: colors.textDim }]}>{t.nuovoPosto.nessunRisultato}</Text>
      ) : ricerca.stato === 'trovati' ? (
        <View style={[styles.risultati, { backgroundColor: colors.surface2 }]}>
          {ricerca.posti.map((r, i) => (
            <Pressable
              accessibilityRole="button"
              key={r.placeId}
              onPress={() => scegliTrovato(r)}
              style={[styles.risultato, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <MapIcon size={16} color={colors.teal} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.risultatoNome, { color: colors.text }]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[styles.risultatoIndirizzo, { color: colors.textFaint }]} numberOfLines={1}>
                  {r.address}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {meta?.tipo === 'libera' || pins.length > 0 ? (
        <View style={[styles.metaList, styles.metaSotto]}>
          {meta?.tipo === 'libera' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: true }}
              onPress={() => setMeta(null)}
              style={[styles.metaChip, { backgroundColor: colors.teal, borderColor: colors.teal }]}
            >
              <Text style={{ color: colors.bg, fontSize: 13, fontWeight: '700' }}>{meta.posto.nome}</Text>
            </Pressable>
          ) : null}
          {pins.slice(0, 8).map((p) => {
            const scelto = meta?.tipo === 'posto' && meta.id === p.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: scelto }}
                key={p.id}
                onPress={() => setMeta(scelto ? null : { tipo: 'posto', id: p.id })}
                style={[
                  styles.metaChip,
                  { backgroundColor: scelto ? colors.teal : colors.surface2, borderColor: scelto ? colors.teal : 'transparent' },
                ]}
              >
                <Text style={{ color: scelto ? colors.bg : colors.textDim, fontSize: 13, fontWeight: '700' }}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {error ? <Text style={[styles.editError, { color: colors.danger }]}>{error}</Text> : null}

      <View style={[styles.confirmActions, styles.editActions]}>
        <Pressable accessibilityRole="button" onPress={onCancel} disabled={busy} style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}>
          <Text style={{ color: colors.textDim, fontWeight: '600' }}>{t.comune.annulla}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={salva} disabled={busy} style={[styles.btnPrimary, { backgroundColor: colors.amber, opacity: busy ? 0.6 : 1 }]}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.inkOnAmber} />
          ) : (
            <Text style={{ color: colors.inkOnAmber, fontWeight: '800' }}>{t.comune.salva}</Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

export function GroupInfoSheet({ visible, onClose, group, roster, onLeaveGroup, onShowPlace, metaNome }: GroupInfoSheetProps) {
  const { colors } = useTheme();
  const t = useT();
  const { session } = useAuth();
  const toast = useToast();
  const [lastReads, setLastReads] = useState<Record<string, number | null>>({});
  /** «Aggiungi persone», mostrato al posto delle info. */
  const [aggiungendo, setAggiungendo] = useState(false);
  /** La pagina «Visibilità», al posto delle info. */
  const [visibilita, setVisibilita] = useState(false);
  const [pubblico, setPubblico] = useState(!!group.pubblico);
  /** Chi è stato invitato e non ha ancora risposto. */
  const [inAttesa, setInAttesa] = useState<{ id: string; nome: string }[]>([]);
  const [cardWidth, setCardWidth] = useState(0);
  const { leaveGroup, offlineDal, refreshGroups } = useAppStore();
  /** Conferma per l'uscita dal gruppo, mostrata al posto del contenuto
   * del foglio (vedi SettingsSheet per il perché non si usa Alert). */
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Quanti membri restano: se si è soli, uscire elimina il gruppo con tutto
  // il suo contenuto, e va detto prima e non dopo.
  const [memberCount, setMemberCount] = useState<number | null>(null);
  /** Le info del gruppo: si modificano in una pagina propria del foglio. */
  const [editingInfo, setEditingInfo] = useState(false);
  const [facts, setFacts] = useState<RawFact[]>([]);
  const [pins, setPins] = useState<RawPin[]>([]);
  /** La riga della bacheca che si sta scrivendo o correggendo. */
  const [factDraft, setFactDraft] = useState<{ id: string | null; label: string; value: string } | null>(null);
  /** Senza rete: da quando sono i dati a schermo. Intanto le azioni che
   * scrivono si spengono, invece di invitare a fare cose che falliranno. */
  const [senzaRete, setSenzaRete] = useState<number | null>(null);
  /** Ogni giro rilegge tutto: lo fanno «Riprova» e il tentativo da solo. */
  const [giro, setGiro] = useState(0);
  const riprova = () => setGiro((g) => g + 1);
  useRiprovaDaSola(visible && senzaRete !== null, riprova);

  // Riaprendo il foglio si riparte dalle informazioni, mai da una
  // conferma rimasta a metà.
  useEffect(() => {
    if (visible) {
      setConfirmLeave(false);
      setEditingInfo(false);
      setAggiungendo(false);
      setVisibilita(false);
      setFactDraft(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const carica = () => {
      listFacts(group.id)
        .then((f) => {
          if (!alive) return;
          setFacts(f);
          setSenzaRete(null);
          salvaCopia(session?.user.id, `info:${group.id}`, f);
        })
        .catch(async (err) => {
          // Senza rete, le cose da sapere dell'ultima volta: in viaggio
          // sono proprio quelle che servono.
          const copia = await leggiCopia<RawFact[]>(session?.user.id, `info:${group.id}`);
          if (!alive) return;
          if (copia) setFacts((prev) => (prev.length > 0 ? prev : copia.dati));
          if (eProblemaDiRete(err)) setSenzaRete(copia?.ts ?? offlineDal ?? Date.now());
        });
    };
    leggiCopia<RawFact[]>(session?.user.id, `info:${group.id}`).then((copia) => {
      if (alive && copia) setFacts((prev) => (prev.length > 0 ? prev : copia.dati));
    });
    carica();
    listPins(group.id)
      .then((p) => alive && setPins(p))
      .catch(() => {});
    const unsubscribe = subscribeToFacts(group.id, carica);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [visible, group.id, giro]);

  // Senza rete i posti non arrivano: resta il nome salvato della meta.
  const meta: { id: string; name: string } | null = group.placePinId
    ? (pins.find((p) => p.id === group.placePinId) ?? (metaNome ? { id: group.placePinId, name: metaNome } : null))
    : null;
  /** La meta fuori dalla mappa: al tocco si apre su Google Maps. */
  const metaLibera = group.placePinId ? null : (group.metaLibera ?? null);
  const nomeMeta = meta?.name ?? metaLibera?.nome ?? null;
  /** Con la rete si modifica; senza, si legge e basta. */
  const scrive = senzaRete === null;
  const date = rangeLabel(group.startsOn, group.endsOn);
  const conto = countdownLabel(group.startsOn, group.endsOn);

  const salvaRiga = async () => {
    if (!factDraft || !session) return;
    const label = factDraft.label.trim();
    const value = factDraft.value.trim();
    if (!label || !value) return;
    try {
      if (factDraft.id) await editFact(factDraft.id, label, value);
      else await addFact(group.id, session.user.id, label, value, facts.length);
      setFactDraft(null);
      setFacts(await listFacts(group.id));
    } catch (err) {
      segnalaErrore(err, 'infoGruppo.erroreRiga');
      toast.show(t.infoGruppo.erroreRiga, 'error');
    }
  };

  const togliRiga = async (id: string) => {
    try {
      await removeFact(id);
      setFactDraft(null);
      setFacts((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      segnalaErrore(err, 'infoGruppo.erroreTogliRiga');
      toast.show(t.infoGruppo.erroreTogliRiga, 'error');
    }
  };

  useEffect(() => {
    if (!confirmLeave) return;
    let alive = true;
    countMembers(group.id).then((n) => {
      if (alive) setMemberCount(n);
    });
    return () => {
      alive = false;
    };
  }, [confirmLeave, group.id]);

  const runLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await leaveGroup(group.id);
      onClose();
      onLeaveGroup();
    } catch (err) {
      segnalaErrore(err, 'home.erroreUscita');
      toast.show(t.home.erroreUscita, 'error');
    } finally {
      setLeaving(false);
    }
  };

  // Riletti anche tornando da «Aggiungi persone», dove se ne aggiungono.
  useEffect(() => {
    if (!visible || aggiungendo) return;
    let alive = true;
    invitiInAttesa(group.id)
      .then((a) => alive && setInAttesa(a))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible, aggiungendo, group.id, giro]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    listLastReads(group.id).then((data) => {
      if (!cancelled) setLastReads(data);
    });
    const unsubscribe = subscribeToLastReads(group.id, (userId, lastReadAt) => {
      setLastReads((prev) => ({ ...prev, [userId]: lastReadAt }));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [visible, group.id]);

  const members = Object.entries(roster).sort(([a], [b]) => (a === session?.user.id ? -1 : b === session?.user.id ? 1 : 0));

  if (editingInfo) {
    return (
      <InfoEditor
        group={group}
        pins={pins}
        onCancel={() => setEditingInfo(false)}
        onSaved={() => setEditingInfo(false)}
      />
    );
  }

  if (aggiungendo) {
    return (
      <BottomSheet visible={visible} onClose={onClose}>
        <AddPeopleContent visible={visible} onClose={onClose} group={group} onBack={() => setAggiungendo(false)} />
      </BottomSheet>
    );
  }

  if (visibilita) {
    return (
      <BottomSheet visible={visible} onClose={onClose}>
        <ContenutoVisibilita
          group={group}
          pubblico={pubblico}
          onBack={() => setVisibilita(false)}
          onCambiato={(v) => {
            setPubblico(v);
            // Per «Pubblico» sotto il nome del gruppo, nella sua schermata.
            refreshGroups().catch(() => {});
          }}
        />
      </BottomSheet>
    );
  }

  if (confirmLeave) {
    const lastOne = memberCount === 1;
    return (
      <BottomSheet visible={visible} onClose={onClose}>
        <Text style={[styles.confirmTitle, { color: colors.text }]}>
          {lastOne ? t.menuGruppo.ultimoTitolo : t.menuGruppo.lasciaTitolo}
        </Text>
        <Text style={[styles.confirmBody, { color: colors.textDim }]}>
          {lastOne ? t.menuGruppo.ultimoTesto : t.menuGruppo.lasciaTesto}
        </Text>
        <View style={styles.confirmActions}>
          <Pressable accessibilityRole="button"
            onPress={() => setConfirmLeave(false)}
            disabled={leaving}
            style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}
          >
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>{t.comune.annulla}</Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            onPress={runLeave}
            disabled={leaving}
            style={[styles.btnPrimary, { backgroundColor: colors.danger, opacity: leaving ? 0.6 : 1 }]}
          >
            {leaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>{lastOne ? t.menuGruppo.ultimoAzione : t.menuGruppo.lasciaAzione}</Text>
            )}
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* In cima la scheda del gruppo com'è nella home, al posto del
          cerchio con l'iniziale. */}
      <View style={[styles.card, { backgroundColor: groupColor(group) }]}>
        <View style={styles.cardBlob} />
        <View style={{ flex: 1 }} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
          {(() => {
            const size = cardWidth > 0 ? fitFontSize(group.name, cardWidth, 20, 46) : 28;
            return (
              <Text
                maxFontSizeMultiplier={1}
                style={{ fontFamily: FONT_ROUNDED, fontSize: size, lineHeight: Math.round(size * 1.2), color: inkOn(groupColor(group)) }}
                numberOfLines={1}
              >
                {group.name}
              </Text>
            );
          })()}
        </View>
      </View>

      {senzaRete !== null ? <SenzaRete dal={senzaRete} onRetry={riprova} style={[styles.senzaRete, { backgroundColor: colors.surface2 }]} /> : null}

      {/* Prima quando e dove: è quello che si cerca aprendo Info, e in
          viaggio il conto alla rovescia e la meta servono subito. */}
      <Text style={[styles.sectionLabel, { color: colors.textDim }]}>{t.infoGruppo.quandoEDove}</Text>
      <View style={[styles.membersBlock, { backgroundColor: colors.surface2 }]}>
        <Pressable accessibilityRole="button" disabled={!scrive} onPress={() => setEditingInfo(true)} style={styles.infoRow}>
          <CalendarIcon size={17} color={date ? colors.textDim : colors.textFaint} />
          <Text style={[styles.infoRowText, { color: date ? colors.text : colors.textFaint, fontWeight: date ? '700' : '500' }]}>
            {date ?? (scrive ? t.infoGruppo.aggiungiDate : t.infoGruppo.nessunaData)}
          </Text>
          {conto ? (
            <View style={[styles.countdown, { backgroundColor: colors.amber + '2E' }]}>
              <Text style={{ color: colors.amberText, fontSize: 11.5, fontWeight: '800' }}>{conto}</Text>
            </View>
          ) : scrive ? (
            <ChevronIcon size={15} color={colors.textFaint} />
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button"
          disabled={!nomeMeta && !scrive}
          onPress={() => {
            if (meta) onShowPlace?.(meta.id);
            else if (metaLibera) void Linking.openURL(metaLibera.mapsUrl);
            else setEditingInfo(true);
          }}
          style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border }]}
        >
          <MapIcon size={17} color={nomeMeta ? colors.teal : colors.textFaint} strokeWidth={1.9} />
          <Text style={[styles.infoRowText, { color: nomeMeta ? colors.teal : colors.textFaint, fontWeight: nomeMeta ? '700' : '500' }]}>
            {nomeMeta ?? (scrive ? t.infoGruppo.scegliMeta : t.infoGruppo.nessunaMeta)}
          </Text>
          {nomeMeta || scrive ? <ChevronIcon size={15} color={colors.textFaint} /> : null}
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, styles.spacedLabel, { color: colors.textDim }]}>{t.infoGruppo.descrizione}</Text>
      <Pressable accessibilityRole="button" disabled={!scrive} onPress={() => setEditingInfo(true)} style={[styles.infoBlock, { backgroundColor: colors.surface2 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.description, { color: group.description ? colors.text : colors.textFaint }]}>
            {group.description || (scrive ? t.infoGruppo.descrizioneVuota : t.infoGruppo.nessunaDescrizione)}
          </Text>
          {group.description && group.infoUpdatedAt ? (
            <Text style={[styles.infoMeta, { color: colors.textFaint }]}>
              {t.infoGruppo.aggiornataDa(
                group.infoUpdatedBy ? (roster[group.infoUpdatedBy] ?? t.infoGruppo.qualcuno) : t.infoGruppo.qualcuno,
                lastSeenLabel(group.infoUpdatedAt),
              )}
            </Text>
          ) : null}
        </View>
        {scrive ? <EditIcon size={15} color={colors.textDim} /> : null}
      </Pressable>

      <Text style={[styles.sectionLabel, styles.spacedLabel, { color: colors.textDim }]}>{t.infoGruppo.coseDaSapere}</Text>
      <View style={[styles.membersBlock, { backgroundColor: colors.surface2 }]}>
        {facts.length === 0 && !factDraft ? (
          <Text style={[styles.factsEmpty, { color: colors.textFaint }]}>
            {scrive ? t.infoGruppo.bachecaVuota : t.infoGruppo.bachecaSenzaRete}
          </Text>
        ) : null}
        {facts.map((f, i) =>
          factDraft?.id === f.id ? (
            <FactEditor
              key={f.id}
              draft={factDraft}
              onChange={setFactDraft}
              onSave={salvaRiga}
              onCancel={() => setFactDraft(null)}
              onRemove={() => togliRiga(f.id)}
              first={i === 0}
            />
          ) : (
            <Pressable accessibilityRole="button"
              key={f.id}
              disabled={!scrive}
              onPress={() => setFactDraft({ id: f.id, label: f.label, value: f.value })}
              style={[styles.factRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.factLabel, { color: colors.textFaint }]}>{f.label}</Text>
                <Text style={[styles.factValue, { color: colors.text }]}>{f.value}</Text>
              </View>
              {scrive ? <EditIcon size={14} color={colors.textFaint} /> : null}
            </Pressable>
          ),
        )}
        {factDraft && !factDraft.id ? (
          <FactEditor
            draft={factDraft}
            onChange={setFactDraft}
            onSave={salvaRiga}
            onCancel={() => setFactDraft(null)}
            first={facts.length === 0}
          />
        ) : scrive ? (
          <Pressable accessibilityRole="button"
            onPress={() => setFactDraft({ id: null, label: '', value: '' })}
            style={[styles.addFact, facts.length > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <PlusIcon size={14} color={colors.lilac} />
            <Text style={{ color: colors.lilac, fontSize: 13.5, fontWeight: '800' }}>{t.infoGruppo.aggiungiRiga}</Text>
          </Pressable>
        ) : null}
      </View>

      <RigaVisibilita
        pubblico={pubblico}
        sonoAutore={!!session && group.createdBy === session.user.id && scrive}
        autore={roster[group.createdBy ?? ''] ?? ''}
        onPress={() => setVisibilita(true)}
      />

      <Text style={[styles.sectionLabel, styles.membersLabel, { color: colors.textDim }]}>{t.infoGruppo.membriN(members.length)}</Text>
      <View style={[styles.membersBlock, { backgroundColor: colors.surface2 }]}>
        {/* Per primo, come in ogni elenco di persone: si cerca qui chi
            manca. Senza rete non c'è, perché invitare non riuscirebbe. */}
        {scrive ? (
          <Pressable accessibilityRole="button" onPress={() => setAggiungendo(true)} style={styles.memberRow}>
            <View style={[styles.memberAvatar, { backgroundColor: colors.amber }]}>
              <PlusIcon size={16} color={colors.inkOnAmber} />
            </View>
            <Text style={[styles.memberName, { flex: 1, color: colors.text }]}>{t.aggiungiPersone.titolo}</Text>
            <ChevronIcon size={15} color={colors.textFaint} />
          </Pressable>
        ) : null}
        {members.map(([userId, name], i) => {
          const isMe = userId === session?.user.id;
          return (
            <View key={userId} style={[styles.memberRow, (i > 0 || scrive) && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={[styles.memberAvatar, { backgroundColor: colorForUser(name) }]}>
                <Text maxFontSizeMultiplier={1} style={styles.memberAvatarText}>{initials(name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.memberName, { color: colors.text }]}>
                  {name}
                  {isMe ? t.infoGruppo.tu : ''}
                </Text>
                {!isMe ? (
                  <Text style={[styles.memberSeen, { color: colors.textFaint }]}>
                    {t.infoGruppo.ultimoAccesso(lastSeenLabel(lastReads[userId]))}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
        {inAttesa.filter((p) => !roster[p.id]).map((p) => (
          <View key={`attesa-${p.id}`} style={[styles.memberRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={[styles.memberAvatar, { backgroundColor: colorForUser(p.nome), opacity: 0.45 }]}>
              <Text maxFontSizeMultiplier={1} style={styles.memberAvatarText}>{initials(p.nome)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.memberName, { color: colors.textDim }]}>{p.nome}</Text>
              <Text style={[styles.memberSeen, { color: colors.textFaint }]}>{t.aggiungiPersone.inAttesa}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* In fondo e staccata dal resto: è una cosa del gruppo, quindi sta
          qui e non nelle impostazioni, ma è anche l'unica che ti porta
          fuori. Passa da una conferma. */}
      <Pressable accessibilityRole="button" onPress={() => setConfirmLeave(true)} style={[styles.leaveRow, { backgroundColor: colors.surface2 }]}>
        <View style={[styles.leaveIcon, { backgroundColor: colors.danger + '26' }]}>
          <LogoutIcon size={15} color={colors.danger} strokeWidth={2} />
        </View>
        <Text style={{ color: colors.danger, fontSize: 14.5, fontWeight: '600' }}>{t.menuGruppo.lascia}</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  infoBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: RADIUS.md, padding: 14 },
  description: { fontSize: 14.5, lineHeight: 21 },
  infoMeta: { fontSize: 11.5, marginTop: 10 },
  spacedLabel: { marginTop: 18 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  infoRowText: { flex: 1, fontSize: 14.5 },
  countdown: { paddingHorizontal: 10, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  factLabel: { fontSize: 10.5, fontWeight: '800' },
  factValue: { fontSize: 14.5, fontWeight: '700', marginTop: 3 },
  factsEmpty: { fontSize: 13, lineHeight: 19, padding: 14 },
  addFact: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 13 },
  factEditor: { padding: 12, gap: 8 },
  factInputLabel: { borderRadius: RADIUS.sm, paddingHorizontal: 12, height: 40, fontSize: 13.5, fontWeight: '700' },
  factInputValue: { borderRadius: RADIUS.sm, paddingHorizontal: 12, height: 40, fontSize: 13.5 },
  factActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  factSave: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  editTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 14 },
  editArea: { borderRadius: RADIUS.sm, padding: 14, fontSize: 14.5, lineHeight: 20, minHeight: 96, textAlignVertical: 'top' },
  counter: { fontSize: 11.5, marginTop: 6, textAlign: 'right' },
  editDates: { flexDirection: 'row', gap: 8 },
  cercaPosto: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: RADIUS.sm, paddingHorizontal: 12, height: 44 },
  cercaPostoInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  ricercaNota: { paddingVertical: 12, alignItems: 'center' },
  ricercaTesto: { fontSize: 12.5, marginTop: 10, lineHeight: 17 },
  risultati: { borderRadius: RADIUS.md, marginTop: 8, overflow: 'hidden' },
  risultato: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10 },
  risultatoNome: { fontSize: 14, fontWeight: '700' },
  risultatoIndirizzo: { fontSize: 11.5, marginTop: 1 },
  metaList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaSotto: { marginTop: 10 },
  metaChip: { height: 36, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  editError: { fontSize: 12.5, marginTop: 12 },
  senzaRete: { marginHorizontal: 0, marginTop: 0, marginBottom: 18 },
  card: { height: 92, borderRadius: 22, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 18 },
  cardBlob: { position: 'absolute', right: -30, top: -38, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(0,0,0,0.09)' },
  sectionLabel: { fontSize: 10.5, fontWeight: '800', marginBottom: 8 },
  membersBlock: { borderRadius: RADIUS.md, overflow: 'hidden' },
  membersLabel: { marginTop: 20 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10 },
  memberAvatar: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 13, fontWeight: '700', color: '#1B2530' },
  memberName: { fontSize: 14.5, fontWeight: '600' },
  memberSeen: { fontSize: 11.5, marginTop: 1 },
  leaveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    marginTop: 26, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 11, borderRadius: RADIUS.md,
  },
  leaveIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2, marginBottom: 4 },
  confirmBody: { fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 16 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  editActions: { marginTop: 22 },
  btnSecondary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
