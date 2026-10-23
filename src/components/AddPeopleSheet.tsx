import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Share } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';
import { useToast } from '@/components/Toast';
import { ShareIcon, CheckIcon, ChevronIcon, SearchIcon, BackIcon } from '@/components/Icon';
import { getInviteToken, rotateInvite, revokeInvite, inviteUrl } from '@/lib/api/invites';
import { personeCheConosco, invitaPersona, type PersonaConosciuta } from '@/lib/api/invitiPersona';
import { initials, colorForUser } from '@/lib/utils';
import type { Group } from '@/types';
import { useT } from '@/i18n';
import { segnalaErrore } from '@/lib/sentry';

interface AddPeopleProps {
  visible: boolean;
  onClose: () => void;
  group: Group;
  /** Da Info gruppo il foglio si apre al posto delle info, e la freccia
   * riporta lì. */
  onBack?: () => void;
}

/** Il foglio «Aggiungi persone», da solo. Info gruppo usa invece
 * `AddPeopleContent` dentro il proprio foglio. */
export function AddPeopleSheet(props: AddPeopleProps) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose}>
      <AddPeopleContent {...props} />
    </BottomSheet>
  );
}

/**
 * Due strade per far entrare qualcuno. Chi è già in un altro dei tuoi
 * gruppi riceve un invito nell'app, e sceglie lui se entrare: non si viene
 * messi in un gruppo senza saperlo, con nome e ultimo accesso in vista di
 * chi non si conosce. Chi non è ancora su Insieme riceve il link.
 *
 * Il link è la strada di riserva, e la sua gestione (nuovo, disattiva)
 * sta chiusa in fondo: serve di rado.
 */
export function AddPeopleContent({ visible, group, onBack }: AddPeopleProps) {
  const { colors } = useTheme();
  const t = useT();
  const toast = useToast();
  const [persone, setPersone] = useState<PersonaConosciuta[] | null>(null);
  const [query, setQuery] = useState('');
  const [inviando, setInviando] = useState<string | null>(null);
  // `undefined` = non ancora letto, `null` = nessun link attivo.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [linkIrraggiungibile, setLinkIrraggiungibile] = useState(false);
  const [gestisci, setGestisci] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setQuery('');
    setGestisci(false);
    personeCheConosco(group.id)
      .then((p) => alive && setPersone(p))
      .catch(() => alive && setPersone([]));
    getInviteToken(group.id)
      .then((tok) => {
        if (!alive) return;
        setToken(tok);
        setLinkIrraggiungibile(false);
      })
      .catch(() => alive && setLinkIrraggiungibile(true));
    return () => {
      alive = false;
    };
  }, [visible, group.id]);

  const invita = async (p: PersonaConosciuta) => {
    if (inviando) return;
    setInviando(p.id);
    try {
      await invitaPersona(group.id, p.id);
      setPersone((prev) => prev?.map((x) => (x.id === p.id ? { ...x, invitata: true } : x)) ?? prev);
    } catch (err) {
      segnalaErrore(err, 'aggiungiPersone.erroreInvito');
      toast.show(t.aggiungiPersone.erroreInvito, 'error');
    } finally {
      setInviando(null);
    }
  };

  const mandaLink = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const tok = token ?? (await rotateInvite(group.id));
      setToken(tok);
      await Share.share({ message: t.home.invitoTesto(group.name, inviteUrl(tok)) });
    } catch (err) {
      segnalaErrore(err, 'infoGruppo.erroreLink');
      toast.show(t.infoGruppo.erroreLink, 'error');
    } finally {
      setBusy(false);
    }
  };

  const nuovoLink = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setToken(await rotateInvite(group.id));
      toast.show(t.infoGruppo.linkNuovo);
    } catch (err) {
      segnalaErrore(err, 'infoGruppo.erroreLinkNuovo');
      toast.show(t.infoGruppo.erroreLinkNuovo, 'error');
    } finally {
      setBusy(false);
    }
  };

  const disattiva = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await revokeInvite(group.id);
      setToken(null);
      toast.show(t.infoGruppo.linkDisattivato);
    } catch (err) {
      segnalaErrore(err, 'infoGruppo.erroreDisattiva');
      toast.show(t.infoGruppo.erroreDisattiva, 'error');
    } finally {
      setBusy(false);
    }
  };

  const term = query.trim().toLowerCase();
  // Senza nessuno da invitare nell'app, il link è l'unica strada: diventa il tasto principale.
  const linkPrincipale = persone !== null && persone.length === 0;
  const mostrate = (persone ?? []).filter((p) => !term || p.nome.toLowerCase().includes(term));

  return (
    <>
      <View style={styles.header}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t.comune.indietro} hitSlop={8} onPress={onBack} style={[styles.back, { backgroundColor: colors.surface2 }]}>
            <BackIcon size={16} color={colors.textDim} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{t.aggiungiPersone.titolo}</Text>
          <Text style={[styles.sub, { color: colors.textDim }]} numberOfLines={1}>{group.name}</Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textDim }]}>{t.aggiungiPersone.conosciute}</Text>
      <Text style={[styles.note, { color: colors.textFaint }]}>
        {persone && persone.length === 0 ? t.aggiungiPersone.nessunaConosciuta : t.aggiungiPersone.conosciuteNota}
      </Text>
      {persone && persone.length > 0 ? (
        <View style={[styles.search, { backgroundColor: colors.surface2 }]}>
          <SearchIcon size={14} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t.aggiungiPersone.cerca}
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>
      ) : null}
      {mostrate.length > 0 ? (
        <View style={[styles.block, { backgroundColor: colors.surface2 }]}>
          {mostrate.map((p, i) => (
            <View key={p.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colorForUser(p.nome) }]}>
                <Text maxFontSizeMultiplier={1} style={styles.avatarText}>{initials(p.nome)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{p.nome}</Text>
                <Text style={[styles.where, { color: colors.textFaint }]} numberOfLines={1}>{t.aggiungiPersone.inGruppi(p.gruppi)}</Text>
              </View>
              {p.invitata ? (
                <View style={styles.sent}>
                  <CheckIcon size={13} color={colors.teal} />
                  <Text style={[styles.sentText, { color: colors.textDim }]}>{t.aggiungiPersone.invitoMandato}</Text>
                </View>
              ) : (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={t.aggiungiPersone.invitaNome(p.nome)}
                  onPress={() => invita(p)}
                  disabled={!!inviando}
                  // Uno per riga: pieni, una colonna di tasti ambra pesava più di tutto il resto.
                  style={[styles.inviteBtn, { backgroundColor: colors.amber + '2E', opacity: inviando === p.id ? 0.6 : 1 }]}
                >
                  <Text style={[styles.inviteText, { color: colors.amberText }]}>{t.aggiungiPersone.invita}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : term && persone && persone.length > 0 ? (
        <Text style={[styles.note, { color: colors.textFaint }]}>{t.aggiungiPersone.nessunoCon(query.trim())}</Text>
      ) : null}

      <Text style={[styles.sectionLabel, styles.spaced, { color: colors.textDim }]}>{t.aggiungiPersone.nonSuInsieme}</Text>
      <Text style={[styles.note, { color: colors.textFaint }]}>
        {linkIrraggiungibile ? t.infoGruppo.invitoSenzaRete : t.aggiungiPersone.linkNota}
      </Text>
      {/* Senza rete il link non si legge né si crea: niente tasto. */}
      {linkIrraggiungibile ? null : (
        <Pressable accessibilityRole="button"
          onPress={mandaLink}
          disabled={busy || token === undefined}
          style={[styles.linkBtn, { backgroundColor: linkPrincipale ? colors.amber : colors.surface2, opacity: busy || token === undefined ? 0.6 : 1 }]}
        >
          <ShareIcon size={15} color={linkPrincipale ? colors.inkOnAmber : colors.amberText} />
          <Text style={{ color: linkPrincipale ? colors.inkOnAmber : colors.text, fontWeight: '700', fontSize: 13.5 }}>{t.aggiungiPersone.mandaLink}</Text>
        </Pressable>
      )}
      {token && !linkIrraggiungibile ? (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: gestisci }} onPress={() => setGestisci((g) => !g)} style={styles.manage}>
            <Text style={{ color: colors.textDim, fontSize: 12.5, fontWeight: '700' }}>{t.aggiungiPersone.gestisciLink}</Text>
            <View style={{ transform: [{ rotate: gestisci ? '90deg' : '0deg' }] }}>
              <ChevronIcon size={13} color={colors.textFaint} />
            </View>
          </Pressable>
          {gestisci ? (
            <>
              <Text style={[styles.note, { color: colors.textFaint }]}>{t.infoGruppo.invitoAttivo}</Text>
              <View style={styles.minorRow}>
                <Pressable accessibilityRole="button" onPress={nuovoLink} disabled={busy} style={[styles.minor, { backgroundColor: colors.surface2 }]}>
                  <Text style={{ color: colors.textDim, fontSize: 12.5, fontWeight: '600' }}>{t.infoGruppo.generaNuovo}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={disattiva} disabled={busy} style={[styles.minor, { backgroundColor: colors.surface2 }]}>
                  <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '600' }}>{t.infoGruppo.disattiva}</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  back: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: 12.5, marginTop: 1 },
  sectionLabel: { fontSize: 10.5, fontWeight: '800', marginBottom: 4 },
  spaced: { marginTop: 20 },
  note: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  search: { height: 40, borderRadius: RADIUS.sm, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 13.5, paddingVertical: 0 },
  block: { borderRadius: RADIUS.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10 },
  avatar: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#1B2530' },
  name: { fontSize: 14.5, fontWeight: '600' },
  where: { fontSize: 11.5, marginTop: 1 },
  inviteBtn: { height: 34, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  inviteText: { fontSize: 13, fontWeight: '800' },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34 },
  sentText: { fontSize: 12.5, fontWeight: '600' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, borderRadius: 999 },
  manage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  minorRow: { flexDirection: 'row', gap: 8 },
  minor: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: RADIUS.sm },
});
