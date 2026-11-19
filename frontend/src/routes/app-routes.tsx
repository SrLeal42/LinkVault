import type * as React from 'react';
import { Link, Route, Routes } from 'react-router';
import { EmptyState } from '@/components/ui/emptystate';
import { ROUTES } from '@/features/auth/auth-context';

import { GuestRoute, ProtectedRoute } from '@/features/auth/route-guards';

import { LandingPage } from '@/pages/landing-page';
import { LoginPage } from '@/pages/login-page';
import { RegisterPage } from '@/pages/register-page';

export interface AppRoutesProps {
  enableGuardRedirects?: boolean;
}


function RoutePlaceholder({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <main style={{ padding: 'var(--space-8)', maxWidth: '42rem', margin: '0 auto' }}>
      <EmptyState eyebrow={eyebrow} title={title} description={description} />
    </main>
  );
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
    <Routes>
      <Route path={ROUTES.HOME} element={<LandingPage />} />

      <Route element={<GuestRoute enableRedirect={enableGuardRedirects} />}>
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />
        <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute enableRedirect={enableGuardRedirects} />}>
        <Route
          path={ROUTES.LIBRARY}
          element={
            <RoutePlaceholder
              eyebrow="BIBLIOTECA"
              title="Minha Biblioteca"
              description="Listagem e pesquisa de links reservadas para as etapas 3.9–3.11."
            />
          }
        />
        <Route
          path={ROUTES.COLLECTIONS}
          element={
            <RoutePlaceholder
              eyebrow="COLEÇÕES"
              title="Minhas Coleções"
              description="Gerenciamento de coleções reservado para a etapa 3.12."
            />
          }
        />
        <Route
          path={ROUTES.COLLECTION_DETAIL}
          element={
            <RoutePlaceholder
              eyebrow="COLEÇÃO"
              title="Detalhes da Coleção"
              description="Visualização contextual de coleção reservada para a etapa 3.12."
            />
          }
        />
        <Route
          path={ROUTES.TAGS}
          element={
            <RoutePlaceholder
              eyebrow="TAGS"
              title="Gerenciar Tags"
              description="Catálogo de tags reservado para a etapa 3.13."
            />
          }
        />
      </Route>

      <Route
        path={ROUTES.PUBLIC_COLLECTION}
        element={
          <RoutePlaceholder
            eyebrow="COLEÇÃO PÚBLICA"
            title="Coleção Compartilhada"
            description="Visualização pública somente leitura reservada para a Fase 4."
          />
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}