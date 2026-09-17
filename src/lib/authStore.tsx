import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getMyProfile } from '@/lib/api/profiles';
import { registraDispositivo, dimenticaDispositivo } from '@/lib/api/push';
import type { Profile } from '@/types';

interface AuthStoreValue {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Token dell'invito da riscattare subito dopo il login: capita quando
   * si apre un link d'invito senza essere ancora autenticati. */
  pendingInviteToken: string | null;
  setPendingInviteToken: (id: string | null) => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthStoreContext = createContext<AuthStoreValue>({
  ready: false,
  session: null,
  profile: null,
  pendingInviteToken: null,
  setPendingInviteToken: () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);

  const loadProfile = async () => {
    const p = await getMyProfile();
    setProfile(p);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) {
        await loadProfile();
        // Non si aspetta: il permesso per le notifiche può richiedere un
        // dialogo di sistema, e nel frattempo l'app deve essere già usabile.
        registraDispositivo();
      }
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile();
        registraDispositivo();
      } else {
        setProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // Prima di uscire, altrimenti la cancellazione del dispositivo verrebbe
    // rifiutata (non si è più nessuno) e questo telefono resterebbe
    // agganciato a un account che qui non è più in uso.
    await dimenticaDispositivo();
    await supabase.auth.signOut();
  };

  return (
    <AuthStoreContext.Provider
      value={{
        ready,
        session,
        profile,
        pendingInviteToken,
        setPendingInviteToken,
        refreshProfile: loadProfile,
        signOut,
      }}
    >
      {children}
    </AuthStoreContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthStoreContext);
}
