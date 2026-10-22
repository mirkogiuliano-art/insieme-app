import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/lib/authStore';
import { listMyGroups } from '@/lib/api/groups';
import { leaveGroup as apiLeaveGroup } from '@/lib/api/groupMembers';
import { sweepGroupMedia } from '@/lib/api/mediaUpload';
import { hashStr } from '@/lib/utils';
import { GROUP_PALETTE, type Group } from '@/types';
import { segnalaErrore } from '@/lib/sentry';
import { eProblemaDiRete } from '@/lib/errori';
import { leggiCopia, salvaCopia, useRiprovaDaSola } from '@/lib/copiaLocale';

interface AppStoreValue {
  ready: boolean;
  myGroups: Group[];
  /** true se l'ultima lettura dei gruppi è fallita. */
  loadError: boolean;
  /** Da quando si vede l'elenco salvato sul telefono, se il server non ha risposto. */
  offlineDal: number | null;
  refreshGroups: () => Promise<void>;
  /** Aggiorna solo la cache locale — la scrittura su Supabase è già stata
   * fatta dal chiamante (groups.createGroupWithMembership /
   * invites.redeemInvite) prima di invocare questa funzione. */
  addGroup: (g: Group) => void;
  /** Ritorna `true` se il gruppo è stato eliminato perché rimasto vuoto. */
  leaveGroup: (id: string) => Promise<boolean>;
  getGroup: (id: string) => Group | undefined;
}

const AppStoreContext = createContext<AppStoreValue>({
  ready: false,
  myGroups: [],
  loadError: false,
  offlineDal: null,
  refreshGroups: async () => {},
  addGroup: () => {},
  leaveGroup: async () => false,
  getGroup: () => undefined,
});

export function groupColor(g: Group): string {
  return g.color || GROUP_PALETTE[hashStr(g.id) % GROUP_PALETTE.length];
}

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const { session, ready: authReady } = useAuth();
  const [ready, setReady] = useState(false);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [offlineDal, setOfflineDal] = useState<number | null>(null);

  /** `loadError` distingue "non hai gruppi" da "non sono riuscito a
   * leggerli": senza, un guasto di rete faceva sembrare che i gruppi
   * fossero spariti. */
  const refreshGroups = async () => {
    const utente = session?.user.id;
    try {
      const gruppi = await listMyGroups();
      setMyGroups(gruppi);
      setLoadError(false);
      setOfflineDal(null);
      salvaCopia(utente, 'gruppi', gruppi);
    } catch (err) {
      if (!eProblemaDiRete(err)) segnalaErrore(err, 'caricamento.gruppi');
      // Senza rete, i gruppi dell'ultima volta: si possono aprire, e
      // dentro ognuno c'è la sua copia.
      const copia = await leggiCopia<Group[]>(utente, 'gruppi');
      if (copia) {
        setMyGroups((prev) => (prev.length > 0 ? prev : copia.dati));
        setOfflineDal(copia.ts);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    }
  };

  useRiprovaDaSola(!!session && (loadError || offlineDal !== null), refreshGroups);

  useEffect(() => {
    if (!authReady) return;
    if (!session) {
      setMyGroups([]);
      setReady(true);
      return;
    }
    (async () => {
      // Con la copia dei gruppi la home si apre subito, anche senza rete;
      // il server la aggiorna appena risponde.
      const copia = await leggiCopia<Group[]>(session.user.id, 'gruppi');
      if (copia) {
        setMyGroups((prev) => (prev.length > 0 ? prev : copia.dati));
        setReady(true);
        await refreshGroups();
      } else {
        await refreshGroups();
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session?.user.id]);

  const addGroup = (g: Group) => {
    setMyGroups((prev) => (prev.some((x) => x.id === g.id) ? prev : [g, ...prev]));
  };

  /** Ritorna `true` se uscendo si è eliminato il gruppo, perché si era
   * l'ultimo membro rimasto. */
  const leaveGroup = async (id: string) => {
    const deleted = await apiLeaveGroup(id);
    setMyGroups((prev) => prev.filter((x) => x.id !== id));
    // Con il gruppo eliminato le sue righe spariscono a cascata, ma i file
    // caricati resterebbero nel deposito: qui parte la spazzata.
    if (deleted) sweepGroupMedia(id);
    return deleted;
  };

  const getGroup = (id: string) => myGroups.find((g) => g.id === id);

  return (
    <AppStoreContext.Provider
      value={{ ready, myGroups, loadError, offlineDal, refreshGroups, addGroup, leaveGroup, getGroup }}
    >
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore() {
  return useContext(AppStoreContext);
}
