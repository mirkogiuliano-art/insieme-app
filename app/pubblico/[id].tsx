import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable } from '@/components/Tocco';
import { useTheme, RADIUS, FONT_ROUNDED } from '@/theme/theme';
import { BackIcon, MoreIcon, CalendarIcon, MapIcon, LinkIcon, LockIcon, FlagIcon, GlobeIcon, ChevronIcon, PersonIcon } from '@/components/Icon';
import { ScreenGlow } from '@/components/ScreenGlow';
import { InCaricamento } from '@/components/InCaricamento';
import { BottomSheet } from '@/components/BottomSheet';
import { BarraSezioni, Sezione } from '@/components/BarraSezioni';
import { useToast } from '@/components/Toast';
import { LinksTab } from '@/screens/LinksTab';
import { MapTab } from '@/screens/MapTab';
import { paginaGruppo, segnalaGruppo, type PaginaGruppo } from '@/lib/api/pubblici';
import { listFacts, type RawFact } from '@/lib/api/groupFacts';
import { groupColor } from '@/lib/appStore';
import { TabBarSpaceContext, TABBAR_SPACE } from '@/lib/tabBarSpace';
import { initials, colorForUser, inkOn } from '@/lib/utils';
import { rangeLabel, countdownLabel } from '@/lib/groupInfo';
import { useT } from '@/i18n';

type Sezioni = 'links' | 'map';

/**
 * Un gruppo pubblico visto da chi non ne fa parte: lo stesso gruppo che
 * vedono i membri, con la stessa intestazione e le stesse sezioni, ma senza
 * la chat e senza toccare niente. Le info si aprono toccando il nome, come
 * dentro il gruppo, con le «Cose da sapere» ma senza i membri.
 */
export default function GruppoPubblicoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [pagina, setPagina] = useState<PaginaGruppo | null | undefined>(undefined);
  const [facts, setFacts] = useState<RawFact[]>([]);
  const [tab, setTab] = useState<Sezioni>('links');
  const [focusPinId, setFocusPinId] = useState<string | null>(null);
  const [infoAperte, setInfoAperte] = useState(false);
  const [menu, setMenu] = useState(false);
  const keyboardOpen = useKeyboardState((s) => s.isVisible);

  useEffect(() => {
    let alive = true;
    paginaGruppo(groupId)
      .then((p) => alive && setPagina(p))
      .catch(() => alive && setPagina(null));
    listFacts(groupId)
      .then((f) => alive && setFacts(f))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupId]);

  const indietro = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const tastoIndietro = (
    <Pressable accessibilityRole="button" accessibilityLabel={t.comune.indietro} hitSlop={6} onPress={indietro} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
      <BackIcon size={18} color={colors.textDim} />
    </Pressable>
  );

  if (!pagina) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
        <ScreenGlow />
        <View style={styles.header}>{tastoIndietro}</View>
        <View style={styles.centro}>
          {pagina === undefined ? <InCaricamento /> : <Text style={[styles.vuoto, { color: colors.textFaint }]}>{t.pubblico.gruppoSparito}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const { gruppo, autore, altri, metaNome } = pagina;
  const tinta = groupColor(gruppo);
  const date = rangeLabel(gruppo.startsOn, gruppo.endsOn);
  const quando = countdownLabel(gruppo.startsOn, gruppo.endsOn) ?? date;
  const meta = gruppo.metaLibera ?? null;
  // Come sotto il nome di un gruppo dei propri: qui in più «Pubblico».
  const sottotitolo = [t.pubblico.pubblico, metaNome, quando].filter(Boolean).join(' · ');
  const apriAutore = () => {
    setInfoAperte(false);
    setMenu(false);
    router.push(`/persona/${autore.id}`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <ScreenGlow />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {tastoIndietro}
          <Pressable accessibilityRole="button" accessibilityHint={t.menuGruppo.info} onPress={() => setInfoAperte(true)} style={{ flexShrink: 1 }}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {gruppo.name}
            </Text>
            <View style={styles.subRow}>
              <GlobeIcon size={13} color={colors.teal} strokeWidth={2} />
              <Text style={[styles.sub, { color: colors.textDim }]} numberOfLines={1}>
                {sottotitolo}
              </Text>
            </View>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.altreAzioni} hitSlop={6} onPress={() => setMenu(true)} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
          <MoreIcon size={18} color={colors.textDim} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
        <TabBarSpaceContext.Provider value={keyboardOpen ? 0 : TABBAR_SPACE}>
          <Sezione attiva={tab === 'links'}>
            <LinksTab
              groupId={groupId}
              roster={{}}
              solaLettura
              onShowPlaceOnMap={(pinId) => {
                setFocusPinId(pinId);
                setTab('map');
              }}
            />
          </Sezione>
          <Sezione attiva={tab === 'map'} resta={false}>
            <MapTab groupId={groupId} roster={{}} solaLettura focusPinId={focusPinId} onFocusHandled={() => setFocusPinId(null)} />
          </Sezione>
          <BarraSezioni
            voci={[
              { chiave: 'links', label: t.gruppo.link, icona: (c) => <LinkIcon size={21} color={c} /> },
              { chiave: 'map', label: t.gruppo.mappa, icona: (c) => <MapIcon size={21} color={c} /> },
            ]}
            attiva={tab}
            onCambia={setTab}
          />
        </TabBarSpaceContext.Provider>
      </KeyboardAvoidingView>

      {/* Le info, come toccando il nome dentro un gruppo: senza quello che
          resta dei membri. */}
      <BottomSheet visible={infoAperte} onClose={() => setInfoAperte(false)}>
        <View style={[styles.card, { backgroundColor: tinta }]}>
          <View style={styles.blob} />
          <Text maxFontSizeMultiplier={1.2} style={[styles.cardNome, { color: inkOn(tinta) }]} numberOfLines={2}>
            {gruppo.name}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={apriAutore} style={styles.autore}>
          <View style={[styles.avatar, { backgroundColor: colorForUser(autore.nome) }]}>
            <Text maxFontSizeMultiplier={1} style={styles.avatarText}>{initials(autore.nome)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.autoreNome, { color: colors.text }]} numberOfLines={1}>{autore.nome}</Text>
            <Text style={[styles.autoreSub, { color: colors.textFaint }]} numberOfLines={1}>
              @{autore.nomeUtente}
              {altri > 0 ? ` · ${t.pubblico.eAltri(altri)}` : ''}
            </Text>
          </View>
          <ChevronIcon size={15} color={colors.textFaint} />
        </Pressable>
        {date || metaNome || gruppo.description ? (
          <View style={[styles.block, { backgroundColor: colors.surface2 }]}>
            {date ? (
              <View style={styles.infoRow}>
                <CalendarIcon size={17} color={colors.textDim} />
                <Text style={[styles.infoText, { color: colors.text }]}>{date}</Text>
                {countdownLabel(gruppo.startsOn, gruppo.endsOn) ? (
                  <View style={[styles.conto, { backgroundColor: colors.amber + '2E' }]}>
                    <Text style={{ color: colors.amberText, fontSize: 11.5, fontWeight: '800' }}>{countdownLabel(gruppo.startsOn, gruppo.endsOn)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {metaNome ? (
              <Pressable
                accessibilityRole="link"
                disabled={!meta}
                onPress={() => meta && Linking.openURL(meta.mapsUrl)}
                style={[styles.infoRow, date ? { borderTopWidth: 1, borderTopColor: colors.border } : null]}
              >
                <MapIcon size={17} color={colors.teal} />
                <Text style={[styles.infoText, { color: colors.text }]} numberOfLines={1}>{metaNome}</Text>
              </Pressable>
            ) : null}
            {gruppo.description ? (
              <Text style={[styles.descrizione, { color: colors.textDim }, date || metaNome ? { borderTopWidth: 1, borderTopColor: colors.border } : null]}>
                {gruppo.description}
              </Text>
            ) : null}
          </View>
        ) : null}
        {facts.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textDim }]}>{t.infoGruppo.coseDaSapere}</Text>
            <View style={[styles.block, { backgroundColor: colors.surface2 }]}>
              {facts.map((f, i) => (
                <View key={f.id} style={[styles.factRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Text style={[styles.factLabel, { color: colors.textFaint }]}>{f.label}</Text>
                  <Text style={[styles.factValue, { color: colors.text }]}>{f.value}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        <View style={styles.nota}>
          <LockIcon size={13} color={colors.textFaint} />
          <Text style={[styles.notaText, { color: colors.textFaint }]}>{t.pubblico.chatPrivata}</Text>
        </View>
      </BottomSheet>

      <BottomSheet visible={menu} onClose={() => setMenu(false)}>
        <Pressable accessibilityRole="button" onPress={apriAutore} style={styles.voce}>
          <PersonIcon size={18} color={colors.teal} />
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{t.pubblico.profiloDi(autore.nome)}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setMenu(false);
            segnalaGruppo(groupId)
              .then(() => toast.show(t.pubblico.segnalato))
              .catch(() => toast.show(t.pubblico.erroreSegnala, 'error'));
          }}
          style={[styles.voce, { borderTopWidth: 1, borderTopColor: colors.border }]}
        >
          <FlagIcon size={18} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '600' }}>{t.pubblico.segnala}</Text>
        </Pressable>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4, marginTop: 1 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  sub: { fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  vuoto: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  card: { height: 92, borderRadius: 22, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 16, marginBottom: 14 },
  blob: { position: 'absolute', right: -30, top: -38, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(0,0,0,0.09)' },
  cardNome: { fontFamily: FONT_ROUNDED, fontSize: 28, lineHeight: 34 },
  autore: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4, marginBottom: 12 },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#1B2530' },
  autoreNome: { fontSize: 14.5, fontWeight: '700' },
  autoreSub: { fontSize: 12, marginTop: 1 },
  block: { borderRadius: RADIUS.md, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  infoText: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  conto: { paddingHorizontal: 10, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  descrizione: { fontSize: 14.5, lineHeight: 21, paddingHorizontal: 14, paddingVertical: 13 },
  sectionLabel: { fontSize: 10.5, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  factRow: { paddingHorizontal: 14, paddingVertical: 11 },
  factLabel: { fontSize: 10.5, fontWeight: '800' },
  factValue: { fontSize: 14.5, fontWeight: '700', marginTop: 3 },
  nota: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 16 },
  notaText: { fontSize: 12 },
  voce: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
});
