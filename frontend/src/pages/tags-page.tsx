import { useMemo, useState } from 'react';
import type * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { parseApiError } from '@/api/errors';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CloseIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  TagIcon,
  TrashIcon,
} from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirmdialog';
import { EmptyState } from '@/components/ui/emptystate';
import { FormField, Input } from '@/components/ui/formfield';
import { useToast } from '@/components/ui/toast-context';
import { LINKS_QUERY_KEY_PREFIX, formatEditorialDate } from '@/features/links/links-api';
import {
  applyTagApiErrorToForm,
  tagFormSchema,
  toTagCreateRequest,
  type TagFormValues,
} from '@/features/tags/tag-form-schema';
import { TagRenameDialog } from '@/features/tags/tag-rename-dialog';
import {
  TAGS_LIST_QUERY_KEY,
  TAGS_QUERY_KEY_PREFIX,
  buildLibraryTagFilterPath,
  createTag,
  deleteTag,
  fetchUserTags,
  formatTagLinkCount,
  type TagResponse,
} from '@/features/tags/tags-api';
import styles from './tags-page.module.css';

export function TagsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [filterQuery, setFilterQuery] = useState('');
  const [renamingTag, setRenamingTag] = useState<TagResponse | null>(null);
  const [deletingTag, setDeletingTag] = useState<TagResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors: createErrors, isSubmitting: isCreating },
  } = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: { name: '' },
  });

  const tagsQuery = useQuery({
    queryKey: TAGS_LIST_QUERY_KEY,
    queryFn: ({ signal }) => fetchUserTags(signal),
  });

  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);

  const normalizedFilter = filterQuery.trim().toLowerCase();
  const filteredTags = useMemo(() => {
    if (normalizedFilter.length === 0) {
      return tags;
    }
    return tags.filter((tag) => tag.name.toLowerCase().includes(normalizedFilter));
  }, [normalizedFilter, tags]);

  const invalidateTagsAndLinks = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY_PREFIX }),
      queryClient.invalidateQueries({ queryKey: LINKS_QUERY_KEY_PREFIX }),
    ]);
  };

  const handleCreateSubmit = async (values: TagFormValues): Promise<void> => {
    try {
      const created = await createTag(toTagCreateRequest(values));
      reset();
      await invalidateTagsAndLinks();
      toast({
        title: 'Tag criada com sucesso.',
        description: `#${created.name} foi adicionada ao seu catálogo.`,
        variant: 'success',
      });
    } catch (error: unknown) {
      const { hasFieldErrors, bannerMessage } = applyTagApiErrorToForm(error, setError);
      if (!hasFieldErrors) {
        toast({
          title: 'Não foi possível criar a tag.',
          description: bannerMessage,
          variant: 'error',
        });
      }
    }
  };

  const handleTagRenamed = (updatedTag: TagResponse): void => {
    void invalidateTagsAndLinks();
    toast({
      title: 'Tag renomeada com sucesso.',
      description: `Agora exibida como #${updatedTag.name}.`,
      variant: 'success',
    });
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deletingTag || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteTag(deletingTag.id);
      setDeletingTag(null);
      await invalidateTagsAndLinks();
      toast({
        title: 'Tag excluída.',
        description: 'Os links antes associados permanecem salvos na sua biblioteca.',
        variant: 'default',
      });
    } catch (error: unknown) {
      toast({
        title: 'Não foi possível excluir a tag.',
        description: parseApiError(error).userMessage,
        variant: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const errorMessage = tagsQuery.isError ? parseApiError(tagsQuery.error).userMessage : null;
  const totalCountLabel =
    tags.length === 1 ? '01 TAG' : `${String(tags.length).padStart(2, '0')} TAGS`;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerCopy}>
          <h2 className={styles.pageTitle}>Gerenciar Tags</h2>
        </div>
      </header>

      <section className={styles.toolbar} aria-label="Criação e busca de tags">
        <form
          noValidate
          className={styles.createForm}
          aria-label="Criar nova tag"
          onSubmit={(event) => {
            void handleSubmit(handleCreateSubmit)(event);
          }}
        >
          <FormField
            id="tag-create-name"
            label="Nova tag"
            hint="Nomes são únicos (sem diferenciar maiúsculas de minúsculas)."
            error={createErrors.name?.message}
            className={styles.createField}
          >
            <div className={styles.createInputRow}>
              <Input
                type="text"
                placeholder="Ex.: python, arquitetura, seguranca..."
                disabled={isCreating}
                {...register('name')}
              />
              <Button
                type="submit"
                variant="primary"
                leftIcon={<PlusIcon size={16} />}
                isLoading={isCreating}
                loadingText="Criando..."
              >
                Criar tag
              </Button>
            </div>
          </FormField>
        </form>

        <div className={styles.searchField}>
          <label htmlFor="tags-catalog-search" className={styles.searchLabel}>
            Localizar no catálogo
          </label>
          <div className={styles.searchInputWrapper}>
            <SearchIcon size={15} className={styles.searchIcon} />
            <Input
              id="tags-catalog-search"
              type="search"
              aria-label="Filtrar tags"
              placeholder="Filtrar tags pelo nome..."
              className={styles.searchInput}
              value={filterQuery}
              onChange={(event) => {
                setFilterQuery(event.target.value);
              }}
            />
            {filterQuery.length > 0 && (
              <button
                type="button"
                className={styles.clearSearchButton}
                aria-label="Limpar busca de tags"
                onClick={() => {
                  setFilterQuery('');
                }}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        </div>
      </section>

      {tagsQuery.isPending ? (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando tags">
          <p className={styles.skeletonStatusText}>Carregando catálogo de tags...</p>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className={styles.skeletonRow} aria-hidden="true">
              <div className={styles.skeletonPill} />
              <div className={styles.skeletonMeta} />
            </div>
          ))}
        </div>
      ) : tagsQuery.isError ? (
        <div className={styles.errorBox} role="alert">
          <div className={styles.errorHeader}>
            <AlertCircleIcon size={16} className={styles.errorIcon} />
            <span>{errorMessage ?? 'Não foi possível carregar as tags.'}</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void tagsQuery.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : tags.length === 0 ? (
        <EmptyState
          eyebrow="TAGS"
          title="Você ainda não criou nenhuma tag."
          description="Crie tags acima ou diretamente ao salvar um link para classificar e filtrar suas referências por assunto."
          icon={<TagIcon size={18} />}
        />
      ) : filteredTags.length === 0 ? (
        <EmptyState
          eyebrow="FILTRO DE TAGS"
          title="Nenhuma tag encontrada."
          description="Nenhuma tag do seu catálogo corresponde ao termo digitado."
          compact
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFilterQuery('');
              }}
            >
              Limpar busca
            </Button>
          }
        />
      ) : (
        <>
          <ul className={styles.catalogList}>
            {filteredTags.map((tag) => {
              const filterPath = buildLibraryTagFilterPath(tag.name);
              const formattedDate = formatEditorialDate(tag.created_at);
              const countLabel = formatTagLinkCount(tag.link_count);

              return (
                <li key={tag.id}>
                  <article className={styles.tagRow}>
                    <div className={styles.tagIdentity}>
                      <Link
                        to={filterPath}
                        className={styles.tagBadgeLink}
                        aria-label={`Filtrar biblioteca pela tag ${tag.name}`}
                      >
                        <TagIcon size={13} className={styles.tagIcon} />
                        <span>#{tag.name}</span>
                      </Link>

                      <div className={styles.tagMeta}>
                        <span className={styles.linkCount}>{countLabel}</span>
                        {formattedDate && (
                          <>
                            <span className={styles.metaSeparator} aria-hidden="true">
                              ·
                            </span>
                            <time dateTime={tag.created_at} className={styles.date}>
                              CRIADA {formattedDate}
                            </time>
                          </>
                        )}
                      </div>
                    </div>

                    <div className={styles.tagActions}>
                      <Link
                        to={filterPath}
                        className={styles.filterLink}
                        aria-label={`Ver links com a tag ${tag.name}`}
                      >
                        <span>Ver links</span>
                        <ArrowRightIcon size={13} className={styles.filterLinkIcon} />
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leftIcon={<EditIcon size={14} />}
                        aria-label={`Renomear tag ${tag.name}`}
                        onClick={() => {
                          setRenamingTag(tag);
                        }}
                      >
                        Renomear
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leftIcon={<TrashIcon size={14} />}
                        aria-label={`Excluir tag ${tag.name}`}
                        onClick={() => {
                          setDeletingTag(tag);
                        }}
                      >
                        Excluir
                      </Button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>

          <footer className={styles.listFooter}>
            <p className={styles.countReadout}>
              {normalizedFilter.length > 0
                ? `EXIBINDO ${String(filteredTags.length).padStart(2, '0')} DE ${totalCountLabel}`
                : `TOTAL DE ${totalCountLabel}`}
            </p>
          </footer>
        </>
      )}

      <TagRenameDialog
        open={renamingTag !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRenamingTag(null);
          }
        }}
        tag={renamingTag}
        onSuccess={handleTagRenamed}
      />

      <ConfirmDialog
        open={deletingTag !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeletingTag(null);
          }
        }}
        title="Excluir tag?"
        description={
          deletingTag
            ? `Tem certeza de que deseja excluir a tag "#${deletingTag.name}"?`
            : 'Tem certeza de que deseja excluir esta tag?'
        }
        consequence="A tag será removida dos links aos quais estiver associada, mas nenhum link será excluído da sua biblioteca."
        confirmLabel="Excluir tag"
        tone="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
