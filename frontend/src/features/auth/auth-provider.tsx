import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import {
  apiClient,
  setCsrfToken,
  setUnauthorizedListener,
  type ValidationErrorItem,
} from '@/api/client';
import { parseApiError, type ApiErrorKind, type ParsedApiError } from '@/api/errors';
import {
  AUTH_ME_QUERY_KEY,
  AuthContext,
  type AuthContextValue,
  type AuthResponse,
  type AuthStatus,
  type ChangePasswordRequest,
  type LoginRequest,
  type LogoutOptions,
  type RegisterRequest,
  type UserResponse,
} from './auth-context';

class AuthRequestError extends Error implements ParsedApiError {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly title: string;
  readonly detail: string;
  readonly userMessage: string;
  readonly fieldErrors: Record<string, string>;
  readonly validationItems: ValidationErrorItem[];
  readonly retryAfterSeconds: number | null;
  readonly requestId: string | null;
  readonly type: string;
  readonly isRecoverable: boolean;

  constructor(parsed: ParsedApiError) {
    super(parsed.userMessage);
    this.name = 'AuthRequestError';
    this.kind = parsed.kind;
    this.status = parsed.status;
    this.title = parsed.title;
    this.detail = parsed.detail;
    this.userMessage = parsed.userMessage;
    this.fieldErrors = parsed.fieldErrors;
    this.validationItems = parsed.validationItems;
    this.retryAfterSeconds = parsed.retryAfterSeconds;
    this.requestId = parsed.requestId;
    this.type = parsed.type;
    this.isRecoverable = parsed.isRecoverable;
  }
}

interface AuthApiResult {
  data?: AuthResponse;
  error?: unknown;
  response: Response;
}

async function fetchCurrentSession({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<UserResponse | null> {
  let result: AuthApiResult;
  try {
    result = await apiClient.GET('/api/auth/me', { signal });
  } catch (caught) {
    throw new AuthRequestError(parseApiError(caught));
  }

  if (result.response.status === 401) {
    setCsrfToken(null);
    return null;
  }

  if (!result.response.ok || !result.data) {
    throw new AuthRequestError(parseApiError(result.error, result.response));
  }

  setCsrfToken(result.data.csrf_token);
  return result.data.user;
}

async function executeAuthMutation(run: () => Promise<AuthApiResult>): Promise<AuthResponse> {
  let result: AuthApiResult;
  try {
    result = await run();
  } catch (caught) {
    throw new AuthRequestError(parseApiError(caught));
  }

  if (!result.response.ok || !result.data) {
    throw new AuthRequestError(parseApiError(result.error, result.response));
  }

  return result.data;
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const location = useLocation();
  
  const [logoutRedirect, setLogoutRedirect] = useState<{
    target: string;
    sourceKey: string;
  } | null>(null);

  const applyAuthSession = useCallback(
    (session: AuthResponse): void => {
      void queryClient.cancelQueries({ queryKey: AUTH_ME_QUERY_KEY });
      const previousUser = queryClient.getQueryData<UserResponse | null>(AUTH_ME_QUERY_KEY);
      if (previousUser && previousUser.id !== session.user.id) {
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] !== AUTH_ME_QUERY_KEY[0],
        });
      }
      setLogoutRedirect(null);
      setCsrfToken(session.csrf_token);
      queryClient.setQueryData<UserResponse | null>(AUTH_ME_QUERY_KEY, session.user);
    },
    [queryClient],
  );

  const clearAuthSession = useCallback((): void => {
    void queryClient.cancelQueries({ queryKey: AUTH_ME_QUERY_KEY });
    setCsrfToken(null);
    queryClient.setQueryData<UserResponse | null>(AUTH_ME_QUERY_KEY, null);
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== AUTH_ME_QUERY_KEY[0],
    });
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedListener(() => {
      clearAuthSession();
    });
    return () => {
      setUnauthorizedListener(null);
    };
  }, [clearAuthSession]);

  const meQuery = useQuery<UserResponse | null, AuthRequestError>({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: fetchCurrentSession,
    staleTime: 1000 * 60 * 5,
    retry: (failureCount, error) => {
      if (error.status !== null && error.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
  });
  
  const refreshSession = useCallback(async (): Promise<UserResponse | null> => {
    return queryClient.query({
      queryKey: AUTH_ME_QUERY_KEY,
      queryFn: fetchCurrentSession,
      staleTime: 0,
    });
  }, [queryClient]);

  const login = useCallback(
    async (payload: LoginRequest): Promise<UserResponse> => {
      const session = await executeAuthMutation(() =>
        apiClient.POST('/api/auth/login', { body: payload }),
      );
      applyAuthSession(session);
      return session.user;
    },
    [applyAuthSession],
  );

  const register = useCallback(
    async (payload: RegisterRequest): Promise<UserResponse> => {
      const session = await executeAuthMutation(() =>
        apiClient.POST('/api/auth/register', { body: payload }),
      );
      applyAuthSession(session);
      return session.user;
    },
    [applyAuthSession],
  );

  const loginDemo = useCallback(async (): Promise<UserResponse> => {
    const session = await executeAuthMutation(() => apiClient.POST('/api/auth/demo'));
    applyAuthSession(session);
    return session.user;
  }, [applyAuthSession]);

  const changePassword = useCallback(
    async (payload: ChangePasswordRequest): Promise<UserResponse> => {
      const session = await executeAuthMutation(() =>
        apiClient.POST('/api/auth/password', { body: payload }),
      );
      applyAuthSession(session);
      return session.user;
    },
    [applyAuthSession],
  );
  
  const logout = useCallback(
    async (options?: LogoutOptions): Promise<void> => {
      try {
        await apiClient.POST('/api/auth/logout');
      } catch {
        // Mesmo em falha de rede, a sessão local e o CSRF devem ser descartados.
      } finally {
        setLogoutRedirect(
          options?.redirectTo ? { target: options.redirectTo, sourceKey: location.key } : null,
        );
        clearAuthSession();
      }
    },
    [clearAuthSession, location.key],
  );

  const user = meQuery.data ?? null;
  const status: AuthStatus = meQuery.isPending
    ? 'loading'
    : user
      ? 'authenticated'
      : 'unauthenticated';
  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated';
  const isDemo = Boolean(user?.is_demo);
  const logoutRedirectPath =
    logoutRedirect?.sourceKey === location.key && logoutRedirect.target !== location.pathname
      ? logoutRedirect.target
      : null;

const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isLoading,
      isAuthenticated,
      isDemo,
      logoutRedirectPath,
      applyAuthSession,
      clearAuthSession,
      refreshSession,
      login,
      register,
      loginDemo,
      changePassword,
      logout,
    }),
    [
      user,
      status,
      isLoading,
      isAuthenticated,
      isDemo,
      logoutRedirectPath,
      applyAuthSession,
      clearAuthSession,
      refreshSession,
      login,
      register,
      loginDemo,
      changePassword,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}