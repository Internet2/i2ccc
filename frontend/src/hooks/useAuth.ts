import { useEffect, useRef, useState } from 'react';
import {
  type CognitoUser,
  exchangeCodeForTokens,
  isTokenExpired,
  logoutRedirect,
  parseIdToken,
  redirectToLogin,
  refreshTokens,
} from '../auth/cognito';

// Module-scoped — survives re-renders but not page refreshes
let memoryRefreshToken: string | null = null;

// Guard against StrictMode double-mount consuming the code twice
let codeExchangeInProgress = false;

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: CognitoUser | null;
  idToken: string | null;
  authError: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    idToken: null,
    authError: null,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function scheduleRefresh(expiresIn: number) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    // Refresh 60 seconds before expiry
    const delayMs = Math.max((expiresIn - 60) * 1000, 0);

    refreshTimerRef.current = setTimeout(async () => {
      if (!memoryRefreshToken) {
        redirectToLogin();
        return;
      }

      try {
        const tokens = await refreshTokens(memoryRefreshToken);
        sessionStorage.setItem('cognito_id_token', tokens.id_token);
        sessionStorage.setItem('cognito_access_token', tokens.access_token);

        const user = parseIdToken(tokens.id_token);
        setState({
          isAuthenticated: true,
          isLoading: false,
          user,
          idToken: tokens.id_token,
          authError: null,
        });

        scheduleRefresh(tokens.expires_in);
      } catch {
        redirectToLogin();
      }
    }, delayMs);
  }

  useEffect(() => {
    async function init() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      // Handle errors returned by Cognito
      if (error) {
        window.history.replaceState({}, '', window.location.pathname);
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          idToken: null,
          authError: errorDescription || error,
        });
        return;
      }

      // Case 1: OAuth callback with authorization code
      if (code) {
        // StrictMode double-mount guard
        if (codeExchangeInProgress) return;
        codeExchangeInProgress = true;

        try {
          const tokens = await exchangeCodeForTokens(code);

          sessionStorage.setItem('cognito_id_token', tokens.id_token);
          sessionStorage.setItem('cognito_access_token', tokens.access_token);
          if (tokens.refresh_token) {
            memoryRefreshToken = tokens.refresh_token;
          }

          window.history.replaceState({}, '', window.location.pathname);

          const user = parseIdToken(tokens.id_token);
          setState({
            isAuthenticated: true,
            isLoading: false,
            user,
            idToken: tokens.id_token,
            authError: null,
          });

          scheduleRefresh(tokens.expires_in);
        } catch (err) {
          window.history.replaceState({}, '', window.location.pathname);
          setState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            idToken: null,
            authError: err instanceof Error ? err.message : 'Token exchange failed',
          });
        } finally {
          codeExchangeInProgress = false;
        }
        return;
      }

      // If another mount is exchanging a code, stay in loading state
      if (codeExchangeInProgress) return;

      // Case 2: Existing token in sessionStorage
      const existingToken = sessionStorage.getItem('cognito_id_token');
      if (existingToken && !isTokenExpired(existingToken)) {
        const user = parseIdToken(existingToken);
        setState({
          isAuthenticated: true,
          isLoading: false,
          user,
          idToken: existingToken,
          authError: null,
        });

        const remainingSeconds = user.exp - Math.floor(Date.now() / 1000);
        scheduleRefresh(remainingSeconds);
        return;
      }

      // Case 3: No valid token — redirect to login
      redirectToLogin();
    }

    init();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...state,
    logout: logoutRedirect,
  };
}
