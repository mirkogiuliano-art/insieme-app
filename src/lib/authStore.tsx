import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getMyProfile } from '@/lib/api/profiles';
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
      if (data.session) await loadProfile();
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile();
      } else {
        setProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
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
