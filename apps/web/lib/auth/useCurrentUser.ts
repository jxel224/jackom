'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, getCurrentUser, logout as apiLogout } from '../api/client';
import type { SafeUser } from '../shared';

export type CurrentUserState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: SafeUser }
  | { status: 'unauthenticated' };

/**
 * The one place the frontend asks "who is logged in" — calls `GET /api/auth/me` on mount. There is
 * no client-readable session token to check locally (the session cookie is HttpOnly, by design —
 * see PERMANENT_BACKEND_FOUNDATION_REPORT.md's Session Model), so this round-trip is the ONLY
 * source of truth; nothing here ever trusts a locally-cached "logged in" flag across a reload.
 */
export function useCurrentUser() {
  const [state, setState] = useState<CurrentUserState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const { user } = await getCurrentUser();
      setState({ status: 'authenticated', user });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'UNAUTHENTICATED') {
        setState({ status: 'unauthenticated' });
      } else {
        // A real network/server error is still "not known to be logged in" from the UI's
        // perspective — never claim authentication we couldn't actually verify.
        setState({ status: 'unauthenticated' });
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setState({ status: 'unauthenticated' });
    }
  }, []);

  return { ...state, refresh, logout };
}
