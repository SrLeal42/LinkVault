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
        csrf_token: 'csrf-collections-test',
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
  buildCollectionDetailPath,
  formatCollectionLinkCount,
  type CollectionResponse,
} from '@/features/collections/collections-api';
import type { LinkListResponse, LinkResponse, TagResponse } from '@/features/links/links-api';
import { CollectionDetailPage } from '@/pages/collection-detail-page';
import { CollectionsPage } from '@/pages/collections-page';
import { LibraryPage } from '@/pages/library-page';

const COLLECTION_BACKEND: CollectionResponse = {
  id: '01933b2e-aaaa-7000-8000-000000000001',
  name: 'Backend Python',
  description: 'Referências de FastAPI, SQLAlchemy e PostgreSQL.',
  visibility: 'private',
  public_slug: null,
  link_count: 2,
  created_at: '2026-11-10T10:00:00Z',
  updated_at: '2026-11-14T12:00:00Z',
};

const COLLECTION_SECURITY: CollectionResponse = {
  id: '01933b2e-aaaa-7000-8000-000000000002',
  name: 'Segurança Web',
  description: null,
  visibility: 'public',
  public_slug: 'Xk3m9Qp2LwZr7A',
  link_count: 1,
  created_at: '2026-11-11T10:00:00Z',
  updated_at: '2026-11-15T10:00:00Z',
};

const SAMPLE_TAGS: TagResponse[] = [
  { id: '01933b2e-bbbb-7000-8000-000000000001', name: 'fastapi', created_at: '2026-11-10T10:00:00Z' },
  { id: '01933b2e-bbbb-7000-8000-000000000002', name: 'postgres', created_at: '2026-11-10T10:00:00Z' },
];

const SAMPLE_LINKS: LinkResponse[] = [
  {
    id: '01933b2e-cccc-7000-8000-000000000001',
    collection_id: COLLECTION_BACKEND.id,
    url: 'https://fastapi.tiangolo.com/',
    title: 'Documentação Oficial do FastAPI',
    description: 'Guia completo de APIs REST com Python.',
    notes: 'Checar dependências.',
    tags: [
      { id: '01933b2e-bbbb-7000-8000-000000000001', name: 'fastapi', created_at: '2026-11-10T10:00:00Z' },
    ],
    created_at: '2026-11-14T10:00:00Z',
    updated_at: '2026-11-14T10:00:00Z',
  },
];

const SECOND_PAGE_LINK: LinkResponse = {
  id: '01933b2e-cccc-7000-8000-000000000002',
  collection_id: COLLECTION_BACKEND.id,
  url: 'https://www.postgresql.org/docs/current/pgtrgm.html',
  title: 'PostgreSQL pg_trgm',
  description: 'Índices GIN para pesquisa parcial.',
  notes: null,
  tags: [
    { id: '01933b2e-bbbb-7000-8000-000000000002', name: 'postgres', created_at: '2026-11-10T10:00:00Z' },
  ],
  created_at: '2026-11-12T10:00:00Z',
  updated_at: '2026-11-12T10:00:00Z',
};

function LocationEcho() {
  const location = useLocation();
  return <p data-testid="location-full">{`${location.pathname}${location.search}`}</p>;
}

function renderCollectionsApp(initialEntries: MemoryRouterProps['initialEntries']) {
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
              <Route path={ROUTES.LIBRARY} element={<LibraryPage searchDebounceMs={30} />} />
              <Route path={ROUTES.COLLECTIONS} element={<CollectionsPage />} />
              <Route
                path={ROUTES.COLLECTION_DETAIL}
                element={<CollectionDetailPage searchDebounceMs={30} />}
              />
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

describe('Utilitários de coleções', () => {
  it('formata contagem de links com zero-padding editorial e monta rota de detalhe', () => {
    expect(formatCollectionLinkCount(0)).toBe('000 LINKS');
    expect(formatCollectionLinkCount(1)).toBe('001 LINK');
    expect(formatCollectionLinkCount(24)).toBe('024 LINKS');
    expect(buildCollectionDetailPath('abc-123')).toBe('/collections/abc-123');
  });
});

describe('CollectionsPage (/collections)', () => {
  it('lista coleções com link_count, badge Privada/Pública e affordance explícita de abertura', async () => {
    server.use(
      http.get('*/api/collections', () =>
        HttpResponse.json({ items: [COLLECTION_BACKEND, COLLECTION_SECURITY] }),
      ),
    );

    renderCollectionsApp([ROUTES.COLLECTIONS]);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Minhas Coleções' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('002 LINKS')).toBeInTheDocument();
    expect(screen.getByText('001 LINK')).toBeInTheDocument();
    expect(screen.getByText('Privada')).toBeInTheDocument();
    expect(screen.getByText('Pública')).toBeInTheDocument();
    expect(screen.getByText('TOTAL DE 02 COLEÇÕES')).toBeInTheDocument();

    const openLink = screen.getByRole('link', { name: 'Abrir coleção Backend Python' });
    expect(openLink).toHaveAttribute('href', `/collections/${COLLECTION_BACKEND.id}`);
    expect(
      openLink.contains(screen.getByRole('button', { name: 'Editar coleção Backend Python' })),
    ).toBe(false);
  });

  it('recupera de erro 500 e exibe estado vazio quando não há coleções', async () => {
    let shouldFail = true;
    server.use(
      http.get('*/api/collections', () => {
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
    renderCollectionsApp([ROUTES.COLLECTIONS]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir a operação no servidor. Tente novamente em instantes.',
    );

    shouldFail = false;
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Você ainda não criou nenhuma coleção.',
      }),
    ).toBeInTheDocument();
  });

  it('executa CRUD completo (validação Zod, 422, POST, PATCH limpando descrição e DELETE com ConfirmDialog)', async () => {
    let collectionsStore: CollectionResponse[] = [COLLECTION_BACKEND];
    let shouldReturn422 = true;
    let capturedPatchBody: unknown = null;
    let deletedId: string | null = null;

    server.use(
      http.get('*/api/collections', () => HttpResponse.json({ items: collectionsStore })),
      http.post('*/api/collections', async ({ request }) => {
        if (shouldReturn422) {
          return HttpResponse.json(
            {
              type: 'urn:linkvault:error:validation_error',
              title: 'Erro de validação',
              status: 422,
              detail: 'Campos inválidos.',
              errors: [{ field: 'name', message: 'Nome rejeitado pelo servidor.', code: 'value_error' }],
            },
            { status: 422 },
          );
        }
        const body = (await request.json()) as { name: string; description: string | null };
        const created: CollectionResponse = {
          id: '01933b2e-aaaa-7000-8000-000000000099',
          name: body.name,
          description: body.description,
          visibility: 'private',
          public_slug: null,
          link_count: 0,
          created_at: '2026-11-22T10:00:00Z',
          updated_at: '2026-11-22T10:00:00Z',
        };
        collectionsStore = [...collectionsStore, created];
        return HttpResponse.json(created, { status: 201 });
      }),
      http.patch('*/api/collections/:collectionId', async ({ params, request }) => {
        capturedPatchBody = await request.json();
        const existing = collectionsStore.find((item) => item.id === params.collectionId);
        if (!existing) {
          return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
        }
        const body = capturedPatchBody as { name: string; description: string | null };
        const updated: CollectionResponse = {
          ...existing,
          name: body.name,
          description: body.description,
          updated_at: '2026-11-22T11:00:00Z',
        };
        collectionsStore = collectionsStore.map((item) => (item.id === updated.id ? updated : item));
        return HttpResponse.json(updated);
      }),
      http.delete('*/api/collections/:collectionId', ({ params }) => {
        deletedId = String(params.collectionId);
        collectionsStore = collectionsStore.filter((item) => item.id !== params.collectionId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderCollectionsApp([ROUTES.COLLECTIONS]);

    expect(await screen.findByText('Backend Python')).toBeInTheDocument();

    // Criação com validação Zod + 422 + sucesso
    await user.click(screen.getByRole('button', { name: 'Nova coleção' }));
    const createDialog = await screen.findByRole('dialog', { name: 'Nova coleção' });
    await user.click(within(createDialog).getByRole('button', { name: 'Criar coleção' }));
    expect(await within(createDialog).findByText('Informe o nome da coleção.')).toBeInTheDocument();

    await user.type(within(createDialog).getByLabelText(/^Nome/i), 'Frontend React');
    await user.type(within(createDialog).getByLabelText(/^Descrição/i), 'Guias de UI.');
    await user.click(within(createDialog).getByRole('button', { name: 'Criar coleção' }));
    expect(
      await within(createDialog).findByText('Nome rejeitado pelo servidor.'),
    ).toBeInTheDocument();

    shouldReturn422 = false;
    await user.click(within(createDialog).getByRole('button', { name: 'Criar coleção' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Nova coleção' })).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Frontend React')).toBeInTheDocument();

    // Edição limpando descrição
    await user.click(screen.getByRole('button', { name: 'Editar coleção Frontend React' }));
    const editDialog = await screen.findByRole('dialog', { name: 'Editar coleção' });
    const nameInput = within(editDialog).getByLabelText(/^Nome/i);
    const descInput = within(editDialog).getByLabelText(/^Descrição/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Frontend Editorial');
    await user.clear(descInput);
    await user.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Editar coleção' })).not.toBeInTheDocument();
    });
    expect(capturedPatchBody).toEqual({ name: 'Frontend Editorial', description: null });
    expect(await screen.findByText('Frontend Editorial')).toBeInTheDocument();

    // Exclusão com ConfirmDialog explicando preservação dos links
    await user.click(screen.getByRole('button', { name: 'Excluir coleção Frontend Editorial' }));
    const confirmDialog = await screen.findByRole('alertdialog', { name: 'Excluir coleção?' });
    expect(
      within(confirmDialog).getByText(/Os links associados não serão apagados/i),
    ).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole('button', { name: 'Excluir coleção' }));
    await waitFor(() => {
      expect(screen.queryByText('Frontend Editorial')).not.toBeInTheDocument();
    });
    expect(deletedId).toBe('01933b2e-aaaa-7000-8000-000000000099');
  });
});

describe('Navegação contextual e CollectionDetailPage (/collections/:collectionId)', () => {
  it('navega do badge da coleção no LinkCard da LibraryPage para /collections/:collectionId', async () => {
    server.use(
      http.get('*/api/collections', () => HttpResponse.json({ items: [COLLECTION_BACKEND] })),
      http.get('*/api/collections/:collectionId', () => HttpResponse.json(COLLECTION_BACKEND)),
      http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })),
      http.get('*/api/links', () =>
        HttpResponse.json<LinkListResponse>({ items: SAMPLE_LINKS, next_cursor: null }),
      ),
    );

    const user = userEvent.setup();
    renderCollectionsApp([ROUTES.LIBRARY]);

    const collectionBadge = await screen.findByRole('button', { name: 'Backend Python' });
    await user.click(collectionBadge);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Backend Python' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('location-full')).toHaveTextContent(
      `/collections/${COLLECTION_BACKEND.id}`,
    );
  });

  it('filtra links contextualmente por collection_id, pagina por cursor, pré-seleciona coleção no LinkFormDialog e redireciona ao excluir a coleção', async () => {
    let currentCollection: CollectionResponse = { ...COLLECTION_BACKEND };
    let linksStore: LinkResponse[] = [...SAMPLE_LINKS];
    const capturedLinkQueries: string[] = [];

    server.use(
      http.get('*/api/collections', () => HttpResponse.json({ items: [currentCollection] })),
      http.get('*/api/collections/:collectionId', () => HttpResponse.json(currentCollection)),
      http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })),
      http.get('*/api/links', ({ request }) => {
        const url = new URL(request.url);
        capturedLinkQueries.push(url.searchParams.toString());
        const cursor = url.searchParams.get('cursor');
        if (!cursor) {
          return HttpResponse.json<LinkListResponse>({
            items: linksStore,
            next_cursor: 'next-col-cursor',
          });
        }
        return HttpResponse.json<LinkListResponse>({
          items: [SECOND_PAGE_LINK],
          next_cursor: null,
        });
      }),
      http.post('*/api/links', async ({ request }) => {
        const body = (await request.json()) as {
          url: string;
          title: string;
          collection_id: string | null;
        };
        const created: LinkResponse = {
          id: '01933b2e-cccc-7000-8000-000000000099',
          collection_id: body.collection_id,
          url: body.url,
          title: body.title,
          description: null,
          notes: null,
          tags: [],
          created_at: '2026-11-22T10:00:00Z',
          updated_at: '2026-11-22T10:00:00Z',
        };
        linksStore = [created, ...linksStore];
        currentCollection = { ...currentCollection, link_count: currentCollection.link_count + 1 };
        return HttpResponse.json(created, { status: 201 });
      }),
      http.delete('*/api/collections/:collectionId', () => {
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderCollectionsApp([`/collections/${COLLECTION_BACKEND.id}`]);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Backend Python' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Documentação Oficial do FastAPI' }),
    ).toBeInTheDocument();
    expect(
      capturedLinkQueries.some((q) => q.includes(`collection_id=${COLLECTION_BACKEND.id}`)),
    ).toBe(true);

    // Paginação por cursor
    await user.click(screen.getByRole('button', { name: 'Carregar mais referências' }));
    expect(await screen.findByRole('link', { name: 'PostgreSQL pg_trgm' })).toBeInTheDocument();

    // LinkFormDialog pré-selecionado na coleção atual
    await user.click(screen.getByRole('button', { name: 'Adicionar link' }));
    const linkDialog = await screen.findByRole('dialog', { name: 'Adicionar link' });
    expect(within(linkDialog).getByLabelText(/^Coleção/i)).toHaveValue(COLLECTION_BACKEND.id);

    await user.type(within(linkDialog).getByLabelText(/^URL/i), 'https://docs.pydantic.dev/');
    await user.type(within(linkDialog).getByLabelText(/^Título/i), 'Pydantic v2 Docs');
    await user.click(within(linkDialog).getByRole('button', { name: 'Salvar link' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Adicionar link' })).not.toBeInTheDocument();
    });
    expect(await screen.findByText('003 LINKS')).toBeInTheDocument();

    // Excluir coleção no cabeçalho e redirecionar para /collections
    await user.click(screen.getByRole('button', { name: 'Excluir coleção' }));
    const confirmDialog = await screen.findByRole('alertdialog', { name: 'Excluir coleção?' });
    await user.click(within(confirmDialog).getByRole('button', { name: 'Excluir coleção' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Minhas Coleções' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('location-full')).toHaveTextContent(ROUTES.COLLECTIONS);
  });

  it('exibe estado Coleção não encontrada em 404 sem disparar GET /api/links', async () => {
    const linksSpy = vi.fn();
    server.use(
      http.get('*/api/collections/:collectionId', () => {
        return HttpResponse.json(
          {
            type: 'urn:linkvault:error:not_found',
            title: 'Recurso não encontrado',
            status: 404,
            detail: 'Coleção não encontrada.',
          },
          { status: 404 },
        );
      }),
      http.get('*/api/links', () => {
        linksSpy();
        return HttpResponse.json({ items: [], next_cursor: null });
      }),
    );

    renderCollectionsApp(['/collections/01933b2e-9999-7000-8000-000000000404']);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Coleção não encontrada.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para coleções' })).toHaveAttribute(
      'href',
      ROUTES.COLLECTIONS,
    );
    expect(linksSpy).not.toHaveBeenCalled();
  });

  it('permite atribuir e remover coleção rapidamente pelo menu do LinkCard na LibraryPage', async () => {
    let linkItem: LinkResponse = {
      id: '01933b2e-cccc-7000-8000-000000000077',
      collection_id: null,
      url: 'https://vitest.dev/',
      title: 'Vitest Documentation',
      description: 'Framework de testes rápido para Vite.',
      notes: null,
      tags: [],
      created_at: '2026-11-20T10:00:00Z',
      updated_at: '2026-11-20T10:00:00Z',
    };
    const capturedPatches: unknown[] = [];

    server.use(
      http.get('*/api/collections', () =>
        HttpResponse.json({ items: [COLLECTION_BACKEND, COLLECTION_SECURITY] }),
      ),
      http.get('*/api/tags', () => HttpResponse.json({ items: [] })),
      http.get('*/api/links', () =>
        HttpResponse.json<LinkListResponse>({ items: [linkItem], next_cursor: null }),
      ),
      http.patch('*/api/links/:linkId', async ({ request }) => {
        const body = (await request.json()) as { collection_id: string | null };
        capturedPatches.push(body);
        linkItem = { ...linkItem, collection_id: body.collection_id };
        return HttpResponse.json(linkItem);
      }),
    );

    const user = userEvent.setup();
    renderCollectionsApp([ROUTES.LIBRARY]);

    const assignTrigger = await screen.findByRole('button', {
      name: 'Alterar coleção de Vitest Documentation',
    });
    await user.click(assignTrigger);

    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: 'Backend Python' }));

    expect(await screen.findByRole('button', { name: 'Backend Python' })).toBeInTheDocument();
    expect(capturedPatches[0]).toEqual({ collection_id: COLLECTION_BACKEND.id });

    // Remove da coleção pelo menu rápido
    await user.click(
      screen.getByRole('button', { name: 'Alterar coleção de Vitest Documentation' }),
    );
    const secondMenu = await screen.findByRole('menu');
    await user.click(within(secondMenu).getByRole('menuitem', { name: 'Sem coleção' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Backend Python' })).not.toBeInTheDocument();
    });
    expect(capturedPatches[1]).toEqual({ collection_id: null });
  });

  it('permite criar coleção já com links existentes e associar/desmarcar links via botão em /collections/:collectionId', async () => {
    const looseLink: LinkResponse = {
      id: '01933b2e-cccc-7000-8000-000000000088',
      collection_id: null,
      url: 'https://react.dev/',
      title: 'React Docs',
      description: 'Documentação oficial do React.',
      notes: null,
      tags: [],
      created_at: '2026-11-20T10:00:00Z',
      updated_at: '2026-11-20T10:00:00Z',
    };
    const existingCollectionLink = SAMPLE_LINKS[0];
    if (!existingCollectionLink) {
      throw new Error('Link de exemplo ausente.');
    }

    let capturedCreateBody: unknown = null;
    let capturedPatchBody: unknown = null;

    server.use(
      http.get('*/api/collections', () => HttpResponse.json({ items: [COLLECTION_BACKEND] })),
      http.get('*/api/collections/:collectionId', () => HttpResponse.json(COLLECTION_BACKEND)),
      http.get('*/api/tags', () => HttpResponse.json({ items: SAMPLE_TAGS })),
      http.get('*/api/links', () =>
        HttpResponse.json<LinkListResponse>({
          items: [existingCollectionLink, looseLink],
          next_cursor: null,
        }),
      ),
      http.post('*/api/collections', async ({ request }) => {
        capturedCreateBody = await request.json();
        return HttpResponse.json(
          {
            ...COLLECTION_BACKEND,
            id: '01933b2e-aaaa-7000-8000-000000000055',
            name: 'Nova com Links',
            link_count: 1,
          },
          { status: 201 },
        );
      }),
      http.patch('*/api/collections/:collectionId', async ({ request }) => {
        capturedPatchBody = await request.json();
        return HttpResponse.json({
          ...COLLECTION_BACKEND,
          link_count: 1,
          updated_at: '2026-11-22T15:00:00Z',
        });
      }),
    );

    const user = userEvent.setup();
    renderCollectionsApp([ROUTES.COLLECTIONS]);

    expect(await screen.findByText('Backend Python')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nova coleção' }));
    const createDialog = await screen.findByRole('dialog', { name: 'Nova coleção' });

    await user.type(within(createDialog).getByLabelText(/^Nome/i), 'Nova com Links');
    const reactCheckbox = await within(createDialog).findByRole('checkbox', {
      name: /React Docs/i,
    });
    await user.click(reactCheckbox);
    await user.click(within(createDialog).getByRole('button', { name: 'Criar coleção' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Nova coleção' })).not.toBeInTheDocument();
    });
    expect(capturedCreateBody).toEqual({
      name: 'Nova com Links',
      description: null,
      link_ids: [looseLink.id],
    });

    // Abre a coleção e clica em "Associar links existentes"
    await user.click(screen.getByRole('link', { name: 'Abrir coleção Backend Python' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Backend Python' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Associar links existentes' }));
    const editDialog = await screen.findByRole('dialog', { name: 'Editar coleção' });

    const fastapiCheckbox = await within(editDialog).findByRole('checkbox', {
      name: /Documentação Oficial do FastAPI/i,
    });
    const looseCheckbox = within(editDialog).getByRole('checkbox', { name: /React Docs/i });
    expect(fastapiCheckbox).toBeChecked();
    expect(looseCheckbox).not.toBeChecked();

    await user.click(fastapiCheckbox);
    await user.click(looseCheckbox);
    await user.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Editar coleção' })).not.toBeInTheDocument();
    });
    expect(capturedPatchBody).toEqual({
      name: COLLECTION_BACKEND.name,
      description: COLLECTION_BACKEND.description,
      link_ids: [looseLink.id],
    });
  });
});