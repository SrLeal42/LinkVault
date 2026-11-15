import { createContext, useContext } from 'react';
import type { ApiComponents } from '@/api/client';

export type AuthResponse = ApiComponents['schemas']['AuthResponse'];
export type UserResponse = ApiComponents['schemas']['UserResponse'];
export type LoginRequest = ApiComponents['schemas']['LoginRequest'];
export type RegisterRequest = ApiComponents['schemas']['RegisterRequest'];
export type ChangePasswordRequest = ApiComponents['schemas']['ChangePasswordRequest'];

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export const AUTH_ME_QUERY_KEY = ['auth', 'me'] as const;

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  LIBRARY: '/library',
  COLLECTIONS: '/collections',
  COLLECTION_DETAIL: '/collections/:collectionId',
  TAGS: '/tags',
  PUBLIC_COLLECTION: '/c/:slug',
} as const;

export interface RedirectLocationState {
  from?: string;
}

export interface AuthContextValue {
  user: UserResponse | null;
  status: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  isDemo: boolean;
  applyAuthSession: (session: AuthResponse) => void;
  clearAuthSession: () => void;
  refreshSession: () => Promise<UserResponse | null>;
  login: (payload: LoginRequest) => Promise<UserResponse>;
  register: (payload: RegisterRequest) => Promise<UserResponse>;
  loginDemo: () => Promise<UserResponse>;
  changePassword: (payload: ChangePasswordRequest) => Promise<UserResponse>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider.');
  }
  return context;
}

/**
 * Garante que um destino pós-login seja exclusivamente um path interno seguro
 * (iniciado por '/' simples, bloqueando '//evil.com', esquemas externos ou loops para /login e /register).
 */
export function resolveSafeRedirectPath(
  candidate: unknown,
  fallback: string = ROUTES.LIBRARY,
): string {
  if (typeof candidate !== 'string') {
    return fallback;
  }

  const trimmed = candidate.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith(ROUTES.LOGIN) ||
    trimmed.startsWith(ROUTES.REGISTER)
  ) {
    return fallback;
  }

  return trimmed;
}