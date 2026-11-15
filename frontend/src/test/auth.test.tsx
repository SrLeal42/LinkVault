import type * as React from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  type MemoryRouterProps,
} from 'react-router';
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
          detail: 'Sessão ausente ou expirada.',
        },
        { status: 401 },
      );
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
import {
  CSRF_HEADER_NAME,
  apiClient,
  getCsrfToken,
  handleAuthUnauthorizedResponse,
  setCsrfToken,
  setUnauthorizedListener,
} from '@/api/client';
import {
  ROUTES,
  resolveSafeRedirectPath,
  useAuth,
  type AuthResponse,
  type UserResponse,
} from '@/features/auth/auth-context';
import { AuthProvider } from '@/features/auth/auth-provider';
import { GuestRoute, ProtectedRoute } from '@/features/auth/route-guards';
import { AppRoutes } from '@/routes/app-routes';

const REGULAR_USER: UserResponse = {
  id: '01933b2e-1111-7000-8000-000000000001',
  email: 'leitor@linkvault.dev',
  name: 'Leitor Editorial',
  is_demo: false,
  expires_at: null,
  created_at: '2026-11-10T10:00:00Z',
};

const DEMO_USER: UserResponse = {
  id: '01933b2e-2222-7000-8000-000000000002',
  email: 'demo-abc@demo.linkvault.local',
  name: 'Visitante Demo',
  is_demo: true,
  expires_at: '2026-11-16T10:00:00Z',
  created_at: '2026-11-15T10:00:00Z',
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

function renderWithAuth(
  ui: React.ReactNode,
  {
    initialEntries = ['/'],
    queryClient = createTestQueryClient(),
  }: { initialEntries?: MemoryRouterProps['initialEntries']; queryClient?: QueryClient } = {},
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider>{ui}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function AuthStatusProbe(): React.JSX.Element {
  const { user, status, isAuthenticated, isDemo, login, register, loginDemo, changePassword, logout } =
    useAuth();
  const { data: privateLinksCount } = useQuery({
    queryKey: ['links', 'probe'],
    queryFn: async () => Promise.resolve(42),
    enabled: isAuthenticated,
  });

  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user-email">{user?.email ?? 'anon'}</p>
      <p data-testid="is-demo">{String(isDemo)}</p>
      <p data-testid="csrf-in-memory">{getCsrfToken() ?? 'null'}</p>
      <p data-testid="private-cache">{privateLinksCount ?? 'empty'}</p>

      <button
        type="button"
        onClick={() => {
          void login({ email: REGULAR_USER.email, password: 'senha-segura-123' });
        }}
      >
        Login
      </button>
      <button
        type="button"
        onClick={() => {
          void register({
            email: REGULAR_USER.email,
            password: 'senha-segura-123',
            name: REGULAR_USER.name,
          });
        }}
      >
        Register
      </button>
      <button
        type="button"
        onClick={() => {
          void loginDemo();
        }}
      >
        Demo
      </button>
      <button
        type="button"
        onClick={() => {
          void changePassword({
            current_password: 'senha-segura-123',
            new_password: 'nova-senha-segura-456',
          });
        }}
      >
        ChangePassword
      </button>
      <button
        type="button"
        onClick={() => {
          void logout();
        }}
      >
        Logout
      </button>
    </div>
  );
}

function LocationEcho({ label }: { label: string }): React.JSX.Element {
  const location = useLocation();
  const state = location.state as { from?: string } | null;
  return (
    <div>
      <h1>{label}</h1>
      <p data-testid="current-path">{`${location.pathname}${location.search}`}</p>
      <p data-testid="from-state">{state?.from ?? 'none'}</p>
    </div>
  );
}

beforeEach(() => {
  setCsrfToken(null);
  setUnauthorizedListener(null);
});

afterEach(() => {
  server.resetHandlers();
  setCsrfToken(null);
  setUnauthorizedListener(null);
});

afterAll(() => {
  server.close();
  restoreRequest();
});

describe('resolveSafeRedirectPath', () => {
  it('aceita paths internos válidos com query string', () => {
    expect(resolveSafeRedirectPath('/library')).toBe('/library');
    expect(resolveSafeRedirectPath('/collections/123?sort=title_asc')).toBe(
      '/collections/123?sort=title_asc',
    );
  });

  it('rejeita open redirects, URLs externas e loops de login/cadastro', () => {
    expect(resolveSafeRedirectPath('https://evil.com')).toBe(ROUTES.LIBRARY);
    expect(resolveSafeRedirectPath('//evil.com/phishing')).toBe(ROUTES.LIBRARY);
    expect(resolveSafeRedirectPath('/\\evil.com')).toBe(ROUTES.LIBRARY);
    expect(resolveSafeRedirectPath('/login')).toBe(ROUTES.LIBRARY);
    expect(resolveSafeRedirectPath('/register?next=/library')).toBe(ROUTES.LIBRARY);
    expect(resolveSafeRedirectPath(null, '/collections')).toBe('/collections');
  });
});

describe('AuthProvider e ciclo de sessão/CSRF', () => {
  it('hidrata sessão e CSRF em memória quando GET /api/auth/me retorna 200', async () => {
    server.use(
      http.get('*/api/auth/me', () => {
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-me-token',
        });
      }),
    );

    renderWithAuth(<AuthStatusProbe />);

    expect(screen.getByTestId('status')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });
    expect(screen.getByTestId('user-email')).toHaveTextContent(REGULAR_USER.email);
    expect(getCsrfToken()).toBe('csrf-me-token');
  });

  it('resolve imediatamente para unauthenticated em 401 sem retentativas', async () => {
    let attempts = 0;
    server.use(
      http.get('*/api/auth/me', () => {
        attempts += 1;
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:unauthorized',
            title: 'Não autenticado',
            status: 401,
            detail: 'Sessão ausente.',
          },
          { status: 401 },
        );
      }),
    );

    setCsrfToken('stale-token');
    renderWithAuth(<AuthStatusProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    });
    expect(attempts).toBe(1);
    expect(getCsrfToken()).toBeNull();
  });

  it('executa login, rotação de CSRF em changePassword, troca de usuário em loginDemo e logout com limpeza de cache', async () => {
    const user = userEvent.setup();
    let capturedChangePasswordCsrf: string | null = null;
    let capturedLogoutCsrf: string | null = null;

    server.use(
      http.post('*/api/auth/login', () => {
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-login-1',
        });
      }),
      http.post('*/api/auth/password', ({ request }) => {
        capturedChangePasswordCsrf = request.headers.get(CSRF_HEADER_NAME);
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-rotated-2',
        });
      }),
      http.post('*/api/auth/demo', () => {
        return HttpResponse.json<AuthResponse>(
          {
            user: DEMO_USER,
            csrf_token: 'csrf-demo-3',
          },
          { status: 201 },
        );
      }),
      http.post('*/api/auth/logout', ({ request }) => {
        capturedLogoutCsrf = request.headers.get(CSRF_HEADER_NAME);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { queryClient } = renderWithAuth(<AuthStatusProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    });

    await user.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('private-cache')).toHaveTextContent('42');
    });
    expect(getCsrfToken()).toBe('csrf-login-1');

    await user.click(screen.getByRole('button', { name: 'ChangePassword' }));
    await waitFor(() => {
      expect(getCsrfToken()).toBe('csrf-rotated-2');
    });
    expect(capturedChangePasswordCsrf).toBe('csrf-login-1');

    queryClient.setQueryData(['collections', 'list'], ['colecao-usuario-anterior']);
    await user.click(screen.getByRole('button', { name: 'Demo' }));
    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent(DEMO_USER.email);
      expect(screen.getByTestId('is-demo')).toHaveTextContent('true');
    });
    expect(getCsrfToken()).toBe('csrf-demo-3');
    expect(queryClient.getQueryData(['collections', 'list'])).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Logout' }));
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    });
    expect(capturedLogoutCsrf).toBe('csrf-demo-3');
    expect(getCsrfToken()).toBeNull();
    expect(queryClient.getQueryData(['links', 'probe'])).toBeUndefined();
  });

  it('executa register e inicia sessão autenticada', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/auth/register', () => {
        return HttpResponse.json<AuthResponse>(
          {
            user: REGULAR_USER,
            csrf_token: 'csrf-register-1',
          },
          { status: 201 },
        );
      }),
    );

    renderWithAuth(<AuthStatusProbe />);
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    });

    await user.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });
    expect(getCsrfToken()).toBe('csrf-register-1');
  });

  it('derruba sessão ativa quando endpoint privado retorna 401, mas preserva em 401 de login/password', async () => {
    server.use(
      http.get('*/api/auth/me', () => {
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-active',
        });
      }),
      http.get('*/api/links', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:unauthorized',
            title: 'Sessão expirada',
            status: 401,
            detail: 'Sessão expirada.',
          },
          { status: 401 },
        );
      }),
    );

    renderWithAuth(<AuthStatusProbe />);
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });

    const listenerSpy = vi.fn();
    setUnauthorizedListener(listenerSpy);
    handleAuthUnauthorizedResponse(
      new Request('http://localhost/api/auth/password', { method: 'POST' }),
      new Response(null, { status: 401 }),
    );
    expect(listenerSpy).not.toHaveBeenCalled();
    expect(getCsrfToken()).toBe('csrf-active');

    setUnauthorizedListener(() => {
      listenerSpy();
    });
    handleAuthUnauthorizedResponse(
      new Request('http://localhost/api/links', { method: 'GET' }),
      new Response(null, { status: 401 }),
    );
    expect(listenerSpy).toHaveBeenCalledTimes(1);
    expect(getCsrfToken()).toBeNull();

    // Verifica fluxo real via apiClient integrado ao AuthProvider após restaurar sessão
    server.use(
      http.get('*/api/auth/me', () => {
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-rehydrated',
        });
      }),
    );
    const { queryClient } = renderWithAuth(<AuthStatusProbe />);
    await waitFor(() => {
      expect(getCsrfToken()).toBe('csrf-rehydrated');
    });

    await act(async () => {
      await apiClient.GET('/api/links');
    });
    await waitFor(() => {
      expect(queryClient.getQueryData(['auth', 'me'])).toBeNull();
    });
    expect(getCsrfToken()).toBeNull();
  });
});

describe('ProtectedRoute, GuestRoute e AppRoutes', () => {
  it('exibe estado de carregamento enquanto verifica a sessão', () => {
    server.use(
      http.get('*/api/auth/me', async () => {
        await delay('infinite');
        return HttpResponse.json(null, { status: 401 });
      }),
    );

    renderWithAuth(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/library" element={<div>Conteúdo privado</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/library'] },
    );

    expect(screen.getByRole('status')).toHaveTextContent('Verificando sessão...');
  });

  it('ProtectedRoute com enableRedirect=true redireciona para /login preservando state.from', async () => {
    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LocationEcho label="Tela de Login" />} />
        <Route element={<ProtectedRoute enableRedirect={true} />}>
          <Route path="/collections" element={<div>Coleções Privadas</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/collections?filter=recent'] },
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Tela de Login' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('from-state')).toHaveTextContent('/collections?filter=recent');
  });

  it('ProtectedRoute com enableRedirect=false mantém a rota acessível sem redirecionar', async () => {
    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LocationEcho label="Tela de Login" />} />
        <Route
          element={
            <ProtectedRoute
              enableRedirect={false}
              unauthenticatedFallback={<div>Fallback Preparado</div>}
            />
          }
        >
          <Route path="/collections" element={<div>Coleções Privadas</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/collections'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Fallback Preparado')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Tela de Login' })).not.toBeInTheDocument();
  });

  it('GuestRoute redireciona usuário autenticado para state.from seguro ou /library e respeita enableRedirect=false', async () => {
    server.use(
      http.get('*/api/auth/me', () => {
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-guest-test',
        });
      }),
    );

    renderWithAuth(
      <Routes>
        <Route element={<GuestRoute enableRedirect={true} />}>
          <Route path="/login" element={<div>Formulário Login</div>} />
        </Route>
        <Route path="/library" element={<LocationEcho label="Biblioteca Pessoal" />} />
        <Route path="/collections" element={<LocationEcho label="Coleções" />} />
      </Routes>,
      {
        initialEntries: [{ pathname: '/login', state: { from: '/collections?view=compact' } }],
      },
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Coleções' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('current-path')).toHaveTextContent('/collections?view=compact');

    renderWithAuth(
      <Routes>
        <Route element={<GuestRoute enableRedirect={false} />}>
          <Route path="/login" element={<div>Login Sem Redirect</div>} />
        </Route>
        <Route path="/library" element={<div>Biblioteca Pessoal</div>} />
      </Routes>,
      { initialEntries: ['/login'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Login Sem Redirect')).toBeInTheDocument();
    });
  });

  it('AppRoutes renderiza HomePlaceholder em /, coleção pública em /c/:slug e 404 editorial', async () => {
    renderWithAuth(<AppRoutes />, { initialEntries: ['/'] });
    expect(screen.getByRole('heading', { level: 1, name: 'LinkVault' })).toBeInTheDocument();

    renderWithAuth(<AppRoutes />, { initialEntries: ['/c/Xk3m9Qp2LwZr7A'] });
    expect(screen.getByRole('heading', { level: 2, name: 'Coleção Compartilhada' })).toBeInTheDocument();

    renderWithAuth(<AppRoutes />, { initialEntries: ['/nao-existe'] });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Página não encontrada' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Voltar para o início' })).toHaveAttribute('href', '/');
  });
});