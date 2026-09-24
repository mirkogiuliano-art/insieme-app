import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Share, ActivityIndicator } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS, FONT_ROUNDED } from '@/theme/theme';
import { fitFontSize } from '@/lib/fitText';
import { useAuth } from '@/lib/authStore';
import { groupColor, useAppStore } from '@/lib/appStore';
import { useToast } from '@/components/Toast';
import { ShareIcon, LogoutIcon, EditIcon, CalendarIcon, MapIcon, PlusIcon, CloseIcon, ChevronIcon, CheckIcon } from '@/components/Icon';
import { listPins, type RawPin } from '@/lib/api/pins';
import { listFacts, addFact, editFact, removeFact, subscribeToFacts, type RawFact } from '@/lib/api/groupFacts';
import { setGroupInfo } from '@/lib/api/groups';
import { rangeLabel, countdownLabel, isoToInput, inputToIso } from '@/lib/groupInfo';
import { listLastReads, subscribeToLastReads, countMembers } from '@/lib/api/groupMembers';
import { getInviteToken, rotateInvite, revokeInvite, inviteUrl } from '@/lib/api/invites';
import { initials, colorForUser, dateLabel, inkOn } from '@/lib/utils';
import type { Group } from '@/types';

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
}

function lastSeenLabel(ts: number | null | undefined): string {
  if (ts == null) return 'Mai aperta';
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'proprio ora';
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'ora' : 'ore'} fa`;
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
  const pronto = draft.label.trim().length > 0 && draft.value.trim().length > 0;
  return (
    <View style={[styles.factEditor, !first && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <TextInput
        style={[styles.factInputLabel, { backgroundColor: colors.surface, color: colors.text }]}
        placeholder="Hotel"
        placeholderTextColor={colors.textFaint}
        value={draft.label}
        onChangeText={(t) => onChange({ ...draft, label: t })}
        maxLength={40}
      />
      <TextInput
        style={[styles.factInputValue, { backgroundColor: colors.surface, color: colors.text }]}
        placeholder="Gracery Shinjuku · check-in 15:00"
        placeholderTextColor={colors.textFaint}
        value={draft.value}
        onChangeText={(t) => onChange({ ...draft, value: t })}
        maxLength={200}
        onSubmitEditing={onSave}
      />
      <View style={styles.factActions}>
        {onRemove ? (
          <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Togli la riga">
            <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '700' }}>Togli</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onCancel} hitSlop={8}>
          <CloseIcon size={16} color={colors.textFaint} />
        </Pressable>
        <Pressable
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

/**
 * La pagina di modifica delle info: descrizione, date e meta insieme, in
 * un colpo solo. Le date si scrivono GG/MM/AAAA; la meta si sceglie fra i
 * posti già salvati nella mappa del gruppo.
 */
function InfoEditor({
  group,
  pins,
  onCancel,
  onSaved,
  onError,
}: {
  group: Group;
  pins: RawPin[];
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const { colors } = useTheme();
  const [description, setDescription] = useState(group.description ?? '');
  const [dal, setDal] = useState(isoToInput(group.startsOn));
  const [al, setAl] = useState(isoToInput(group.endsOn));
  const [pinId, setPinId] = useState<string | null>(group.placePinId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const salva = async () => {
    const inizio = inputToIso(dal);
    const fine = inputToIso(al);
    if (!inizio.ok || !fine.ok) {
      setError('Le date si scrivono così: 12/04/2027.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await setGroupInfo(group.id, {
        description: description.trim() || null,
        startsOn: inizio.iso,
        endsOn: fine.iso,
        placePinId: pinId,
      });
      onSaved();
    } catch (err) {
      onError((err as { message?: string })?.message || 'Non sono riuscito a salvare le info.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible onClose={onCancel}>
      <Text style={[styles.editTitle, { color: colors.text }]}>Info del gruppo</Text>

      <Text style={[styles.sectionLabel, { color: colors.textDim }]}>DESCRIZIONE</Text>
      <TextInput
        style={[styles.editArea, { backgroundColor: colors.surface2, color: colors.text }]}
        placeholder="A cosa serve questo gruppo"
        placeholderTextColor={colors.textFaint}
        value={description}
        onChangeText={setDescription}
        maxLength={300}
        multiline
      />
      <Text style={[styles.counter, { color: colors.textFaint }]}>{description.trim().length} / 300</Text>

      <Text style={[styles.sectionLabel, styles.spacedLabel, { color: colors.textDim }]}>QUANDO</Text>
      <View style={styles.editDates}>
        <TextInput
          style={[styles.editDate, { backgroundColor: colors.surface2, color: colors.text }]}
          placeholder="Dal  GG/MM/AAAA"
          placeholderTextColor={colors.textFaint}
          value={dal}
          onChangeText={(t) => {
            setDal(t);
            setError('');
          }}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <TextInput
          style={[styles.editDate, { backgroundColor: colors.surface2, color: colors.text }]}
          placeholder="Al  GG/MM/AAAA"
          placeholderTextColor={colors.textFaint}
          value={al}
          onChangeText={(t) => {
            setAl(t);
            setError('');
          }}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
      </View>

      <Text style={[styles.sectionLabel, styles.spacedLabel, { color: colors.textDim }]}>DOVE</Text>
      {pins.length === 0 ? (
        <Text style={[styles.factsEmpty, { color: colors.textFaint }]}>
          Nessun posto salvato: la meta si sceglie fra i posti della mappa del gruppo.
        </Text>
      ) : (
        <View style={styles.metaList}>
          {pins.slice(0, 8).map((p) => {
            const scelto = p.id === pinId;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPinId(scelto ? null : p.id)}
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
      )}

      {error ? <Text style={[styles.editError, { color: colors.danger }]}>{error}</Text> : null}

      <View style={styles.confirmActions}>
        <Pressable onPress={onCancel} disabled={busy} style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}>
          <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
        </Pressable>
        <Pressable onPress={salva} disabled={busy} style={[styles.btnPrimary, { backgroundColor: colors.amber, opacity: busy ? 0.6 : 1 }]}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.inkOnAmber} />
          ) : (
            <Text style={{ color: colors.inkOnAmber, fontWeight: '800' }}>Salva</Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

export function GroupInfoSheet({ visible, onClose, group, roster, onLeaveGroup, onShowPlace }: GroupInfoSheetProps) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const toast = useToast();
  const [lastReads, setLastReads] = useState<Record<string, number | null>>({});
  // `undefined` = non ancora letto, `null` = nessun invito attivo.
  const [inviteToken, setInviteToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [cardWidth, setCardWidth] = useState(0);
  const { leaveGroup } = useAppStore();
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

  // Riaprendo il foglio si riparte dalle informazioni, mai da una
  // conferma rimasta a metà.
  useEffect(() => {
    if (visible) {
      setConfirmLeave(false);
      setEditingInfo(false);
      setFactDraft(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const carica = () => {
      listFacts(group.id)
        .then((f) => alive && setFacts(f))
        .catch(() => {});
    };
    carica();
    listPins(group.id)
      .then((p) => alive && setPins(p))
      .catch(() => {});
    const unsubscribe = subscribeToFacts(group.id, carica);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [visible, group.id]);

  const meta = group.placePinId ? (pins.find((p) => p.id === group.placePinId) ?? null) : null;
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
    } catch {
      toast.show('Non sono riuscito a salvare la riga.');
    }
  };

  const togliRiga = async (id: string) => {
    try {
      await removeFact(id);
      setFactDraft(null);
      setFacts((prev) => prev.filter((f) => f.id !== id));
    } catch {
      toast.show('Non sono riuscito a togliere la riga.');
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
    } catch {
      toast.show('Non sono riuscito a farti uscire dal gruppo, riprova.');
    } finally {
      setLeaving(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    getInviteToken(group.id).then(setInviteToken);
  }, [visible, group.id]);

  const shareLink = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const token = inviteToken ?? (await rotateInvite(group.id));
      setInviteToken(token);
      await Share.share({ message: `Entra nel gruppo "${group.name}" su Insieme:\n${inviteUrl(token)}` });
    } catch {
      toast.show('Non sono riuscito a preparare il link.');
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setInviteToken(await rotateInvite(group.id));
      toast.show('Nuovo link creato. Il precedente non funziona più.');
    } catch {
      toast.show('Non sono riuscito a creare il nuovo link.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await revokeInvite(group.id);
      setInviteToken(null);
      toast.show('Link disattivato.');
    } catch {
      toast.show('Non sono riuscito a disattivare il link.');
    } finally {
      setBusy(false);
    }
  };

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
        onError={(m) => toast.show(m)}
      />
    );
  }

  if (confirmLeave) {
    const lastOne = memberCount === 1;
    return (
      <BottomSheet visible={visible} onClose={onClose}>
        <Text style={[styles.confirmTitle, { color: colors.text }]}>
          {lastOne ? 'Sei l’ultimo rimasto' : 'Lasciare il gruppo?'}
        </Text>
        <Text style={[styles.confirmBody, { color: colors.textDim }]}>
          {lastOne
            ? 'Uscendo, il gruppo verrà eliminato per intero: chat, link, posti e categorie. Non si può annullare.'
            : 'Non vedrai più chat, link e posti di questo gruppo. Per rientrare ti servirà un nuovo link di invito.'}
        </Text>
        <View style={styles.confirmActions}>
          <Pressable
            onPress={() => setConfirmLeave(false)}
            disabled={leaving}
            style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}
          >
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
          </Pressable>
          <Pressable
            onPress={runLeave}
            disabled={leaving}
            style={[styles.btnPrimary, { backgroundColor: colors.danger, opacity: leaving ? 0.6 : 1 }]}
          >
            {leaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>{lastOne ? 'Esci ed elimina' : 'Lascia'}</Text>
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
                style={{ fontFamily: FONT_ROUNDED, fontSize: size, lineHeight: Math.round(size * 1.2), color: inkOn(groupColor(group)) }}
                numberOfLines={1}
              >
                {group.name}
              </Text>
            );
          })()}
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textDim }]}>DESCRIZIONE</Text>
      <Pressable onPress={() => setEditingInfo(true)} style={[styles.infoBlock, { backgroundColor: colors.surface2 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.description, { color: group.description ? colors.text : colors.textFaint }]}>
            {group.description || 'Aggiungi una descrizione: a cosa serve questo gruppo.'}
          </Text>
          {group.description && group.infoUpdatedAt ? (
            <Text style={[styles.infoMeta, { color: colors.textFaint }]}>
              Aggiornata da {group.infoUpdatedBy ? (roster[group.infoUpdatedBy] ?? 'qualcuno') : 'qualcuno'} ·{' '}
              {lastSeenLabel(group.infoUpdatedAt)}
            </Text>
          ) : null}
        </View>
        <EditIcon size={15} color={colors.textDim} />
      </Pressable>

      <Text style={[styles.sectionLabel, styles.spacedLabel, { color: colors.textDim }]}>QUANDO E DOVE</Text>
      <View style={[styles.membersBlock, { backgroundColor: colors.surface2 }]}>
        <Pressable onPress={() => setEditingInfo(true)} style={styles.infoRow}>
          <CalendarIcon size={17} color={date ? colors.textDim : colors.textFaint} />
          <Text style={[styles.infoRowText, { color: date ? colors.text : colors.textFaint, fontWeight: date ? '700' : '500' }]}>
            {date ?? 'Aggiungi le date'}
          </Text>
          {conto ? (
            <View style={[styles.countdown, { backgroundColor: colors.amber + '2E' }]}>
              <Text style={{ color: colors.amber, fontSize: 11.5, fontWeight: '800' }}>{conto}</Text>
            </View>
          ) : (
            <ChevronIcon size={15} color={colors.textFaint} />
          )}
        </Pressable>
        <Pressable
          onPress={() => (meta ? onShowPlace?.(meta.id) : setEditingInfo(true))}
          style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border }]}
        >
          <MapIcon size={17} color={meta ? colors.teal : colors.textFaint} strokeWidth={1.9} />
          <Text style={[styles.infoRowText, { color: meta ? colors.teal : colors.textFaint, fontWeight: meta ? '700' : '500' }]}>
            {meta ? meta.name : 'Scegli la meta'}
          </Text>
          <ChevronIcon size={15} color={colors.textFaint} />
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, styles.spacedLabel, { color: colors.textDim }]}>COSE DA SAPERE</Text>
      <View style={[styles.membersBlock, { backgroundColor: colors.surface2 }]}>
        {facts.length === 0 && !factDraft ? (
          <Text style={[styles.factsEmpty, { color: colors.textFaint }]}>
            Niente per ora. Qui stanno le informazioni che servono a tutti: hotel, volo, parola d’ordine del wi-fi.
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
            <Pressable
              key={f.id}
              onPress={() => setFactDraft({ id: f.id, label: f.label, value: f.value })}
              style={[styles.factRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.factLabel, { color: colors.textFaint }]}>{f.label.toUpperCase()}</Text>
                <Text style={[styles.factValue, { color: colors.text }]}>{f.value}</Text>
              </View>
              <EditIcon size={14} color={colors.textFaint} />
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
        ) : (
          <Pressable
            onPress={() => setFactDraft({ id: null, label: '', value: '' })}
            style={[styles.addFact, facts.length > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <PlusIcon size={14} color={colors.lilac} />
            <Text style={{ color: colors.lilac, fontSize: 13.5, fontWeight: '800' }}>Aggiungi una riga</Text>
          </Pressable>
        )}
      </View>

      <Text style={[styles.sectionLabel, styles.spacedLabel, { color: colors.textDim }]}>LINK DI INVITO</Text>
      <Text style={[styles.inviteNote, { color: colors.textFaint }]}>
        {inviteToken === undefined
          ? 'Un attimo…'
          : inviteToken
            ? 'Chiunque abbia il link può entrare nel gruppo. Disattivalo se finisce dove non doveva.'
            : 'Nessun link attivo: al momento non può entrare nessuno. Creane uno per invitare qualcuno.'}
      </Text>
      <Pressable
        onPress={shareLink}
        disabled={busy || inviteToken === undefined}
        style={[styles.inviteBtn, { backgroundColor: colors.amber, opacity: busy || inviteToken === undefined ? 0.6 : 1 }]}
      >
        <ShareIcon size={15} color={colors.inkOnAmber} />
        <Text style={{ color: colors.inkOnAmber, fontWeight: '700', fontSize: 13 }}>
          {inviteToken ? 'Condividi il link' : 'Crea e condividi il link'}
        </Text>
      </Pressable>
      {inviteToken ? (
        <View style={styles.inviteActions}>
          <Pressable onPress={regenerate} disabled={busy} style={[styles.inviteMinor, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.textDim, fontSize: 12.5, fontWeight: '600' }}>Genera nuovo</Text>
          </Pressable>
          <Pressable onPress={revoke} disabled={busy} style={[styles.inviteMinor, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '600' }}>Disattiva</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, styles.membersLabel, { color: colors.textDim }]}>MEMBRI — {members.length}</Text>
      <View style={[styles.membersBlock, { backgroundColor: colors.surface2 }]}>
        {members.map(([userId, name], i) => {
          const isMe = userId === session?.user.id;
          return (
            <View key={userId} style={[styles.memberRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={[styles.memberAvatar, { backgroundColor: colorForUser(name) }]}>
                <Text style={styles.memberAvatarText}>{initials(name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.memberName, { color: colors.text }]}>
                  {name}
                  {isMe ? ' (tu)' : ''}
                </Text>
                {!isMe ? (
                  <Text style={[styles.memberSeen, { color: colors.textFaint }]}>
                    Ultimo accesso: {lastSeenLabel(lastReads[userId])}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {/* In fondo e staccata dal resto: è una cosa del gruppo, quindi sta
          qui e non nelle impostazioni, ma è anche l'unica che ti porta
          fuori. Passa da una conferma. */}
      <Pressable onPress={() => setConfirmLeave(true)} style={[styles.leaveRow, { backgroundColor: colors.surface2 }]}>
        <View style={[styles.leaveIcon, { backgroundColor: colors.danger + '26' }]}>
          <LogoutIcon size={15} color={colors.danger} strokeWidth={2} />
        </View>
        <Text style={{ color: colors.danger, fontSize: 14.5, fontWeight: '600' }}>Lascia il gruppo</Text>
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
  factLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7 },
  factValue: { fontSize: 14.5, fontWeight: '700', marginTop: 3 },
  factsEmpty: { fontSize: 13, lineHeight: 19, padding: 14 },
  addFact: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 13 },
  factEditor: { padding: 12, gap: 8 },
  factInputLabel: { borderRadius: RADIUS.sm, paddingHorizontal: 12, height: 40, fontSize: 13.5, fontWeight: '700' },
  factInputValue: { borderRadius: RADIUS.sm, paddingHorizontal: 12, height: 40, fontSize: 13.5 },
  factActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  factSave: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  editTitle: { fontFamily: FONT_ROUNDED, fontSize: 21, letterSpacing: -0.3, marginBottom: 14 },
  editArea: { borderRadius: RADIUS.sm, padding: 14, fontSize: 14.5, lineHeight: 20, minHeight: 96, textAlignVertical: 'top' },
  counter: { fontSize: 11.5, marginTop: 6, textAlign: 'right' },
  editDates: { flexDirection: 'row', gap: 8 },
  editDate: { flex: 1, borderRadius: RADIUS.sm, paddingHorizontal: 14, height: 48, fontSize: 14.5 },
  metaList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaChip: { height: 36, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  editError: { fontSize: 12.5, marginTop: 12 },
  card: { height: 92, borderRadius: 22, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 18 },
  cardBlob: { position: 'absolute', right: -30, top: -38, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(0,0,0,0.09)' },
  sectionLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  membersBlock: { borderRadius: RADIUS.md, overflow: 'hidden' },
  // Solo qui e non su "LINK DI INVITO": quella etichetta segue già il
  // margine del blocco con nome e avatar del gruppo, che le dà abbastanza
  // spazio da sé.
  membersLabel: { marginTop: 20 },
  inviteNote: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    height: 46, borderRadius: 999,
  },
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  inviteMinor: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: RADIUS.sm },
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
  confirmTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  confirmBody: { fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 16 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  btnSecondary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
