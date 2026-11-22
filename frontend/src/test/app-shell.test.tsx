import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, type MemoryRouterProps } from 'react-router';
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
    mswHttp.get('*/api/links', () => {
      return MswHttpResponse.json({ items: [], next_cursor: null });
    }),
    mswHttp.get('*/api/collections', () => {
      return MswHttpResponse.json({ items: [] });
    }),
    mswHttp.get('*/api/collections/:collectionId', ({ params }) => {
      return MswHttpResponse.json({
        id: String(params.collectionId),
        name: 'Detalhes da Coleção',
        description: null,
        visibility: 'private',
        public_slug: null,
        link_count: 0,
        created_at: '2026-11-10T10:00:00Z',
        updated_at: '2026-11-10T10:00:00Z',
      });
    }),
    mswHttp.get('*/api/tags', () => {
      return MswHttpResponse.json({ items: [] });
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

import { CSRF_HEADER_NAME, getCsrfToken, setCsrfToken } from '@/api/client';
import { ToastProvider } from '@/components/ui/toast';
import { ROUTES, type AuthResponse, type UserResponse } from '@/features/auth/auth-context';
import { formatDemoExpiration } from '@/features/auth/auth-forms';
import { AuthProvider } from '@/features/auth/auth-provider';
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
  email: 'demo-shell@demo.linkvault.local',
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

function renderAppAt(
  initialEntries: MemoryRouterProps['initialEntries'],
  queryClient: QueryClient = createTestQueryClient(),
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider defaultDurationMs={60_000}>
          <MemoryRouter initialEntries={initialEntries}>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

function mockAuthenticatedUser(user: UserResponse, csrfToken = 'csrf-shell-initial'): void {
  server.use(
    http.get('*/api/auth/me', () => {
      return HttpResponse.json<AuthResponse>({
        user,
        csrf_token: csrfToken,
      });
    }),
  );
}

async function openAccountMenu(
  user: ReturnType<typeof userEvent.setup>,
  displayName: string,
): Promise<HTMLElement> {
  const trigger = await screen.findByRole('button', {
    name: `Menu da conta de ${displayName}`,
  });
  await user.click(trigger);
  return screen.findByRole('menu');
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

describe('formatDemoExpiration', () => {
  it('formata timestamps ISO em formato editorial UTC determinístico', () => {
    expect(formatDemoExpiration('2026-11-16T10:00:00Z')).toBe('16 NOV 2026, 10:00 UTC');
    expect(formatDemoExpiration('2026-01-05T08:09:00Z')).toBe('05 JAN 2026, 08:09 UTC');
    expect(formatDemoExpiration(null)).toBeNull();
    expect(formatDemoExpiration('invalida')).toBeNull();
  });
});

describe('AppShell — navegação, identidade e conta demo', () => {
  it('renderiza uma única landmark main, navega entre Biblioteca, Coleções e Tags e mantém Coleções ativa no detalhe', async () => {
    mockAuthenticatedUser(REGULAR_USER);
    const user = userEvent.setup();

    renderAppAt([ROUTES.LIBRARY]);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Minha Biblioteca' }),
    ).toBeInTheDocument();

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByText('Leitor Editorial')).toBeInTheDocument();
    expect(screen.getByText(REGULAR_USER.email)).toBeInTheDocument();
    expect(screen.queryByText(/CONTA DEMO/i)).not.toBeInTheDocument();

    const libraryLink = screen.getByRole('link', { name: 'Biblioteca' });
    const collectionsLink = screen.getByRole('link', { name: 'Coleções' });
    const tagsLink = screen.getByRole('link', { name: 'Tags' });

    expect(libraryLink).toHaveAttribute('aria-current', 'page');

    await user.click(collectionsLink);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Minhas Coleções' }),
    ).toBeInTheDocument();
    expect(collectionsLink).toHaveAttribute('aria-current', 'page');

    await user.click(tagsLink);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Gerenciar Tags' }),
    ).toBeInTheDocument();
    expect(tagsLink).toHaveAttribute('aria-current', 'page');

    renderAppAt(['/collections/01933b2e-9999-7000-8000-000000000099']);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Detalhes da Coleção' }),
    ).toBeInTheDocument();
    const detailNav = screen.getAllByRole('navigation', { name: 'Navegação da biblioteca' })[1];
    if (!detailNav) {
      throw new Error('Navegação do detalhe da coleção não encontrada.');
    }
    expect(within(detailNav).getByRole('link', { name: 'Coleções' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('exibe faixa de conta demo com expiração e desabilita Alterar senha com explicação textual no menu da conta', async () => {
    mockAuthenticatedUser(DEMO_USER, 'csrf-demo-shell');
    const user = userEvent.setup();

    renderAppAt([ROUTES.LIBRARY]);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Minha Biblioteca' }),
    ).toBeInTheDocument();

    const demoBanner = screen.getByRole('status');
    expect(demoBanner).toHaveTextContent('CONTA DEMO · EXPIRA EM 16 NOV 2026, 10:00 UTC');
    expect(demoBanner).toHaveTextContent(
      'Coleções públicas e alteração de senha estão desativadas.',
    );

    const menu = await openAccountMenu(user, 'Visitante Demo');
    const passwordMenuItem = within(menu).getByRole('menuitem', { name: /Alterar senha/i });
    expect(passwordMenuItem).toHaveAttribute('aria-disabled', 'true');
    expect(within(menu).getByText('Indisponível no modo demonstração.')).toBeInTheDocument();
  });
});

describe('ChangePasswordDialog', () => {
  it('valida regras no cliente com Zod (vazio, curta, só espaços e igual à atual) sem chamar a API', async () => {
    mockAuthenticatedUser(REGULAR_USER);
    const passwordSpy = vi.fn();
    server.use(
      http.post('*/api/auth/password', () => {
        passwordSpy();
        return HttpResponse.json({ status: 'unexpected' }, { status: 500 });
      }),
    );

    const user = userEvent.setup();
    renderAppAt([ROUTES.LIBRARY]);

    const menu = await openAccountMenu(user, 'Leitor Editorial');
    await user.click(within(menu).getByRole('menuitem', { name: /Alterar senha/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Alterar senha' });

    await user.click(within(dialog).getByRole('button', { name: 'Salvar nova senha' }));
    expect(await within(dialog).findByText('Informe sua senha atual.')).toBeInTheDocument();
    expect(
      within(dialog).getByText('A nova senha deve possuir no mínimo 12 caracteres.'),
    ).toBeInTheDocument();
    expect(passwordSpy).not.toHaveBeenCalled();

    const currentInput = within(dialog).getByLabelText(/^Senha atual/i);
    const newInput = within(dialog).getByLabelText(/^Nova senha/i);

    await user.type(currentInput, 'SenhaAtualSegura123');
    await user.type(newInput, '            ');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar nova senha' }));
    expect(
      await within(dialog).findByText('A senha não pode conter apenas espaços em branco.'),
    ).toBeInTheDocument();

    await user.clear(newInput);
    await user.type(newInput, 'SenhaAtualSegura123');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar nova senha' }));
    expect(
      await within(dialog).findByText('A nova senha deve ser diferente da senha atual.'),
    ).toBeInTheDocument();
    expect(passwordSpy).not.toHaveBeenCalled();
  });

  it('trata 401 sem derrubar sessão, mapeia 422 em new_password e exibe Retry-After em 429', async () => {
    mockAuthenticatedUser(REGULAR_USER, 'csrf-before-pwd');
    const user = userEvent.setup();

    server.use(
      http.post('*/api/auth/password', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:unauthorized',
            title: 'Não autenticado',
            status: 401,
            detail: 'A senha atual está incorreta.',
          },
          { status: 401 },
        );
      }),
    );

    renderAppAt([ROUTES.LIBRARY]);

    const menu = await openAccountMenu(user, 'Leitor Editorial');
    await user.click(within(menu).getByRole('menuitem', { name: /Alterar senha/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Alterar senha' });

    await user.type(within(dialog).getByLabelText(/^Senha atual/i), 'SenhaErrada12345');
    await user.type(within(dialog).getByLabelText(/^Nova senha/i), 'NovaSenhaValida123');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar nova senha' }));

    await waitFor(() => {
      expect(within(dialog).getByLabelText(/^Senha atual/i)).toHaveAttribute('aria-invalid', 'true');
    });
    expect(within(dialog).getAllByText('A senha atual está incorreta.').length).toBeGreaterThanOrEqual(
      1,
    );
    expect(getCsrfToken()).toBe('csrf-before-pwd');

    server.use(
      http.post('*/api/auth/password', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:validation_error',
            title: 'Erro de validação',
            status: 422,
            detail: 'A senha fornecida não atende aos requisitos de segurança.',
            errors: [
              {
                field: 'new_password',
                message: 'A senha escolhida é muito comum.',
                code: 'common_password',
              },
            ],
          },
          { status: 422 },
        );
      }),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Salvar nova senha' }));
    expect(await within(dialog).findByText('A senha escolhida é muito comum.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Nova senha/i)).toHaveAttribute('aria-invalid', 'true');

    server.use(
      http.post('*/api/auth/password', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:rate_limit_exceeded',
            title: 'Limite excedido',
            status: 429,
            detail: 'Muitas tentativas.',
          },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Salvar nova senha' }));
    expect(
      await within(dialog).findByText(
        'Muitas tentativas. Aguarde 60 segundos antes de tentar novamente.',
      ),
    ).toBeInTheDocument();
  });

  it('altera a senha com sucesso, envia X-CSRF-Token, rotaciona CSRF, fecha o modal e exibe toast', async () => {
    mockAuthenticatedUser(REGULAR_USER, 'csrf-old-token');
    let capturedCsrf: string | null = null;
    let capturedBody: unknown = null;

    server.use(
      http.post('*/api/auth/password', async ({ request }) => {
        capturedCsrf = request.headers.get(CSRF_HEADER_NAME);
        capturedBody = await request.json();
        return HttpResponse.json<AuthResponse>({
          user: REGULAR_USER,
          csrf_token: 'csrf-rotated-new',
        });
      }),
    );

    const user = userEvent.setup();
    renderAppAt([ROUTES.LIBRARY]);

    const menu = await openAccountMenu(user, 'Leitor Editorial');
    await user.click(within(menu).getByRole('menuitem', { name: /Alterar senha/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Alterar senha' });

    await user.type(within(dialog).getByLabelText(/^Senha atual/i), 'SenhaAtualSegura123');
    await user.type(within(dialog).getByLabelText(/^Nova senha/i), 'NovaSenhaSuperForte456');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar nova senha' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Alterar senha' })).not.toBeInTheDocument();
    });

    expect(capturedCsrf).toBe('csrf-old-token');
    expect(capturedBody).toEqual({
      current_password: 'SenhaAtualSegura123',
      new_password: 'NovaSenhaSuperForte456',
    });
    expect(getCsrfToken()).toBe('csrf-rotated-new');

    const toastRegion = screen.getByRole('region', { name: /Notificações/i });
    expect(within(toastRegion).getByText('Senha alterada com sucesso.')).toBeInTheDocument();
  });
});

describe('Logout no AppShell', () => {
  it('envia X-CSRF-Token no logout, limpa cache privado, exibe toast e redireciona para a Landing Page (/)', async () => {
    mockAuthenticatedUser(REGULAR_USER, 'csrf-logout-token');
    let capturedLogoutCsrf: string | null = null;

    server.use(
      http.post('*/api/auth/logout', ({ request }) => {
        capturedLogoutCsrf = request.headers.get(CSRF_HEADER_NAME);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    const { queryClient } = renderAppAt([ROUTES.LIBRARY]);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Minha Biblioteca' }),
    ).toBeInTheDocument();
    queryClient.setQueryData(['links', 'list'], [{ id: 'link-privado' }]);

    const menu = await openAccountMenu(user, 'Leitor Editorial');
    await user.click(within(menu).getByRole('menuitem', { name: 'Sair' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'LinkVault' })).toBeInTheDocument();
    });

    expect(capturedLogoutCsrf).toBe('csrf-logout-token');
    expect(getCsrfToken()).toBeNull();
    expect(queryClient.getQueryData(['links', 'list'])).toBeUndefined();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Entrar no LinkVault' }),
    ).not.toBeInTheDocument();

    const toastRegion = screen.getByRole('region', { name: /Notificações/i });
    expect(within(toastRegion).getByText('Sessão encerrada.')).toBeInTheDocument();
  });

  it('encerra sessão localmente e redireciona para a Landing Page mesmo se POST /api/auth/logout falhar', async () => {
    mockAuthenticatedUser(REGULAR_USER, 'csrf-logout-fail');
    server.use(
      http.post('*/api/auth/logout', () => {
        return HttpResponse.json({ detail: 'Erro interno' }, { status: 500 });
      }),
    );

    const user = userEvent.setup();
    renderAppAt([ROUTES.COLLECTIONS]);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Minhas Coleções' }),
    ).toBeInTheDocument();

    const menu = await openAccountMenu(user, 'Leitor Editorial');
    await user.click(within(menu).getByRole('menuitem', { name: 'Sair' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'LinkVault' })).toBeInTheDocument();
    });
    expect(getCsrfToken()).toBeNull();
  });
});