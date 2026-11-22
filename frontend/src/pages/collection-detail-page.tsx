import { useEffect, useMemo, useState } from 'react';
import type * as React from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { parseApiError } from '@/api/errors';
import {
  AlertCircleIcon,
  CloseIcon,
  EditIcon,
  FolderIcon,
  GlobeIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirmdialog';
import { EmptyState } from '@/components/ui/emptystate';
import { FormField, Input, Select } from '@/components/ui/formfield';
import { useToast } from '@/components/ui/toast-context';
import { ROUTES } from '@/features/auth/auth-context';
import { CollectionFormDialog } from '@/features/collections/collection-form-dialog';
import {
  COLLECTIONS_LIST_QUERY_KEY,
  COLLECTIONS_QUERY_KEY_PREFIX,
  buildCollectionDetailQueryKey,
  buildCollectionSearchParams,
  deleteCollection,
  fetchCollectionById,
  formatCollectionLinkCount,
  hasActiveCollectionFilters,
  parseCollectionSearchParams,
  type CollectionLinksFilterState,
} from '@/features/collections/collections-api';
import { LinkCard } from '@/features/links/link-card';
import { LinkFormDialog } from '@/features/links/link-form-dialog';
import {
  DEFAULT_LINKS_PAGE_LIMIT,
  LINKS_QUERY_KEY_PREFIX,
  LINK_SORT_OPTIONS,
  TAGS_LIST_QUERY_KEY,
  buildLinksListQueryKey,
  deleteLink,
  fetchLinksPage,
  fetchUserCollections,
  fetchUserTags,
  formatEditorialDate,
  isLinkSortOption,
  updateLink,
  type LinkResponse,
} from '@/features/links/links-api';
import styles from './collection-detail-page.module.css';

export interface CollectionDetailPageProps {
  searchDebounceMs?: number;
}

export function CollectionDetailPage({
  searchDebounceMs = 300,
}: CollectionDetailPageProps = {}): React.JSX.Element {
  const { collectionId = '' } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => parseCollectionSearchParams(searchParams), [searchParams]);

  const [isEditCollectionOpen, setIsEditCollectionOpen] = useState(false);
  const [collectionDialogFocus, setCollectionDialogFocus] = useState<'name' | 'links'>('name');
  const [isDeleteCollectionOpen, setIsDeleteCollectionOpen] = useState(false);
  const [isDeletingCollection, setIsDeletingCollection] = useState(false);

  const [isCreateLinkOpen, setIsCreateLinkOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkResponse | null>(null);
  const [deletingLink, setDeletingLink] = useState<LinkResponse | null>(null);
  const [isDeletingLink, setIsDeletingLink] = useState(false);
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
        (prev) => buildCollectionSearchParams(prev, { q: normalizedDraft }),
        { replace: true },
      );
    }, searchDebounceMs);

    return () => {
      clearTimeout(timerId);
    };
  }, [filters.q, searchDebounceMs, searchInputValue, setSearchParams]);

  const collectionQuery = useQuery({
    queryKey: buildCollectionDetailQueryKey(collectionId),
    queryFn: ({ signal }) => fetchCollectionById(collectionId, signal),
    enabled: collectionId.length > 0,
  });

  const collectionsQuery = useQuery({
    queryKey: COLLECTIONS_LIST_QUERY_KEY,
    queryFn: ({ signal }) => fetchUserCollections(signal),
    enabled: collectionQuery.isSuccess,
  });

  const tagsQuery = useQuery({
    queryKey: TAGS_LIST_QUERY_KEY,
    queryFn: ({ signal }) => fetchUserTags(signal),
    enabled: collectionQuery.isSuccess,
  });

  const linksQuery = useInfiniteQuery({
    queryKey: buildLinksListQueryKey(
      {
        q: filters.q,
        collectionId,
        tag: filters.tag,
        sort: filters.sort,
      },
      DEFAULT_LINKS_PAGE_LIMIT,
    ),
    initialPageParam: null as string | null,
    enabled: collectionQuery.isSuccess,
    queryFn: ({ pageParam, signal }) =>
      fetchLinksPage({
        q: filters.q,
        collectionId,
        tag: filters.tag,
        sort: filters.sort,
        limit: DEFAULT_LINKS_PAGE_LIMIT,
        cursor: pageParam,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const collection = collectionQuery.data ?? null;
  const collections = useMemo(() => {
    const list = collectionsQuery.data ?? [];
    if (collection && !list.some((item) => item.id === collection.id)) {
      return [collection, ...list];
    }
    return list;
  }, [collectionsQuery.data, collection]);
  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);

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

  const hasActiveFilters = hasActiveCollectionFilters(filters);

  const updateFilters = (patch: Partial<CollectionLinksFilterState>): void => {
    setSearchParams((prev) => buildCollectionSearchParams(prev, patch), { replace: true });
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
    updateFilters({ q: '', tag: '' });
  };

  const handleToggleTag = (tagName: string): void => {
    const isSameTag = filters.tag.toLowerCase() === tagName.toLowerCase();
    updateFilters({ tag: isSameTag ? '' : tagName });
  };

  const invalidateCollectionAndLinksCaches = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY_PREFIX }),
      queryClient.invalidateQueries({ queryKey: LINKS_QUERY_KEY_PREFIX }),
      queryClient.invalidateQueries({ queryKey: TAGS_LIST_QUERY_KEY }),
    ]);
  };

  const handleCollectionUpdated = (): void => {
    void invalidateCollectionAndLinksCaches();
    toast({
      title: 'Coleção atualizada com sucesso.',
      variant: 'success',
    });
  };

  const handleConfirmDeleteCollection = async (): Promise<void> => {
    if (!collection || isDeletingCollection) {
      return;
    }

    setIsDeletingCollection(true);
    try {
      await deleteCollection(collection.id);
      setIsDeleteCollectionOpen(false);
      queryClient.removeQueries({
        queryKey: buildCollectionDetailQueryKey(collection.id),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: COLLECTIONS_LIST_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: LINKS_QUERY_KEY_PREFIX }),
      ]);
      toast({
        title: 'Coleção excluída.',
        description: 'Os links antes vinculados permanecem salvos na sua biblioteca.',
        variant: 'default',
      });
      await navigate(ROUTES.COLLECTIONS, { replace: true });
    } catch (error: unknown) {
      toast({
        title: 'Não foi possível excluir a coleção.',
        description: parseApiError(error).userMessage,
        variant: 'error',
      });
    } finally {
      setIsDeletingCollection(false);
    }
  };

  const handleLinkSaved = (_savedLink: LinkResponse, mode: 'create' | 'update'): void => {
    void invalidateCollectionAndLinksCaches();
    toast({
      title: mode === 'create' ? 'Link criado com sucesso.' : 'Link atualizado com sucesso.',
      variant: 'success',
    });
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
      await invalidateCollectionAndLinksCaches();
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

  const handleConfirmDeleteLink = async (): Promise<void> => {
    if (!deletingLink || isDeletingLink) {
      return;
    }

    setIsDeletingLink(true);
    try {
      await deleteLink(deletingLink.id);
      setDeletingLink(null);
      await invalidateCollectionAndLinksCaches();
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
      setIsDeletingLink(false);
    }
  };

  if (collectionQuery.isPending) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Carregando coleção">
        <p className={styles.skeletonStatusText}>Carregando coleção...</p>
        <div className={styles.skeletonCard} aria-hidden="true">
          <div className={styles.skeletonLineShort} />
          <div className={styles.skeletonLineTitle} />
          <div className={styles.skeletonLineBody} />
        </div>
      </div>
    );
  }

  if (collectionQuery.isError || !collection) {
    const parsedCollectionError = collectionQuery.isError
      ? parseApiError(collectionQuery.error)
      : null;
    const isNotFound =
      !collectionId ||
      parsedCollectionError?.kind === 'not_found' ||
      parsedCollectionError?.kind === 'validation';

    if (isNotFound) {
      return (
        <div className={styles.page}>
          <EmptyState
            eyebrow="COLEÇÃO INDISPONÍVEL"
            title="Coleção não encontrada."
            description="Esta coleção não existe, foi excluída ou pertence a outra conta."
            action={
              <Link to={ROUTES.COLLECTIONS} className={styles.backActionLink}>
                Voltar para coleções
              </Link>
            }
          />
        </div>
      );
    }

    return (
      <div className={styles.page}>
        <nav aria-label="Navegação de retorno">
          <Link to={ROUTES.COLLECTIONS} className={styles.backLink}>
            ← Coleções
          </Link>
        </nav>
        <div className={styles.errorBox} role="alert">
          <div className={styles.errorHeader}>
            <AlertCircleIcon size={16} className={styles.errorIcon} />
            <span>
              {parsedCollectionError?.userMessage ?? 'Não foi possível carregar a coleção.'}
            </span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void collectionQuery.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const isPublic = collection.visibility === 'public';
  const formattedCount = formatCollectionLinkCount(collection.link_count);
  const formattedUpdated = formatEditorialDate(collection.updated_at);
  const linksErrorMessage = linksQuery.isError ? parseApiError(linksQuery.error).userMessage : null;
  const loadedCountLabel =
    allLinks.length === 1
      ? '001 REFERÊNCIA'
      : `${String(allLinks.length).padStart(3, '0')} REFERÊNCIAS`;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <nav aria-label="Navegação de retorno" className={styles.breadcrumbRow}>
          <Link to={ROUTES.COLLECTIONS} className={styles.backLink}>
            ← Coleções
          </Link>
        </nav>

        <div className={styles.headerMain}>
          <div className={styles.headerCopy}>
            <div className={styles.metaGroup}>
              <span
                className={isPublic ? styles.visibilityBadgePublic : styles.visibilityBadgePrivate}
              >
                {isPublic ? <GlobeIcon size={13} /> : <LockIcon size={13} />}
                <span>{isPublic ? 'Pública' : 'Privada'}</span>
              </span>
              <span className={styles.metaSeparator} aria-hidden="true">
                ·
              </span>
              <span className={styles.linkCount}>{formattedCount}</span>
              {formattedUpdated && (
                <>
                  <span className={styles.metaSeparator} aria-hidden="true">
                    ·
                  </span>
                  <time dateTime={collection.updated_at} className={styles.date}>
                    ATUALIZADA {formattedUpdated}
                  </time>
                </>
              )}
            </div>

            <h2 className={styles.pageTitle}>{collection.name}</h2>
            {collection.description && (
              <p className={styles.pageSubtitle}>{collection.description}</p>
            )}
          </div>

          <div className={styles.headerActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<FolderIcon size={14} />}
              onClick={() => {
                setCollectionDialogFocus('links');
                setIsEditCollectionOpen(true);
              }}
            >
              Associar links existentes
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<EditIcon size={14} />}
              onClick={() => {
                setCollectionDialogFocus('name');
                setIsEditCollectionOpen(true);
              }}
            >
              Editar coleção
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<TrashIcon size={14} />}
              onClick={() => {
                setIsDeleteCollectionOpen(true);
              }}
            >
              Excluir coleção
            </Button>
            <Button
              type="button"
              variant="primary"
              leftIcon={<PlusIcon size={16} />}
              onClick={() => {
                setIsCreateLinkOpen(true);
              }}
            >
              Adicionar link
            </Button>
          </div>
        </div>
      </header>

      <section className={styles.toolbar} aria-label="Pesquisa, filtro e ordenação da coleção">
        <form role="search" className={styles.searchForm} onSubmit={handleSearchSubmit}>
          <div className={styles.searchInputWrapper}>
            <SearchIcon size={16} className={styles.searchIcon} />
            <Input
              id="collection-links-search"
              type="search"
              aria-label="Pesquisar links na coleção"
              placeholder="Pesquisar nesta coleção por título ou descrição..."
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
          <FormField id="collection-filter-tag" label="Tag">
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

          <FormField id="collection-sort" label="Ordenar por">
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
          aria-label="Carregando referências da coleção"
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
            <span>{linksErrorMessage ?? 'Não foi possível carregar os links da coleção.'}</span>
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
            description="Ajuste os termos buscados ou remova os filtros ativos para visualizar todos os links desta coleção."
            action={
              <Button type="button" variant="secondary" onClick={handleClearAllFilters}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            eyebrow="COLEÇÃO VAZIA"
            title="Esta coleção ainda não possui links."
            description="Adicione uma nova referência diretamente nesta coleção ou associe links já salvos na sua biblioteca."
            action={
              <div className={styles.headerActions}>
                <Button
                  type="button"
                  variant="primary"
                  leftIcon={<PlusIcon size={16} />}
                  onClick={() => {
                    setIsCreateLinkOpen(true);
                  }}
                >
                  Adicionar link
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  leftIcon={<FolderIcon size={15} />}
                  onClick={() => {
                    setCollectionDialogFocus('links');
                    setIsEditCollectionOpen(true);
                  }}
                >
                  Associar links existentes
                </Button>
              </div>
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
                  collectionName={collection.name}
                  collections={collections}
                  isUpdatingCollection={updatingCollectionLinkId === link.id}
                  activeTag={filters.tag}
                  activeCollectionId={collection.id}
                  sort={filters.sort}
                  onSelectTag={handleToggleTag}
                  onChangeCollection={(target, nextCollectionId) => {
                    void handleQuickCollectionChange(target, nextCollectionId);
                  }}
                  onEdit={(target) => {
                    setEditingLink(target);
                  }}
                  onDelete={(target) => {
                    setDeletingLink(target);
                  }}
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

      <CollectionFormDialog
        open={isEditCollectionOpen}
        onOpenChange={setIsEditCollectionOpen}
        collection={collection}
        initialFocus={collectionDialogFocus}
        onSuccess={handleCollectionUpdated}
      />

      <ConfirmDialog
        open={isDeleteCollectionOpen}
        onOpenChange={setIsDeleteCollectionOpen}
        title="Excluir coleção?"
        description={`Tem certeza de que deseja excluir a coleção "${collection.name}"?`}
        consequence="Os links associados não serão apagados; eles permanecerão salvos na sua biblioteca como itens sem coleção."
        confirmLabel="Excluir coleção"
        tone="danger"
        isLoading={isDeletingCollection}
        onConfirm={handleConfirmDeleteCollection}
      />

      <LinkFormDialog
        open={isCreateLinkOpen || editingLink !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsCreateLinkOpen(false);
            setEditingLink(null);
          }
        }}
        link={editingLink}
        defaultCollectionId={collection.id}
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
        isLoading={isDeletingLink}
        onConfirm={handleConfirmDeleteLink}
      />
    </div>
  );
}