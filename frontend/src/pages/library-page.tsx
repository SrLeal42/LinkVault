import { useEffect, useMemo, useState } from 'react';
import type * as React from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { parseApiError } from '@/api/errors';
import { AlertCircleIcon, CloseIcon, PlusIcon, SearchIcon } from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirmdialog';
import { EmptyState } from '@/components/ui/emptystate';
import { FormField, Input, Select } from '@/components/ui/formfield';
import { useToast } from '@/components/ui/toast-context';
import {
  COLLECTIONS_QUERY_KEY_PREFIX,
  buildCollectionDetailPath,
} from '@/features/collections/collections-api';
import { LinkCard } from '@/features/links/link-card';
import { LinkFormDialog } from '@/features/links/link-form-dialog';
import {
  COLLECTIONS_LIST_QUERY_KEY,
  DEFAULT_LINKS_PAGE_LIMIT,
  LINKS_QUERY_KEY_PREFIX,
  LINK_SORT_OPTIONS,
  TAGS_LIST_QUERY_KEY,
  buildLibrarySearchParams,
  buildLinksListQueryKey,
  deleteLink,
  fetchLinksPage,
  fetchUserCollections,
  fetchUserTags,
  hasActiveLibraryFilters,
  isLinkSortOption,
  parseLibrarySearchParams,
  updateLink,
  type LibraryFilterState,
  type LinkResponse,
} from '@/features/links/links-api';
import styles from './library-page.module.css';

export interface LibraryPageProps {
  searchDebounceMs?: number;
  onAddLink?: () => void;
  onEditLink?: (link: LinkResponse) => void;
  onDeleteLink?: (link: LinkResponse) => void;
}

export function LibraryPage({
  searchDebounceMs = 300,
  onAddLink,
  onEditLink,
  onDeleteLink,
}: LibraryPageProps = {}): React.JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseLibrarySearchParams(searchParams), [searchParams]);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkResponse | null>(null);
  const [deletingLink, setDeletingLink] = useState<LinkResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingCollectionLinkId, setUpdatingCollectionLinkId] = useState<string | null>(null);

  const [searchDraft, setSearchDraft] = useState<{
    baseUrlQuery: string;
    value: string;
  }>({
    baseUrlQuery: filters.q,
    value: filters.q,
  });

  const searchInputValue =
    searchDraft.baseUrlQuery === filters.q ? searchDraft.value : filters.q;

  useEffect(() => {
    const normalizedDraft = searchInputValue.trim();
    if (normalizedDraft === filters.q) {
      return;
    }

    const timerId = setTimeout(() => {
      setSearchParams(
        (prev) => buildLibrarySearchParams(prev, { q: normalizedDraft }),
        { replace: true },
      );
    }, searchDebounceMs);

    return () => {
      clearTimeout(timerId);
    };
  }, [filters.q, searchDebounceMs, searchInputValue, setSearchParams]);

  const collectionsQuery = useQuery({
    queryKey: COLLECTIONS_LIST_QUERY_KEY,
    queryFn: ({ signal }) => fetchUserCollections(signal),
  });

  const tagsQuery = useQuery({
    queryKey: TAGS_LIST_QUERY_KEY,
    queryFn: ({ signal }) => fetchUserTags(signal),
  });

  const linksQuery = useInfiniteQuery({
    queryKey: buildLinksListQueryKey(filters, DEFAULT_LINKS_PAGE_LIMIT),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchLinksPage({
        q: filters.q,
        collectionId: filters.collectionId,
        tag: filters.tag,
        sort: filters.sort,
        limit: DEFAULT_LINKS_PAGE_LIMIT,
        cursor: pageParam,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const collections = useMemo(() => collectionsQuery.data ?? [], [collectionsQuery.data]);
  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);

  const collectionNameById = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection.name])),
    [collections],
  );

  const hasUnlistedActiveTag = useMemo(() => {
    if (filters.tag.length === 0) {
      return false;
    }
    const normalized = filters.tag.toLowerCase();
    return !tags.some((tag) => tag.name.toLowerCase() === normalized);
  }, [filters.tag, tags]);

  const allLinks = useMemo(
    () => linksQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [linksQuery.data],
  );

  const hasActiveFilters = hasActiveLibraryFilters(filters);

  const updateFilters = (patch: Partial<LibraryFilterState>): void => {
    setSearchParams((prev) => buildLibrarySearchParams(prev, patch), { replace: true });
  };

  const handleSearchSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const normalized = searchInputValue.trim();
    setSearchDraft({ baseUrlQuery: normalized, value: normalized });
    updateFilters({ q: normalized });
  };

  const handleClearSearch = (): void => {
    setSearchDraft({ baseUrlQuery: '', value: '' });
    updateFilters({ q: '' });
  };

  const handleClearAllFilters = (): void => {
    setSearchDraft({ baseUrlQuery: '', value: '' });
    updateFilters({ q: '', collectionId: '', tag: '' });
  };

  const handleToggleTag = (tagName: string): void => {
    const isSameTag = filters.tag.toLowerCase() === tagName.toLowerCase();
    updateFilters({ tag: isSameTag ? '' : tagName });
  };

  const handleOpenCollection = (targetCollectionId: string): void => {
    if (!targetCollectionId) {
      return;
    }
    void navigate(buildCollectionDetailPath(targetCollectionId));
  };

  const invalidateLibraryCaches = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: LINKS_QUERY_KEY_PREFIX }),
      queryClient.invalidateQueries({ queryKey: TAGS_LIST_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY_PREFIX }),
    ]);
  };

  const handleQuickCollectionChange = async (
    targetLink: LinkResponse,
    nextCollectionId: string | null,
  ): Promise<void> => {
    if (updatingCollectionLinkId === targetLink.id) {
      return;
    }
    setUpdatingCollectionLinkId(targetLink.id);
    try {
      await updateLink(targetLink.id, { collection_id: nextCollectionId });
      await invalidateLibraryCaches();
      toast({
        title:
          nextCollectionId === null
            ? 'Link removido da coleção.'
            : 'Coleção do link atualizada.',
        variant: 'success',
      });
    } catch (error: unknown) {
      toast({
        title: 'Não foi possível alterar a coleção do link.',
        description: parseApiError(error).userMessage,
        variant: 'error',
      });
    } finally {
      setUpdatingCollectionLinkId(null);
    }
  };

  const handleOpenCreate = (): void => {
    if (onAddLink) {
      onAddLink();
      return;
    }
    setIsCreateDialogOpen(true);
  };

  const handleOpenEdit = (link: LinkResponse): void => {
    if (onEditLink) {
      onEditLink(link);
      return;
    }
    setEditingLink(link);
  };

  const handleOpenDelete = (link: LinkResponse): void => {
    if (onDeleteLink) {
      onDeleteLink(link);
      return;
    }
    setDeletingLink(link);
  };

  const handleLinkSaved = (_savedLink: LinkResponse, mode: 'create' | 'update'): void => {
    void invalidateLibraryCaches();
    toast({
      title: mode === 'create' ? 'Link criado com sucesso.' : 'Link atualizado com sucesso.',
      variant: 'success',
    });
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deletingLink || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteLink(deletingLink.id);
      setDeletingLink(null);
      await invalidateLibraryCaches();
      toast({
        title: 'Link excluído.',
        variant: 'default',
      });
    } catch (error: unknown) {
      toast({
        title: 'Não foi possível excluir o link.',
        description: parseApiError(error).userMessage,
        variant: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const errorMessage = linksQuery.isError ? parseApiError(linksQuery.error).userMessage : null;
  const loadedCountLabel =
    allLinks.length === 1 ? '001 REFERÊNCIA' : `${String(allLinks.length).padStart(3, '0')} REFERÊNCIAS`;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerCopy}>
          <h2 className={styles.pageTitle}>Minha Biblioteca</h2>
        </div>

        <Button
          type="button"
          variant="primary"
          leftIcon={<PlusIcon size={16} />}
          onClick={handleOpenCreate}
        >
          Adicionar link
        </Button>
      </header>

      <section className={styles.toolbar} aria-label="Pesquisa, filtros e ordenação">
        <form role="search" className={styles.searchForm} onSubmit={handleSearchSubmit}>
          <div className={styles.searchInputWrapper}>
            <SearchIcon size={16} className={styles.searchIcon} />
            <Input
              id="library-search"
              type="search"
              aria-label="Pesquisar links"
              placeholder="Pesquisar por título ou descrição..."
              className={styles.searchInput}
              value={searchInputValue}
              onChange={(event) => {
                setSearchDraft({
                  baseUrlQuery: filters.q,
                  value: event.target.value,
                });
              }}
            />
            {searchInputValue.length > 0 && (
              <button
                type="button"
                className={styles.clearSearchButton}
                aria-label="Limpar pesquisa"
                onClick={handleClearSearch}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
          <Button type="submit" variant="secondary">
            Pesquisar
          </Button>
        </form>

        <div className={styles.filtersGrid}>
          <FormField id="library-filter-collection" label="Coleção">
            <Select
              value={filters.collectionId}
              onChange={(event) => {
                updateFilters({ collectionId: event.target.value });
              }}
            >
              <option value="">Todas as coleções</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField id="library-filter-tag" label="Tag">
            <Select
              value={filters.tag}
              onChange={(event) => {
                updateFilters({ tag: event.target.value });
              }}
            >
              <option value="">Todas as tags</option>
              {hasUnlistedActiveTag && <option value={filters.tag}>#{filters.tag}</option>}
              {tags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  #{tag.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField id="library-sort" label="Ordenar por">
            <Select
              value={filters.sort}
              onChange={(event) => {
                const candidate = event.target.value;
                if (isLinkSortOption(candidate)) {
                  updateFilters({ sort: candidate });
                }
              }}
            >
              {LINK_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        {hasActiveFilters && (
          <div className={styles.activeFiltersBar}>
            <span className={styles.activeFiltersSummary}>
              FILTROS ATIVOS
              {filters.q ? ` · BUSCA: "${filters.q}"` : ''}
              {filters.collectionId
                ? ` · COLEÇÃO: ${collectionNameById.get(filters.collectionId) ?? 'SELECIONADA'}`
                : ''}
              {filters.tag ? ` · TAG: #${filters.tag}` : ''}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={handleClearAllFilters}>
              Limpar filtros
            </Button>
          </div>
        )}
      </section>

      {linksQuery.isPending ? (
        <div
          className={styles.skeletonList}
          aria-busy="true"
          aria-label="Carregando referências"
        >
          <p className={styles.skeletonStatusText}>Carregando referências...</p>
          {[0, 1, 2].map((index) => (
            <div key={index} className={styles.skeletonCard} aria-hidden="true">
              <div className={styles.skeletonLineShort} />
              <div className={styles.skeletonLineTitle} />
              <div className={styles.skeletonLineBody} />
            </div>
          ))}
        </div>
      ) : linksQuery.isError ? (
        <div className={styles.errorBox} role="alert">
          <div className={styles.errorHeader}>
            <AlertCircleIcon size={16} className={styles.errorIcon} />
            <span>{errorMessage ?? 'Não foi possível carregar os links.'}</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void linksQuery.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : allLinks.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            eyebrow="PESQUISA E FILTROS"
            title="Nenhum link corresponde à pesquisa."
            description="Tente ajustar os termos buscados ou remova os filtros ativos para visualizar todo o seu acervo."
            action={
              <Button type="button" variant="secondary" onClick={handleClearAllFilters}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            eyebrow="BIBLIOTECA"
            title="Sua biblioteca ainda está vazia."
            description="Salve artigos, documentações e repositórios técnicos para consultá-los com busca rápida e organização por coleções e tags."
            action={
              <Button
                type="button"
                variant="primary"
                leftIcon={<PlusIcon size={16} />}
                onClick={handleOpenCreate}
              >
                Adicionar link
              </Button>
            }
          />
        )
      ) : (
        <>
          <ul className={styles.linksList}>
            {allLinks.map((link) => (
              <li key={link.id}>
                <LinkCard
                  link={link}
                  collectionName={
                    link.collection_id ? (collectionNameById.get(link.collection_id) ?? null) : null
                  }
                  collections={collections}
                  isUpdatingCollection={updatingCollectionLinkId === link.id}
                  activeTag={filters.tag}
                  activeCollectionId={filters.collectionId}
                  sort={filters.sort}
                  onSelectTag={handleToggleTag}
                  onSelectCollection={handleOpenCollection}
                  onChangeCollection={(target, nextCollectionId) => {
                    void handleQuickCollectionChange(target, nextCollectionId);
                  }}
                  onEdit={handleOpenEdit}
                  onDelete={handleOpenDelete}
                />
              </li>
            ))}
          </ul>

          <footer className={styles.listFooter}>
            <p className={styles.countReadout}>
              EXIBINDO {loadedCountLabel}
              {linksQuery.hasNextPage ? ' · MAIS ITENS DISPONÍVEIS' : ''}
            </p>

            {linksQuery.hasNextPage && (
              <Button
                type="button"
                variant="secondary"
                isLoading={linksQuery.isFetchingNextPage}
                loadingText="Carregando mais..."
                onClick={() => {
                  void linksQuery.fetchNextPage();
                }}
              >
                Carregar mais referências
              </Button>
            )}
          </footer>
        </>
      )}

      <LinkFormDialog
        open={isCreateDialogOpen || editingLink !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsCreateDialogOpen(false);
            setEditingLink(null);
          }
        }}
        link={editingLink}
        defaultCollectionId={filters.collectionId}
        collections={collections}
        availableTags={tags}
        onSuccess={handleLinkSaved}
      />

      <ConfirmDialog
        open={deletingLink !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeletingLink(null);
          }
        }}
        title="Excluir link?"
        description={
          deletingLink
            ? `Tem certeza de que deseja excluir "${deletingLink.title}" da sua biblioteca?`
            : 'Tem certeza de que deseja excluir este link?'
        }
        consequence="Esta ação é permanente e não poderá ser desfeita."
        confirmLabel="Excluir link"
        tone="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}