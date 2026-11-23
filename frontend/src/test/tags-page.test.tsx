import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation, type MemoryRouterProps } from 'react-router';
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
      return MswHttpResponse.json({
        user: {
          id: '01933b2e-1111-7000-8000-000000000001',
          email: 'leitor@linkvault.dev',
          name: 'Leitor Editorial',
          is_demo: false,
          expires_at: null,
          created_at: '2026-11-10T10:00:00Z',
        },
        csrf_token: 'csrf-tags-test',
      });
    }),
    mswHttp.get('*/api/tags', () => {
      return MswHttpResponse.json({ items: [] });
    }),
    mswHttp.get('*/api/collections', () => {
      return MswHttpResponse.json({ items: [] });
    }),
    mswHttp.get('*/api/links', () => {
      return MswHttpResponse.json({ items: [], next_cursor: null });
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

import { setCsrfToken } from '@/api/client';
import { ToastProvider } from '@/components/ui/toast';
import { ROUTES } from '@/features/auth/auth-context';
import { AuthProvider } from '@/features/auth/auth-provider';
import { normalizeTagNameInput } from '@/features/tags/tag-form-schema';
import {
  buildLibraryTagFilterPath,
  formatTagLinkCount,
  type TagResponse,
} from '@/features/tags/tags-api';
import { LibraryPage } from '@/pages/library-page';
import { TagsPage } from '@/pages/tags-page';

const SAMPLE_TAGS: TagResponse[] = [
  {
    id: '01933b2e-bbbb-7000-8000-000000000001',
    name: 'fastapi',
    link_count: 3,
    created_at: '2026-11-10T10:00:00Z',
  },
  {
    id: '01933b2e-bbbb-7000-8000-000000000002',
    name: 'postgres',
    link_count: 1,
    created_at: '2026-11-12T10:00:00Z',
  },
  {
    id: '01933b2e-bbbb-7000-8000-000000000003',
    name: 'seguranca',
    link_count: 0,
    created_at: '2026-11-14T10:00:00Z',
  },
];

function LocationEcho() {
  const location = useLocation();
  return <p data-testid="location-full">{`${location.pathname}${location.search}`}</p>;
}

function renderTagsApp(initialEntries: MemoryRouterProps['initialEntries'] = [ROUTES.TAGS]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider defaultDurationMs={60_000}>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider>
            <Routes>
              <Route path={ROUTES.TAGS} element={<TagsPage />} />
              <Route path={ROUTES.LIBRARY} element={<LibraryPage searchDebounceMs={30} />} />
            </Routes>
            <LocationEcho />
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

describe('Utilitários de tags', () => {
  it('normaliza prefixo #, formata link_count e monta rota de filtro na biblioteca', () => {
    expect(normalizeTagNameInput('  #FastAPI  ')).toBe('FastAPI');
    expect(normalizeTagNameInput('###')).toBe('');
    expect(formatTagLinkCount(undefined)).toBe('000 LINKS');
    expect(formatTagLinkCount(1)).toBe('001 LINK');
    expect(formatTagLinkCount(12)).toBe('012 LINKS');
    expect(buildLibraryTagFilterPath('c#')).toBe('/library?tag=c%23');
  });
});

describe('TagsPage (/tags)', () => {
  it('lista tags em catálogo compacto com link_count, data editorial e filtro local', async () => {
    server.use(http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })));

    const user = userEvent.setup();
    renderTagsApp();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Gerenciar Tags' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('#fastapi')).toBeInTheDocument();
    expect(screen.getByText('003 LINKS')).toBeInTheDocument();
    expect(screen.getByText('001 LINK')).toBeInTheDocument();
    expect(screen.getByText('000 LINKS')).toBeInTheDocument();
    expect(screen.getByText('TOTAL DE 03 TAGS')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Filtrar tags' }), 'post');
    expect(screen.getByText('#postgres')).toBeInTheDocument();
    expect(screen.queryByText('#fastapi')).not.toBeInTheDocument();
    expect(screen.getByText('EXIBINDO 01 DE 03 TAGS')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Filtrar tags' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filtrar tags' }), 'inexistente');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Nenhuma tag encontrada.' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByText('#fastapi')).toBeInTheDocument();
  });

  it('recupera de erro 500 e exibe estado vazio quando não há tags', async () => {
    let shouldFail = true;
    server.use(
      http.get('*/api/tags', () => {
        if (shouldFail) {
          return HttpResponse.json(
            {
              type: 'urn:linkvault:error:internal_server_error',
              title: 'Erro interno',
              status: 500,
              detail: 'Falha temporária.',
            },
            { status: 500 },
          );
        }
        return HttpResponse.json({ items: [] });
      }),
    );

    const user = userEvent.setup();
    renderTagsApp();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir a operação no servidor. Tente novamente em instantes.',
    );

    shouldFail = false;
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Você ainda não criou nenhuma tag.',
      }),
    ).toBeInTheDocument();
  });

  it('cria tag inline validando Zod, tratando 409 Conflict no campo e removendo # inicial', async () => {
    let tagsStore: TagResponse[] = [...SAMPLE_TAGS];
    let capturedCreateBody: unknown = null;

    server.use(
      http.get('*/api/tags', () => HttpResponse.json({ items: tagsStore })),
      http.post('*/api/tags', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        capturedCreateBody = body;
        if (tagsStore.some((item) => item.name.toLowerCase() === body.name.toLowerCase())) {
          return HttpResponse.json(
            {
              type: 'urn:linkvault:error:conflict',
              title: 'Conflito de dados',
              status: 409,
              detail: 'Já existe uma tag com este nome.',
            },
            { status: 409 },
          );
        }
        const created: TagResponse = {
          id: '01933b2e-bbbb-7000-8000-000000000099',
          name: body.name,
          link_count: 0,
          created_at: '2026-11-22T12:00:00Z',
        };
        tagsStore = [...tagsStore, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderTagsApp();

    expect(await screen.findByText('#fastapi')).toBeInTheDocument();

    const createInput = screen.getByLabelText(/^Nova tag/i);
    const createButton = screen.getByRole('button', { name: 'Criar tag' });

    // Validação Zod em branco e apenas '#'
    await user.click(createButton);
    expect(await screen.findByText('Informe o nome da tag.')).toBeInTheDocument();

    await user.type(createInput, '###');
    await user.click(createButton);
    expect(await screen.findByText('Informe o nome da tag.')).toBeInTheDocument();

    // 409 Conflict mapeado diretamente no campo
    await user.clear(createInput);
    await user.type(createInput, 'FASTAPI');
    await user.click(createButton);
    expect(await screen.findByText('Já existe uma tag com este nome.')).toBeInTheDocument();
    expect(createInput).toHaveAttribute('aria-invalid', 'true');

    // Criação com sucesso removendo '#'
    await user.clear(createInput);
    await user.type(createInput, '#Docker');
    await user.click(createButton);

    expect(await screen.findByText('#Docker')).toBeInTheDocument();
    expect(capturedCreateBody).toEqual({ name: 'Docker' });
    expect(createInput).toHaveValue('');
  });

  it('renomeia tag via modal tratando 409 Conflict e exclui após ConfirmDialog', async () => {
    let tagsStore: TagResponse[] = [...SAMPLE_TAGS];
    let deletedTagId: string | null = null;

    server.use(
      http.get('*/api/tags', () => HttpResponse.json({ items: tagsStore })),
      http.patch('*/api/tags/:tagId', async ({ params, request }) => {
        const body = (await request.json()) as { name: string };
        const hasConflict = tagsStore.some(
          (item) =>
            item.id !== params.tagId && item.name.toLowerCase() === body.name.toLowerCase(),
        );
        if (hasConflict) {
          return HttpResponse.json(
            {
              type: 'urn:linkvault:error:conflict',
              title: 'Conflito de dados',
              status: 409,
              detail: 'Já existe uma tag com este nome.',
            },
            { status: 409 },
          );
        }
        const existing = tagsStore.find((item) => item.id === params.tagId);
        if (!existing) {
          return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
        }
        const updated: TagResponse = { ...existing, name: body.name };
        tagsStore = tagsStore.map((item) => (item.id === updated.id ? updated : item));
        return HttpResponse.json(updated);
      }),
      http.delete('*/api/tags/:tagId', ({ params }) => {
        deletedTagId = String(params.tagId);
        tagsStore = tagsStore.filter((item) => item.id !== params.tagId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderTagsApp();

    expect(await screen.findByText('#fastapi')).toBeInTheDocument();

    // Renomeação com 409 Conflict e depois sucesso
    await user.click(screen.getByRole('button', { name: 'Renomear tag fastapi' }));
    const renameDialog = await screen.findByRole('dialog', { name: 'Renomear tag' });
    const renameInput = within(renameDialog).getByLabelText(/^Nome da tag/i);
    expect(renameInput).toHaveValue('fastapi');

    await user.clear(renameInput);
    await user.type(renameInput, 'POSTGRES');
    await user.click(within(renameDialog).getByRole('button', { name: 'Salvar nome' }));

    await waitFor(() => {
      expect(renameInput).toHaveAttribute('aria-invalid', 'true');
    });
    expect(
      within(renameDialog).getAllByText('Já existe uma tag com este nome.').length,
    ).toBeGreaterThanOrEqual(1);

    await user.clear(renameInput);
    await user.type(renameInput, 'FastAPI');
    await user.click(within(renameDialog).getByRole('button', { name: 'Salvar nome' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Renomear tag' })).not.toBeInTheDocument();
    });
    expect(await screen.findByText('#FastAPI')).toBeInTheDocument();

    // Exclusão com ConfirmDialog
    await user.click(screen.getByRole('button', { name: 'Excluir tag FastAPI' }));
    const confirmDialog = await screen.findByRole('alertdialog', { name: 'Excluir tag?' });
    expect(
      within(confirmDialog).getByText(/nenhum link será excluído da sua biblioteca/i),
    ).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole('button', { name: 'Excluir tag' }));
    await waitFor(() => {
      expect(screen.queryByText('#FastAPI')).not.toBeInTheDocument();
    });
    expect(deletedTagId).toBe(SAMPLE_TAGS[0]?.id);
  });

  it('navega para /library?tag=<nome> ao clicar no atalho de filtro da tag', async () => {
    server.use(http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })));

    const user = userEvent.setup();
    renderTagsApp();

    const filterShortcut = await screen.findByRole('link', {
      name: 'Ver links com a tag fastapi',
    });
    expect(filterShortcut).toHaveAttribute('href', '/library?tag=fastapi');

    await user.click(filterShortcut);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Minha Biblioteca' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('location-full')).toHaveTextContent('/library?tag=fastapi');
  });
});
