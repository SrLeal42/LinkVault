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