import type * as React from 'react';
import { Link, Route, Routes } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
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
    <Routes>
      <Route path={ROUTES.HOME} element={<LandingPage />} />

      <Route element={<GuestRoute enableRedirect={enableGuardRedirects} />}>
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />
        <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute enableRedirect={enableGuardRedirects} />}>
        
        <Route element={<AppShell />}>
        
          <Route
            path={ROUTES.LIBRARY}
            element={
              <RoutePlaceholder
                eyebrow="BIBLIOTECA"
                title="Minha Biblioteca"
                description="Listagem e pesquisa de links reservadas para as etapas 3.10–3.11."
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
  );
}