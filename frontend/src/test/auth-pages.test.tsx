import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
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
import { GuestRoute } from '@/features/auth/route-guards';
import { LoginPage } from '@/pages/login-page';
import { RegisterPage } from '@/pages/register-page';
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
  email: 'demo-auth@demo.linkvault.local',
  name: 'Visitante Demo',
  is_demo: true,
  expires_at: '2026-11-20T10:00:00Z',
  created_at: '2026-11-19T10:00:00Z',
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

function DestinationProbe({ title }: { title: string }) {
  const location = useLocation();
  return (
    <div>
      <h1>{title}</h1>
      <p data-testid="dest-path">{`${location.pathname}${location.search}`}</p>
    </div>
  );
}

function renderAuthPages(initialEntries: MemoryRouterProps['initialEntries']) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider defaultDurationMs={60_000}>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider>
            <Routes>
              <Route path={ROUTES.HOME} element={<DestinationProbe title="Landing" />} />
              <Route element={<GuestRoute />}>
                <Route path={ROUTES.LOGIN} element={<LoginPage />} />
                <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
              </Route>
              <Route path={ROUTES.LIBRARY} element={<DestinationProbe title="Biblioteca" />} />
              <Route path={ROUTES.COLLECTIONS} element={<DestinationProbe title="Coleções" />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function renderFullRoutes(initialEntries: MemoryRouterProps['initialEntries']) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider defaultDurationMs={60_000}>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider>
            <AppRoutes />
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

describe('LoginPage', () => {
  it('valida campos com Zod no cliente sem disparar requisição quando inválidos', async () => {
    const loginSpy = vi.fn();
    server.use(
      http.post('*/api/auth/login', () => {
        loginSpy();
        return HttpResponse.json({ status: 'unexpected' }, { status: 500 });
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([ROUTES.LOGIN]);

    const submitButton = await screen.findByRole('button', { name: 'Entrar' });
    await user.click(submitButton);

    expect(await screen.findByText('Informe seu endereço de e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();
    expect(loginSpy).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/E-mail/i), 'email-invalido');
    await user.type(screen.getByLabelText(/^Senha/i), 'minhasenha123');
    await user.click(submitButton);

    expect(await screen.findByText('Informe um endereço de e-mail válido.')).toBeInTheDocument();
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it('normaliza e-mail, autentica, atualiza CSRF e redireciona para state.from seguro ou /library', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post('*/api/auth/login', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-login-ok',
        });
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([{ pathname: ROUTES.LOGIN, state: { from: '/collections?tag=python' } }]);

    const emailInput = await screen.findByLabelText(/E-mail/i);
    await user.type(emailInput, '  Leitor@LinkVault.DEV  ');
    await user.type(screen.getByLabelText(/^Senha/i), 'SenhaSuperSegura123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Coleções' })).toBeInTheDocument();
    });

    expect(capturedBody).toEqual({
      email: 'leitor@linkvault.dev',
      password: 'SenhaSuperSegura123',
    });
    expect(screen.getByTestId('dest-path')).toHaveTextContent('/collections?tag=python');
    expect(getCsrfToken()).toBe('csrf-login-ok');
  });

  it('bloqueia open redirect em state.from e envia para /library como fallback', async () => {
    server.use(
      http.post('*/api/auth/login', () => {
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-safe-fallback',
        });
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([{ pathname: ROUTES.LOGIN, state: { from: '//evil.example/phish' } }]);

    const emailInput = await screen.findByLabelText(/E-mail/i);
    await user.type(emailInput, 'leitor@linkvault.dev');
    await user.type(screen.getByLabelText(/^Senha/i), 'SenhaSuperSegura123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('dest-path')).toHaveTextContent('/library');
  });

  it('trata erro 401 (credenciais inválidas) exibindo mensagem genérica no alerta', async () => {
    server.use(
      http.post('*/api/auth/login', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:unauthorized',
            title: 'Não autenticado',
            status: 401,
            detail: 'E-mail ou senha inválidos.',
          },
          { status: 401 },
        );
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([ROUTES.LOGIN]);

    const emailInput = await screen.findByLabelText(/E-mail/i);
    await user.type(emailInput, 'leitor@linkvault.dev');
    await user.type(screen.getByLabelText(/^Senha/i), 'SenhaIncorreta123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('E-mail ou senha inválidos.');
    expect(getCsrfToken()).toBeNull();
  });

  it('trata erro 422 mapeando erros por campo e 429 exibindo Retry-After', async () => {
    server.use(
      http.post('*/api/auth/login', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:validation_error',
            title: 'Erro de validação',
            status: 422,
            detail: 'Um ou mais campos enviados são inválidos.',
            errors: [
              { field: 'email', message: 'Endereço de e-mail inválido no servidor.', code: 'value_error' },
            ],
          },
          { status: 422 },
        );
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([ROUTES.LOGIN]);

    const emailInput = await screen.findByLabelText(/E-mail/i);
    await user.type(emailInput, 'leitor@linkvault.dev');
    await user.type(screen.getByLabelText(/^Senha/i), 'SenhaSuperSegura123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Endereço de e-mail inválido no servidor.')).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail/i)).toHaveAttribute('aria-invalid', 'true');

    server.use(
      http.post('*/api/auth/login', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:rate_limit_exceeded',
            title: 'Limite de requisições excedido',
            status: 429,
            detail: 'Muitas tentativas. Tente novamente mais tarde.',
          },
          {
            status: 429,
            headers: { 'Retry-After': '45' },
          },
        );
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText(
        'Muitas tentativas. Aguarde 45 segundos antes de tentar novamente.',
      ),
    ).toBeInTheDocument();
  });

  it('alterna a visibilidade da senha ao clicar no botão de mostrar e ocultar senha', async () => {
    const user = userEvent.setup();
    renderAuthPages([ROUTES.LOGIN]);

    const passwordInput = await screen.findByLabelText(/^Senha/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});

describe('RegisterPage', () => {
  it('valida política de senha mínima (12 chars) e proíbe senha apenas com espaços no cliente', async () => {
    const registerSpy = vi.fn();
    server.use(
      http.post('*/api/auth/register', () => {
        registerSpy();
        return HttpResponse.json({ status: 'unexpected' }, { status: 500 });
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([ROUTES.REGISTER]);

    const emailInput = await screen.findByLabelText(/E-mail/i);
    await user.type(emailInput, 'novo@linkvault.dev');
    await user.type(screen.getByLabelText(/^Senha/i), 'curta123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByText('A senha deve possuir no mínimo 12 caracteres.'),
    ).toBeInTheDocument();
    expect(registerSpy).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/^Senha/i));
    await user.type(screen.getByLabelText(/^Senha/i), '            ');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByText('A senha não pode conter apenas espaços em branco.'),
    ).toBeInTheDocument();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('cadastra usuário enviando name null quando vazio, grava CSRF e redireciona', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post('*/api/auth/register', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json<AuthResponse>(
          {
            user: { ...REGULAR_USER, name: null },
            csrf_token: 'csrf-register-ok',
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([ROUTES.REGISTER]);

    const emailInput = await screen.findByLabelText(/E-mail/i);
    await user.type(emailInput, '  NovoUsuario@LinkVault.dev ');
    await user.type(screen.getByLabelText(/^Senha/i), 'UmaSenhaForteComMaisDe12');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeInTheDocument();
    });

    expect(capturedBody).toEqual({
      email: 'novousuario@linkvault.dev',
      password: 'UmaSenhaForteComMaisDe12',
      name: null,
    });
    expect(getCsrfToken()).toBe('csrf-register-ok');
  });

  it('envia name preenchido e mapeia erro 409 Conflict para o campo de e-mail', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post('*/api/auth/register', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:conflict',
            title: 'Conflito de dados',
            status: 409,
            detail: 'Este endereço de e-mail já está cadastrado.',
          },
          { status: 409 },
        );
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([ROUTES.REGISTER]);

    const nameInput = await screen.findByLabelText(/Nome/i);
    await user.type(nameInput, '  Ana Silva  ');
    await user.type(screen.getByLabelText(/E-mail/i), 'ana@linkvault.dev');
    await user.type(screen.getByLabelText(/^Senha/i), 'SenhaValida12345');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/E-mail/i)).toHaveAttribute('aria-invalid', 'true');
    });

    expect(capturedBody).toEqual({
      email: 'ana@linkvault.dev',
      password: 'SenhaValida12345',
      name: 'Ana Silva',
    });
    expect(
      screen.getAllByText('Este endereço de e-mail já está cadastrado.').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('mapeia erro 422 do backend no campo de senha e 429 com Retry-After', async () => {
    server.use(
      http.post('*/api/auth/register', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:validation_error',
            title: 'Erro de validação',
            status: 422,
            detail: 'Um ou mais campos enviados são inválidos.',
            errors: [
              {
                field: 'password',
                message: 'A senha escolhida é muito comum. Escolha outra combinação.',
                code: 'common_password',
              },
            ],
          },
          { status: 422 },
        );
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([ROUTES.REGISTER]);

    const emailInput = await screen.findByLabelText(/E-mail/i);
    await user.type(emailInput, 'teste@linkvault.dev');
    await user.type(screen.getByLabelText(/^Senha/i), 'password123456');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByText('A senha escolhida é muito comum. Escolha outra combinação.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Senha/i)).toHaveAttribute('aria-invalid', 'true');

    server.use(
      http.post('*/api/auth/register', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:rate_limit_exceeded',
            title: 'Limite de requisições excedido',
            status: 429,
            detail: 'Muitas tentativas.',
          },
          { status: 429, headers: { 'Retry-After': '120' } },
        );
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByText(
        'Muitas tentativas. Aguarde 120 segundos antes de tentar novamente.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Alternância de rotas, atalho demo e guardas padrão em AppRoutes', () => {
  it('preserva state.from ao alternar entre Login e Cadastro e conclui cadastro com redirecionamento', async () => {
    server.use(
      http.post('*/api/auth/register', () => {
        return HttpResponse.json<AuthResponse>(
          {
            user: REGULAR_USER,
            csrf_token: 'csrf-cross-nav',
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([{ pathname: ROUTES.LOGIN, state: { from: '/collections' } }]);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Entrar no LinkVault' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Criar conta' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Criar conta' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/E-mail/i), 'leitor@linkvault.dev');
    await user.type(screen.getByLabelText(/^Senha/i), 'SenhaSuperSegura123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Coleções' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('dest-path')).toHaveTextContent('/collections');
  });

  it('permite entrar como demo a partir do layout de autenticação e trata erro 429 no atalho demo', async () => {
    server.use(
      http.post('*/api/auth/demo', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:rate_limit_exceeded',
            title: 'Limite de requisições excedido',
            status: 429,
            detail: 'Muitas tentativas.',
          },
          { status: 429, headers: { 'Retry-After': '30' } },
        );
      }),
    );

    const user = userEvent.setup();
    renderAuthPages([ROUTES.LOGIN]);

    const demoButton = await screen.findByRole('button', { name: 'Entrar como demo' });
    await waitFor(() => {
      expect(demoButton).toBeEnabled();
    });

    await user.click(demoButton);
    const demoAlert = await screen.findByRole('alert');
    expect(demoAlert).toHaveTextContent(
      'Muitas tentativas. Aguarde 30 segundos antes de tentar novamente.',
    );

    server.use(
      http.post('*/api/auth/demo', () => {
        return HttpResponse.json<AuthResponse>(
          {
            user: DEMO_USER,
            csrf_token: 'csrf-demo-from-auth',
          },
          { status: 201 },
        );
      }),
    );

    await user.click(demoButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeInTheDocument();
    });
    expect(getCsrfToken()).toBe('csrf-demo-from-auth');
  });

  it('AppRoutes ativa redirecionamentos por padrão: visitante em /library vai para /login e usuário autenticado sai de /login e /register', async () => {
    server.use(
      http.post('*/api/auth/login', () => {
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-guard-flow',
        });
      }),
    );

    const user = userEvent.setup();
    renderFullRoutes([ROUTES.LIBRARY]);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Entrar no LinkVault' }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/E-mail/i), 'leitor@linkvault.dev');
    await user.type(screen.getByLabelText(/^Senha/i), 'SenhaSuperSegura123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Minha Biblioteca' }),
    ).toBeInTheDocument();

    server.use(
      http.get('*/api/auth/me', () => {
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-already-authed',
        });
      }),
    );

    renderFullRoutes([ROUTES.REGISTER]);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Minha Biblioteca' }),
    ).toBeInTheDocument();
  });
});
