import type * as React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { SpinnerIcon } from '@/components/icons/icons';
import {
  ROUTES,
  resolveSafeRedirectPath,
  useAuth,
  type RedirectLocationState,
} from './auth-context';
import styles from './route-guards.module.css';

export interface ProtectedRouteProps {
  children?: React.ReactNode;
  redirectTo?: string;
  enableRedirect?: boolean;
  unauthenticatedFallback?: React.ReactNode;
}

export interface GuestRouteProps {
  children?: React.ReactNode;
  redirectTo?: string;
  enableRedirect?: boolean;
}

function SessionLoadingState(): React.JSX.Element {
  return (
    <div className={styles.loadingContainer} role="status" aria-live="polite">
      <SpinnerIcon size={18} className={styles.loadingSpinner} />
      <span className={styles.loadingText}>Verificando sessão...</span>
    </div>
  );
}

function extractRedirectFromState(state: unknown): unknown {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    return (state as { from?: unknown }).from;
  }
  return undefined;
}

export function ProtectedRoute({
  children,
  redirectTo = ROUTES.LOGIN,
  enableRedirect = true,
  unauthenticatedFallback,
}: ProtectedRouteProps): React.JSX.Element {
  const { status, isAuthenticated } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <SessionLoadingState />;
  }

  if (!isAuthenticated) {
    if (!enableRedirect) {
      return <>{unauthenticatedFallback ?? children ?? <Outlet />}</>;
    }
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={redirectTo} state={{ from } satisfies RedirectLocationState} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

export function GuestRoute({
  children,
  redirectTo = ROUTES.LIBRARY,
  enableRedirect = true,
}: GuestRouteProps): React.JSX.Element {
  const { status, isAuthenticated } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <SessionLoadingState />;
  }

  if (isAuthenticated && enableRedirect) {
    const candidate = extractRedirectFromState(location.state);
    const destination = resolveSafeRedirectPath(candidate, redirectTo);
    return <Navigate to={destination} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}