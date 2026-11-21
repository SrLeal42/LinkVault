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
        csrf_token: 'csrf-library-test',
      });
    }),
    mswHttp.get('*/api/collections', () => {
      return MswHttpResponse.json({ items: [] });
    }),
    mswHttp.get('*/api/tags', () => {
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
import {
  buildLibrarySearchParams,
  extractUrlHostname,
  formatEditorialDate,
  parseLibrarySearchParams,
  type CollectionResponse,
  type LinkListResponse,
  type LinkResponse,
  type TagResponse,
} from '@/features/links/links-api';
import { LibraryPage, type LibraryPageProps } from '@/pages/library-page';

const SAMPLE_COLLECTIONS: CollectionResponse[] = [
  {
    id: '01933b2e-aaaa-7000-8000-000000000001',
    name: 'Backend Python',
    description: 'Referências de API e PostgreSQL.',
    visibility: 'private',
    public_slug: null,
    link_count: 2,
    created_at: '2026-11-10T10:00:00Z',
    updated_at: '2026-11-12T10:00:00Z',
  },
  {
    id: '01933b2e-aaaa-7000-8000-000000000002',
    name: 'Segurança Web',
    description: null,
    visibility: 'private',
    public_slug: null,
    link_count: 1,
    created_at: '2026-11-11T10:00:00Z',
    updated_at: '2026-11-11T10:00:00Z',
  },
];

const SAMPLE_TAGS: TagResponse[] = [
  { id: '01933b2e-bbbb-7000-8000-000000000001', name: 'fastapi', created_at: '2026-11-10T10:00:00Z' },
  { id: '01933b2e-bbbb-7000-8000-000000000002', name: 'postgres', created_at: '2026-11-10T10:00:00Z' },
  { id: '01933b2e-bbbb-7000-8000-000000000003', name: 'csrf', created_at: '2026-11-10T10:00:00Z' },
];

const SAMPLE_LINKS: LinkResponse[] = [
  {
    id: '01933b2e-cccc-7000-8000-000000000001',
    collection_id: SAMPLE_COLLECTIONS[0]?.id ?? null,
    url: 'https://www.fastapi.tiangolo.com/tutorial/',
    title: 'Documentação Oficial do FastAPI',
    description: 'Guia completo de dependências, Pydantic v2 e OpenAPI.',
    notes: 'Revisar seção de dependências com yield.',
    tags: [
      { id: '01933b2e-bbbb-7000-8000-000000000001', name: 'fastapi', created_at: '2026-11-10T10:00:00Z' },
    ],
    created_at: '2026-11-14T10:00:00Z',
    updated_at: '2026-11-18T15:30:00Z',
  },
  {
    id: '01933b2e-cccc-7000-8000-000000000002',
    collection_id: SAMPLE_COLLECTIONS[1]?.id ?? null,
    url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html',
    title: 'OWASP CSRF Prevention Cheat Sheet',
    description: 'Defesa em camadas contra CSRF em aplicações web.',
    notes: null,
    tags: [
      { id: '01933b2e-bbbb-7000-8000-000000000003', name: 'csrf', created_at: '2026-11-10T10:00:00Z' },
    ],
    created_at: '2026-11-12T08:00:00Z',
    updated_at: '2026-11-12T08:00:00Z',
  },
];

const SECOND_PAGE_LINK: LinkResponse = {
  id: '01933b2e-cccc-7000-8000-000000000003',
  collection_id: SAMPLE_COLLECTIONS[0]?.id ?? null,
  url: 'https://www.postgresql.org/docs/current/pgtrgm.html',
  title: 'PostgreSQL pg_trgm Extension',
  description: 'Índices GIN para pesquisa parcial por trigramas.',
  notes: null,
  tags: [
    { id: '01933b2e-bbbb-7000-8000-000000000002', name: 'postgres', created_at: '2026-11-10T10:00:00Z' },
  ],
  created_at: '2026-11-10T09:00:00Z',
  updated_at: '2026-11-10T09:00:00Z',
};

function LocationSearchEcho() {
  const location = useLocation();
  return <p data-testid="location-search">{location.search}</p>;
}

function renderLibrary(
  initialEntries: MemoryRouterProps['initialEntries'] = [ROUTES.LIBRARY],
  props: LibraryPageProps = {},
) {
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
              <Route
                path={ROUTES.LIBRARY}
                element={
                  <>
                    <LibraryPage searchDebounceMs={30} {...props} />
                    <LocationSearchEcho />
                  </>
                }
              />
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

describe('Utilitários de links e query string', () => {
  it('extrai domínio sem www, formata datas editoriais e serializa filtros limpos na URL', () => {
    expect(extractUrlHostname('https://www.fastapi.tiangolo.com/docs')).toBe('fastapi.tiangolo.com');
    expect(extractUrlHostname('url-invalida')).toBe('url-invalida');
    expect(formatEditorialDate('2026-11-14T10:00:00Z')).toBe('14 NOV 2026');
    expect(formatEditorialDate(null)).toBe('');

    const parsed = parseLibrarySearchParams(
      new URLSearchParams('q=docker&tag=backend&sort=invalida'),
    );
    expect(parsed).toEqual({
      q: 'docker',
      collectionId: '',
      tag: 'backend',
      sort: 'created_desc',
    });

    const built = buildLibrarySearchParams(new URLSearchParams('q=old&sort=title_asc'), {
      q: '  fastapi  ',
      sort: 'created_desc',
    });
    expect(built.toString()).toBe('q=fastapi');
  });
});

describe('LibraryPage e LinkCard', () => {
  it('renderiza LinkCard com hierarquia editorial, abertura externa segura, nota privada e ações separadas', async () => {
    server.use(
      http.get('*/api/collections', () => HttpResponse.json({ items: SAMPLE_COLLECTIONS })),
      http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })),
      http.get('*/api/links', () =>
        HttpResponse.json<LinkListResponse>({ items: SAMPLE_LINKS, next_cursor: null }),
      ),
    );

    const onEditLink = vi.fn();
    const onDeleteLink = vi.fn();
    const user = userEvent.setup();

    renderLibrary([ROUTES.LIBRARY], { onEditLink, onDeleteLink });

    const externalLink = await screen.findByRole('link', {
      name: 'Documentação Oficial do FastAPI',
    });
    expect(externalLink).toHaveAttribute('href', 'https://www.fastapi.tiangolo.com/tutorial/');
    expect(externalLink).toHaveAttribute('target', '_blank');
    expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');

    expect(screen.getByText('fastapi.tiangolo.com')).toBeInTheDocument();
    expect(screen.getByText('14 NOV 2026')).toBeInTheDocument();
    expect(screen.getByText('Nota privada')).toBeInTheDocument();
    expect(screen.getByText('Revisar seção de dependências com yield.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Backend Python' })).toBeInTheDocument();

    const editButton = screen.getByRole('button', {
      name: 'Editar Documentação Oficial do FastAPI',
    });
    const deleteButton = screen.getByRole('button', {
      name: 'Excluir Documentação Oficial do FastAPI',
    });
    expect(externalLink.contains(editButton)).toBe(false);
    expect(externalLink.contains(deleteButton)).toBe(false);

    await user.click(editButton);
    await user.click(deleteButton);
    expect(onEditLink).toHaveBeenCalledWith(SAMPLE_LINKS[0]);
    expect(onDeleteLink).toHaveBeenCalledWith(SAMPLE_LINKS[0]);
  });

  it('sincroniza pesquisa, filtros por coleção/tag e ordenação com a URL e a API', async () => {
    const capturedQueries: string[] = [];

    server.use(
      http.get('*/api/collections', () => HttpResponse.json({ items: SAMPLE_COLLECTIONS })),
      http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })),
      http.get('*/api/links', ({ request }) => {
        const url = new URL(request.url);
        capturedQueries.push(url.searchParams.toString());
        return HttpResponse.json<LinkListResponse>({ items: SAMPLE_LINKS, next_cursor: null });
      }),
    );

    const user = userEvent.setup();
    renderLibrary([ROUTES.LIBRARY]);

    expect(
      await screen.findByRole('link', { name: 'Documentação Oficial do FastAPI' }),
    ).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar links' }), 'fastapi');
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('?q=fastapi');
    });

    await user.click(await screen.findByRole('button', { name: '#fastapi' }));
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('?q=fastapi&tag=fastapi');
    });
    expect(await screen.findByRole('button', { name: '#fastapi' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'updated_desc');
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        '?q=fastapi&tag=fastapi&sort=updated_desc',
      );
    });
    expect(await screen.findByText('ATUALIZADO 18 NOV 2026')).toBeInTheDocument();
    expect(
      capturedQueries.some(
        (query) =>
          query.includes('q=fastapi') &&
          query.includes('tag=fastapi') &&
          query.includes('sort=updated_desc'),
      ),
    ).toBe(true);
  });

  it('carrega próxima página acumulativamente via cursor e oculta botão ao fim da lista', async () => {
    const capturedCursors: (string | null)[] = [];

    server.use(
      http.get('*/api/collections', () => HttpResponse.json({ items: SAMPLE_COLLECTIONS })),
      http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })),
      http.get('*/api/links', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        capturedCursors.push(cursor);
        if (!cursor) {
          return HttpResponse.json<LinkListResponse>({
            items: SAMPLE_LINKS,
            next_cursor: 'cursor-page-2',
          });
        }
        return HttpResponse.json<LinkListResponse>({
          items: [SECOND_PAGE_LINK],
          next_cursor: null,
        });
      }),
    );

    const user = userEvent.setup();
    renderLibrary([ROUTES.LIBRARY]);

    expect(
      await screen.findByRole('link', { name: 'Documentação Oficial do FastAPI' }),
    ).toBeInTheDocument();

    const loadMoreButton = screen.getByRole('button', { name: 'Carregar mais referências' });
    await user.click(loadMoreButton);

    expect(
      await screen.findByRole('link', { name: 'PostgreSQL pg_trgm Extension' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Documentação Oficial do FastAPI' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Carregar mais referências' }),
    ).not.toBeInTheDocument();
    expect(capturedCursors).toEqual([null, 'cursor-page-2']);
  });

  it('diferencia biblioteca vazia de pesquisa sem resultados e recupera de erro 500', async () => {
    let shouldFail = true;
    server.use(
      http.get('*/api/links', ({ request }) => {
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
        const q = new URL(request.url).searchParams.get('q');
        if (q) {
          return HttpResponse.json<LinkListResponse>({ items: [], next_cursor: null });
        }
        return HttpResponse.json<LinkListResponse>({ items: [], next_cursor: null });
      }),
    );

    const user = userEvent.setup();
    renderLibrary([ROUTES.LIBRARY]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir a operação no servidor. Tente novamente em instantes.',
    );

    shouldFail = false;
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sua biblioteca ainda está vazia.' }),
    ).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar links' }), 'inexistente');
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Nenhum link corresponde à pesquisa.',
      }),
    ).toBeInTheDocument();

    const emptySection = screen
      .getByRole('heading', { level: 2, name: 'Nenhum link corresponde à pesquisa.' })
      .closest('section');
    if (!emptySection) {
      throw new Error('Seção de estado vazio não encontrada.');
    }
    await user.click(within(emptySection).getByRole('button', { name: 'Limpar filtros' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sua biblioteca ainda está vazia.' }),
    ).toBeInTheDocument();
  });
});

describe('CRUD de links (LinkFormDialog e ConfirmDialog)', () => {
  it('valida URL http/https, espaços e título obrigatório no cliente e mapeia erro 422 do servidor', async () => {
    const createSpy = vi.fn();
    server.use(
      http.get('*/api/collections', () => HttpResponse.json({ items: SAMPLE_COLLECTIONS })),
      http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })),
      http.get('*/api/links', () =>
        HttpResponse.json<LinkListResponse>({ items: [], next_cursor: null }),
      ),
      http.post('*/api/links', () => {
        createSpy();
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:validation_error',
            title: 'Erro de validação',
            status: 422,
            detail: 'Um ou mais campos enviados são inválidos.',
            errors: [
              { field: 'url', message: 'Domínio bloqueado pelo servidor.', code: 'value_error' },
            ],
          },
          { status: 422 },
        );
      }),
    );

    const user = userEvent.setup();
    renderLibrary([ROUTES.LIBRARY]);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sua biblioteca ainda está vazia.' }),
    ).toBeInTheDocument();

    const addButtons = screen.getAllByRole('button', { name: 'Adicionar link' });
    const topAddButton = addButtons[0];
    if (!topAddButton) {
      throw new Error('Botão Adicionar link não encontrado.');
    }
    await user.click(topAddButton);

    const dialog = await screen.findByRole('dialog', { name: 'Adicionar link' });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar link' }));

    expect(await within(dialog).findByText('Informe a URL de destino.')).toBeInTheDocument();
    expect(within(dialog).getByText('Informe o título do link.')).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    const urlInput = within(dialog).getByLabelText(/^URL/i);
    const titleInput = within(dialog).getByLabelText(/^Título/i);

    await user.type(urlInput, 'javascript:alert(1)');
    await user.type(titleInput, 'XSS Test');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar link' }));

    expect(
      await within(dialog).findByText('A URL deve ser válida e utilizar http:// ou https://.'),
    ).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    await user.clear(urlInput);
    await user.type(urlInput, 'https://exemplo.dev/artigo');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar link' }));

    expect(
      await within(dialog).findByText('Domínio bloqueado pelo servidor.'),
    ).toBeInTheDocument();
    expect(urlInput).toHaveAttribute('aria-invalid', 'true');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('cria link com criação rápida de tags (Enter, sugestão e rascunho pendente), atualiza lista e exibe toast', async () => {
    let linksStore: LinkResponse[] = [...SAMPLE_LINKS];
    let capturedCreateBody: unknown = null;

    server.use(
      http.get('*/api/collections', () => HttpResponse.json({ items: SAMPLE_COLLECTIONS })),
      http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })),
      http.get('*/api/links', () =>
        HttpResponse.json<LinkListResponse>({ items: linksStore, next_cursor: null }),
      ),
      http.post('*/api/links', async ({ request }) => {
        capturedCreateBody = await request.json();
        const created: LinkResponse = {
          id: '01933b2e-dddd-7000-8000-000000000009',
          collection_id: SAMPLE_COLLECTIONS[0]?.id ?? null,
          url: 'https://tanstack.com/query/latest',
          title: 'TanStack Query Docs',
          description: 'Gerenciamento de estado assíncrono em React.',
          notes: 'Estudar useInfiniteQuery.',
          tags: [
            { id: 't-react', name: 'react', created_at: '2026-11-21T10:00:00Z' },
            { id: '01933b2e-bbbb-7000-8000-000000000001', name: 'fastapi', created_at: '2026-11-10T10:00:00Z' },
            { id: 't-cache', name: 'cache', created_at: '2026-11-21T10:00:00Z' },
          ],
          created_at: '2026-11-21T10:00:00Z',
          updated_at: '2026-11-21T10:00:00Z',
        };
        linksStore = [created, ...linksStore];
        return HttpResponse.json<LinkResponse>(created, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderLibrary([ROUTES.LIBRARY]);

    expect(
      await screen.findByRole('link', { name: 'Documentação Oficial do FastAPI' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Adicionar link' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar link' });

    await user.type(within(dialog).getByLabelText(/^URL/i), 'https://tanstack.com/query/latest');
    await user.type(within(dialog).getByLabelText(/^Título/i), 'TanStack Query Docs');
    await user.type(
      within(dialog).getByLabelText(/^Descrição/i),
      'Gerenciamento de estado assíncrono em React.',
    );
    await user.type(within(dialog).getByLabelText(/^Notas pessoais/i), 'Estudar useInfiniteQuery.');
    await user.selectOptions(
      within(dialog).getByLabelText(/^Coleção/i),
      SAMPLE_COLLECTIONS[0]?.id ?? '',
    );

    // 1. Cria tag rápida com Enter (e ignora duplicata case-insensitive)
    const tagsInput = within(dialog).getByLabelText(/^Tags/i);
    await user.type(tagsInput, 'react{Enter}');
    await user.type(tagsInput, '#REACT{Enter}');
    expect(within(dialog).getByRole('button', { name: 'Remover tag react' })).toBeInTheDocument();

    // 2. Seleciona tag existente com 1 clique
    await user.click(within(dialog).getByRole('button', { name: 'Associar tag fastapi' }));

    // 3. Deixa uma tag pendente no input e submete diretamente
    await user.type(tagsInput, 'cache');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar link' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Adicionar link' })).not.toBeInTheDocument();
    });

    expect(capturedCreateBody).toEqual({
      url: 'https://tanstack.com/query/latest',
      title: 'TanStack Query Docs',
      description: 'Gerenciamento de estado assíncrono em React.',
      notes: 'Estudar useInfiniteQuery.',
      collection_id: SAMPLE_COLLECTIONS[0]?.id ?? null,
      tags: ['react', 'fastapi', 'cache'],
    });

    expect(await screen.findByRole('link', { name: 'TanStack Query Docs' })).toBeInTheDocument();
    const toastRegion = screen.getByRole('region', { name: /Notificações/i });
    expect(within(toastRegion).getByText('Link criado com sucesso.')).toBeInTheDocument();
  });

  it('edita link existente (PATCH) removendo e adicionando tags e exclui link após ConfirmDialog (DELETE)', async () => {
    let linksStore: LinkResponse[] = [...SAMPLE_LINKS];
    let capturedPatchBody: unknown = null;
    let deletedLinkId: string | null = null;

    server.use(
      http.get('*/api/collections', () => HttpResponse.json({ items: SAMPLE_COLLECTIONS })),
      http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })),
      http.get('*/api/links', () =>
        HttpResponse.json<LinkListResponse>({ items: linksStore, next_cursor: null }),
      ),
      http.patch('*/api/links/:linkId', async ({ params, request }) => {
        capturedPatchBody = await request.json();
        const existing = linksStore.find((item) => item.id === params.linkId);
        if (!existing) {
          return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
        }
        const updated: LinkResponse = {
          ...existing,
          title: 'FastAPI Guia Atualizado',
          tags: [{ id: 't-api', name: 'api', created_at: '2026-11-21T12:00:00Z' }],
          updated_at: '2026-11-21T12:00:00Z',
        };
        linksStore = linksStore.map((item) => (item.id === updated.id ? updated : item));
        return HttpResponse.json<LinkResponse>(updated);
      }),
      http.delete('*/api/links/:linkId', ({ params }) => {
        deletedLinkId = String(params.linkId);
        linksStore = linksStore.filter((item) => item.id !== params.linkId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderLibrary([ROUTES.LIBRARY]);

    expect(
      await screen.findByRole('link', { name: 'Documentação Oficial do FastAPI' }),
    ).toBeInTheDocument();

    // Edição
    await user.click(
      screen.getByRole('button', { name: 'Editar Documentação Oficial do FastAPI' }),
    );
    const editDialog = await screen.findByRole('dialog', { name: 'Editar link' });

    const titleInput = within(editDialog).getByLabelText(/^Título/i);
    expect(titleInput).toHaveValue('Documentação Oficial do FastAPI');

    await user.clear(titleInput);
    await user.type(titleInput, 'FastAPI Guia Atualizado');
    await user.click(within(editDialog).getByRole('button', { name: 'Remover tag fastapi' }));
    await user.type(within(editDialog).getByLabelText(/^Tags/i), 'api');
    await user.click(within(editDialog).getByRole('button', { name: 'Adicionar' }));
    await user.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Editar link' })).not.toBeInTheDocument();
    });

    expect(capturedPatchBody).toMatchObject({
      title: 'FastAPI Guia Atualizado',
      tags: ['api'],
    });
    expect(
      await screen.findByRole('link', { name: 'FastAPI Guia Atualizado' }),
    ).toBeInTheDocument();

    // Exclusão com ConfirmDialog
    await user.click(screen.getByRole('button', { name: 'Excluir FastAPI Guia Atualizado' }));
    const confirmDialog = await screen.findByRole('alertdialog', { name: 'Excluir link?' });
    expect(within(confirmDialog).getByText(/FastAPI Guia Atualizado/)).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole('button', { name: 'Excluir link' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog', { name: 'Excluir link?' })).not.toBeInTheDocument();
    });

    expect(deletedLinkId).toBe(SAMPLE_LINKS[0]?.id);
    await waitFor(() => {
      expect(
        screen.queryByRole('link', { name: 'FastAPI Guia Atualizado' }),
      ).not.toBeInTheDocument();
    });

    const toastRegion = screen.getByRole('region', { name: /Notificações/i });
    expect(within(toastRegion).getByText('Link excluído.')).toBeInTheDocument();
  });
});