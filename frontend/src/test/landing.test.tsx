// import type * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, type MemoryRouterProps } from 'react-router';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { server, restoreRequest } = await vi.hoisted(async () => {
  const OriginalRequest = globalThis.Request;

  class RelativeUrlRequest extends OriginalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === 'string' && input.startsWith('/')) {
        const origin =
          typeof window !== 'undefined' && window.location.origin !== 'null'
            ? window.location.origin
            : 'http://localhost';
        super(`${origin}${input}`, init);
        return;
      }
      super(input, init);
    }
  }

  globalThis.Request = RelativeUrlRequest;

  const { setupServer } = await import('msw/node');
  const { http: mswHttp, HttpResponse: MswHttpResponse } = await import('msw');

  const mswServer = setupServer(
    mswHttp.get('*/api/auth/me', () => {
      return MswHttpResponse.json(
        {
          type: 'urn:linkvault:error:unauthorized',
          title: 'Não autenticado',
          status: 401,
          detail: 'Sessão ausente.',
        },
        { status: 401 },
      );
    }),
    mswHttp.get('*/api/health', () => {
      return MswHttpResponse.json({ status: 'ok' });
    }),
  );

  mswServer.listen({ onUnhandledFrame: 'error' });

  return {
    server: mswServer,
    restoreRequest: () => {
      globalThis.Request = OriginalRequest;
    },
  };
});

import { getCsrfToken, setCsrfToken } from '@/api/client';
import { ToastProvider } from '@/components/ui/toast';
import { ROUTES, type AuthResponse, type UserResponse } from '@/features/auth/auth-context';
import { AuthProvider } from '@/features/auth/auth-provider';
import type { UseBackendWarmupOptions } from '@/features/landing/use-backend-warmup';
import { LandingPage } from '@/pages/landing-page';

const DEMO_USER: UserResponse = {
  id: '01933b2e-2222-7000-8000-000000000002',
  email: 'demo-teste@demo.linkvault.local',
  name: 'Visitante Demo',
  is_demo: true,
  expires_at: '2026-11-16T10:00:00Z',
  created_at: '2026-11-15T10:00:00Z',
};

const REGULAR_USER: UserResponse = {
  id: '01933b2e-1111-7000-8000-000000000001',
  email: 'leitor@linkvault.dev',
  name: 'Leitor Editorial',
  is_demo: false,
  expires_at: null,
  created_at: '2026-11-10T10:00:00Z',
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderLanding({
  initialEntries = [ROUTES.HOME],
  warmupOptions,
}: {
  initialEntries?: MemoryRouterProps['initialEntries'];
  warmupOptions?: UseBackendWarmupOptions;
} = {}) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider defaultDurationMs={60_000}>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider>
            <Routes>
              <Route path={ROUTES.HOME} element={<LandingPage warmupOptions={warmupOptions} />} />
              <Route path={ROUTES.LIBRARY} element={<h1>Destino Biblioteca</h1>} />
              <Route path={ROUTES.LOGIN} element={<h1>Destino Login</h1>} />
              <Route path={ROUTES.REGISTER} element={<h1>Destino Cadastro</h1>} />
              <Route path={ROUTES.PUBLIC_COLLECTION} element={<h1>Destino Coleção Pública</h1>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setCsrfToken(null);
});

afterEach(() => {
  server.resetHandlers();
  setCsrfToken(null);
});

afterAll(() => {
  server.close();
  restoreRequest();
});

describe('LandingPage', () => {
  it('renderiza identidade editorial, etapas e links para visitante', async () => {
    renderLanding();

    expect(screen.getByRole('heading', { level: 1, name: 'LinkVault' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Seu arquivo pessoal de referências técnicas na web.',
      }),
    ).toBeInTheDocument();

    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();

    const registerLinks = screen.getAllByRole('link', { name: /Começar agora/i });
    expect(registerLinks[0]).toHaveAttribute('href', ROUTES.REGISTER);

    const loginLinks = screen.getAllByRole('link', { name: /^Entrar$/i });
    expect(loginLinks[0]).toHaveAttribute('href', ROUTES.LOGIN);

    const publicLink = screen.getByRole('link', { name: /Abrir coleção pública/i });
    expect(publicLink).toHaveAttribute('href', '/c/arquitetura-web');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Entrar como demo' })).toBeEnabled();
    });
  });

  it('destaca acesso direto à biblioteca quando o usuário já está autenticado', async () => {
    server.use(
      http.get('*/api/auth/me', () => {
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-regular',
        });
      }),
    );

    renderLanding();

    await waitFor(() => {
      expect(screen.getByText('Leitor Editorial')).toBeInTheDocument();
    });
    expect(screen.queryByText(REGULAR_USER.email)).not.toBeInTheDocument();

    const libraryLinks = screen.getAllByRole('link', { name: /Acessar minha biblioteca/i });
    expect(libraryLinks[0]).toHaveAttribute('href', ROUTES.LIBRARY);
    expect(screen.queryByRole('link', { name: /^Entrar$/i })).not.toBeInTheDocument();
  });

  it('exibe o e-mail na Home quando o usuário autenticado não possui nome', async () => {
    server.use(
      http.get('*/api/auth/me', () => {
        return HttpResponse.json<AuthResponse>({
          user: { ...REGULAR_USER, name: null },
          csrf_token: 'csrf-regular-no-name',
        });
      }),
    );

    renderLanding();

    await waitFor(() => {
      expect(screen.getByText(REGULAR_USER.email)).toBeInTheDocument();
    });
  });

  it('navega para a prévia da coleção pública ao clicar no exemplo', async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole('link', { name: /Abrir coleção pública/i }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Destino Coleção Pública' }),
    ).toBeInTheDocument();
  });

  it('não exibe banner de cold start quando /api/health responde rápido', async () => {
    let healthCalls = 0;
    server.use(
      http.get('*/api/health', () => {
        healthCalls += 1;
        return HttpResponse.json({ status: 'ok' });
      }),
    );

    renderLanding({
      warmupOptions: { coldStartThresholdMs: 40, retryIntervalMs: 50 },
    });

    await waitFor(() => {
      expect(healthCalls).toBe(1);
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 70);
    });

    expect(screen.queryByText(/Estamos iniciando o servidor de demonstração/i)).not.toBeInTheDocument();
  });

  it('exibe aviso de cold start após threshold e oculta automaticamente após retry bem-sucedido', async () => {
    let healthAttempts = 0;
    server.use(
      http.get('*/api/health', () => {
        healthAttempts += 1;
        if (healthAttempts === 1) {
          return HttpResponse.json({ status: 'warming' }, { status: 503 });
        }
        return HttpResponse.json({ status: 'ok' });
      }),
    );

    renderLanding({
      warmupOptions: { coldStartThresholdMs: 30, retryIntervalMs: 80, maxRetries: 5 },
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /Estamos iniciando o servidor de demonstração/i,
      );
    });

    await waitFor(() => {
      expect(healthAttempts).toBeGreaterThanOrEqual(2);
      expect(screen.queryByText(/Estamos iniciando o servidor de demonstração/i)).not.toBeInTheDocument();
    });
  });

  it('inicia sessão demo, exibe toast e navega para /library ao clicar em Entrar como demo', async () => {
    const user = userEvent.setup();

    server.use(
      http.post('*/api/auth/demo', async () => {
        await delay(40);
        return HttpResponse.json<AuthResponse>(
          {
            user: DEMO_USER,
            csrf_token: 'csrf-demo-token',
          },
          { status: 201 },
        );
      }),
    );

    renderLanding();

    const demoButton = await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Entrar como demo' });
      expect(btn).toBeEnabled();
      return btn;
    });

    await user.click(demoButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Destino Biblioteca' })).toBeInTheDocument();
    });

    expect(getCsrfToken()).toBe('csrf-demo-token');
    const toastRegion = screen.getByRole('region', { name: /Notificações/i });
    expect(within(toastRegion).getByText('Sessão de demonstração iniciada.')).toBeInTheDocument();
  });

  it('bloqueia duplo clique durante carregamento e exibe erro amigável em 429', async () => {
    const user = userEvent.setup();
    let demoCalls = 0;

    server.use(
      http.post('*/api/auth/demo', async () => {
        demoCalls += 1;
        await delay(40);
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:rate_limit',
            title: 'Limite atingido',
            status: 429,
            detail: 'Muitas sessões demo criadas.',
          },
          {
            status: 429,
            headers: { 'Retry-After': '45' },
          },
        );
      }),
    );

    renderLanding();

    const demoButton = await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Entrar como demo' });
      expect(btn).toBeEnabled();
      return btn;
    });

    await user.click(demoButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Muitas tentativas. Aguarde 45 segundos antes de tentar novamente.',
      );
    });

    expect(demoCalls).toBe(1);
    const toastRegion = screen.getByRole('region', { name: /Notificações/i });
    expect(
      within(toastRegion).getByText('Não foi possível iniciar a demonstração'),
    ).toBeInTheDocument();
  });
});