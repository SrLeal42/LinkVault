import { Suspense, lazy } from 'react';
import type * as React from 'react';
import { Link, Route, Routes } from 'react-router';
import { SpinnerIcon } from '@/components/icons/icons';
import { EmptyState } from '@/components/ui/emptystate';
import { ROUTES } from '@/features/auth/auth-context';

import { GuestRoute, ProtectedRoute } from '@/features/auth/route-guards';

import { LandingPage } from '@/pages/landing-page';

const AppShell = lazy(() =>
  import('@/components/layout/app-shell').then((module) => ({ default: module.AppShell })),
);
const LoginPage = lazy(() =>
  import('@/pages/login-page').then((module) => ({ default: module.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('@/pages/register-page').then((module) => ({ default: module.RegisterPage })),
);
const LibraryPage = lazy(() =>
  import('@/pages/library-page').then((module) => ({ default: module.LibraryPage })),
);
const CollectionsPage = lazy(() =>
  import('@/pages/collections-page').then((module) => ({ default: module.CollectionsPage })),
);
const CollectionDetailPage = lazy(() =>
  import('@/pages/collection-detail-page').then((module) => ({
    default: module.CollectionDetailPage,
  })),
);
const TagsPage = lazy(() =>
  import('@/pages/tags-page').then((module) => ({ default: module.TagsPage })),
);

export interface AppRoutesProps {
  enableGuardRedirects?: boolean;
}

function RouteLoadingFallback(): React.JSX.Element {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando página"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        minHeight: '12rem',
        padding: 'var(--space-8) var(--space-4)',
        color: 'var(--color-muted-text)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      <SpinnerIcon size={18} style={{ color: 'var(--color-accent-strong)' }} />
      <span>Carregando...</span>
    </div>
  );
}

function RoutePlaceholder({
  eyebrow,
  title,
  description,
  standalone = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  standalone?: boolean;
}): React.JSX.Element {
  const content = <EmptyState eyebrow={eyebrow} title={title} description={description} />;
  if (standalone) {
    return (
      <main style={{ padding: 'var(--space-8)', maxWidth: '42rem', margin: '0 auto' }}>
        {content}
      </main>
    );
  }
  return <div style={{ maxWidth: '42rem' }}>{content}</div>;
}

function NotFoundPage(): React.JSX.Element {
  return (
    <main style={{ padding: 'var(--space-8)', maxWidth: '42rem', margin: '0 auto' }}>
      <EmptyState
        eyebrow="404"
        title="Página não encontrada"
        description="O endereço acessado não existe ou foi movido."
        action={
          <Link
            to={ROUTES.HOME}
            style={{
              color: 'var(--color-accent-strong)',
              fontWeight: 600,
              textDecoration: 'underline',
              textUnderlineOffset: '0.2em',
            }}
          >
            Voltar para o início
          </Link>
        }
      />
    </main>
  );
}

export function AppRoutes({ enableGuardRedirects = true }: AppRoutesProps): React.JSX.Element {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
    <Routes>
      <Route path={ROUTES.HOME} element={<LandingPage />} />

      <Route element={<GuestRoute enableRedirect={enableGuardRedirects} />}>
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />
        <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute enableRedirect={enableGuardRedirects} />}>
        
        <Route element={<AppShell />}>
          
          <Route path={ROUTES.LIBRARY} element={<LibraryPage />} />
        
          <Route path={ROUTES.COLLECTIONS} element={<CollectionsPage />} />
          
          <Route path={ROUTES.COLLECTION_DETAIL} element={<CollectionDetailPage />} />

          <Route path={ROUTES.TAGS} element={<TagsPage />} />
        
        </Route>
      
      </Route>

      <Route
        path={ROUTES.PUBLIC_COLLECTION}
        element={
          <RoutePlaceholder
            eyebrow="COLEÇÃO PÚBLICA"
            title="Coleção Compartilhada"
            description="Visualização pública somente leitura reservada para a Fase 4."
            standalone
          />
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
    
  );
}