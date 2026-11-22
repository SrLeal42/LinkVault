import { useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from 'radix-ui';
import { useForm } from 'react-hook-form';
import { AlertCircleIcon, CloseIcon, SearchIcon } from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { FormField, Input, Textarea } from '@/components/ui/formfield';
import {
  LINKS_QUERY_KEY_PREFIX,
  extractUrlHostname,
  fetchLinksPage,
} from '@/features/links/links-api';
import {
  applyCollectionApiErrorToForm,
  buildCollectionFormDefaultValues,
  collectionFormSchema,
  toCollectionCreateRequest,
  toCollectionUpdateRequest,
  type CollectionFormValues,
} from './collection-form-schema';
import { createCollection, updateCollection, type CollectionResponse } from './collections-api';
import styles from './collection-form-dialog.module.css';

export interface CollectionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection?: CollectionResponse | null;
  initialFocus?: 'name' | 'links';
  onSuccess?: (savedCollection: CollectionResponse, mode: 'create' | 'update') => void;
}

interface CollectionFormDialogContentProps {
  collection?: CollectionResponse | null;
  initialFocus: 'name' | 'links';
  onOpenChange: (open: boolean) => void;
  onSubmittingChange: (submitting: boolean) => void;
  onSuccess?: (savedCollection: CollectionResponse, mode: 'create' | 'update') => void;
}

function CollectionFormDialogContent({
  collection,
  initialFocus,
  onOpenChange,
  onSubmittingChange,
  onSuccess,
}: CollectionFormDialogContentProps): React.JSX.Element {
  const isEditing = Boolean(collection);
  const initialValues = useMemo(() => buildCollectionFormDefaultValues(collection), [collection]);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [linkSearchTerm, setLinkSearchTerm] = useState('');
  const [linkSelectionOverride, setLinkSelectionOverride] = useState<{
    touched: boolean;
    ids: string[];
  }>({
    touched: false,
    ids: [],
  });
  const linkSearchInputRef = useRef<HTMLInputElement>(null);

  const linksPickerQuery = useQuery({
    queryKey: [...LINKS_QUERY_KEY_PREFIX, 'collection-picker'],
    queryFn: ({ signal }) => fetchLinksPage({ sort: 'title_asc', limit: 100, signal }),
  });

  const availableLinks = useMemo(
    () => linksPickerQuery.data?.items ?? [],
    [linksPickerQuery.data],
  );

  const selectedLinkIds = useMemo(() => {
    if (linkSelectionOverride.touched) {
      return linkSelectionOverride.ids;
    }
    if (!collection) {
      return [];
    }
    return availableLinks
      .filter((item) => item.collection_id === collection.id)
      .map((item) => item.id);
  }, [availableLinks, collection, linkSelectionOverride]);

  const selectedIdSet = useMemo(() => new Set(selectedLinkIds), [selectedLinkIds]);

  const filteredLinks = useMemo(() => {
    const query = linkSearchTerm.trim().toLowerCase();
    if (query.length === 0) {
      return availableLinks;
    }
    return availableLinks.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.url.toLowerCase().includes(query) ||
        (item.description?.toLowerCase().includes(query) ?? false),
    );
  }, [availableLinks, linkSearchTerm]);

  const handleToggleLink = (linkId: string): void => {
    const nextSet = new Set(selectedIdSet);
    if (nextSet.has(linkId)) {
      nextSet.delete(linkId);
    } else {
      nextSet.add(linkId);
    }
    setLinkSelectionOverride({
      touched: true,
      ids: Array.from(nextSet),
    });
  };

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: initialValues,
  });

  const onFormSubmit = async (values: CollectionFormValues): Promise<void> => {
    setBannerError(null);
    onSubmittingChange(true);
    try {
      const saved = collection
        ? await updateCollection(
            collection.id,
            toCollectionUpdateRequest(
              values,
              linkSelectionOverride.touched ? selectedLinkIds : undefined,
            ),
          )
        : await createCollection(
            toCollectionCreateRequest(
              values,
              selectedLinkIds.length > 0 ? selectedLinkIds : undefined,
            ),
          );

      onSuccess?.(saved, collection ? 'update' : 'create');
      onOpenChange(false);
    } catch (error: unknown) {
      const { bannerMessage } = applyCollectionApiErrorToForm(error, setError);
      setBannerError(bannerMessage);
    } finally {
      onSubmittingChange(false);
    }
  };

  return (
    <Dialog.Content
      className={styles.content}
      onOpenAutoFocus={(event) => {
        if (initialFocus === 'links' && linkSearchInputRef.current) {
          event.preventDefault();
          linkSearchInputRef.current.focus();
        }
      }}
      onEscapeKeyDown={(event) => {
        if (isSubmitting) {
          event.preventDefault();
        }
      }}
      onPointerDownOutside={(event) => {
        if (isSubmitting) {
          event.preventDefault();
        }
      }}
    >
      <div className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>{isEditing ? 'EDIÇÃO DE COLEÇÃO' : 'NOVA COLEÇÃO'}</p>
          <Dialog.Title className={styles.title}>
            {isEditing ? 'Editar coleção' : 'Nova coleção'}
          </Dialog.Title>
        </div>
        <Dialog.Close asChild>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Fechar diálogo"
            disabled={isSubmitting}
          >
            <CloseIcon size={16} />
          </button>
        </Dialog.Close>
      </div>

      <Dialog.Description className={styles.description}>
        {isEditing
          ? 'Atualize os dados da coleção e marque ou desmarque os links da sua biblioteca que devem pertencer a ela.'
          : 'Crie uma coleção privada e, se desejar, já selecione links existentes da sua biblioteca.'}
      </Dialog.Description>

      {bannerError && (
        <div className={styles.errorBanner} role="alert">
          <AlertCircleIcon size={16} className={styles.errorBannerIcon} />
          <span>{bannerError}</span>
        </div>
      )}

      <form
        noValidate
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(onFormSubmit)(event);
        }}
      >
        <FormField
          id="collection-form-name"
          label="Nome"
          error={errors.name?.message}
          required
        >
          <Input
            type="text"
            placeholder="Ex.: Arquitetura & Backend"
            disabled={isSubmitting}
            {...register('name')}
          />
        </FormField>

        <FormField
          id="collection-form-description"
          label="Descrição"
          optionalLabel="Opcional"
          error={errors.description?.message}
        >
          <Textarea
            rows={2}
            placeholder="Contexto ou tema das referências reunidas nesta coleção."
            disabled={isSubmitting}
            {...register('description')}
          />
        </FormField>

        <div className={styles.linksPickerSection}>
          <div className={styles.linksPickerHeader}>
            <label htmlFor="collection-form-link-search" className={styles.linksPickerLabel}>
              Links existentes
            </label>
            <span className={styles.linksPickerCount}>
              {selectedLinkIds.length === 1
                ? '1 selecionado'
                : `${String(selectedLinkIds.length)} selecionados`}
            </span>
          </div>

          <div className={styles.linksSearchWrapper}>
            <SearchIcon size={14} className={styles.linksSearchIcon} />
            <Input
              ref={linkSearchInputRef}
              id="collection-form-link-search"
              type="search"
              aria-label="Filtrar links existentes"
              placeholder="Filtrar links da biblioteca por título ou domínio..."
              className={styles.linksSearchInput}
              disabled={isSubmitting}
              value={linkSearchTerm}
              onChange={(event) => {
                setLinkSearchTerm(event.target.value);
              }}
            />
          </div>

          {linksPickerQuery.isPending ? (
            <p className={styles.linksPickerStatus}>Carregando links da biblioteca...</p>
          ) : linksPickerQuery.isError ? (
            <p className={styles.linksPickerStatus}>
              Não foi possível carregar os links existentes agora.
            </p>
          ) : availableLinks.length === 0 ? (
            <p className={styles.linksPickerStatus}>
              Nenhum link cadastrado na biblioteca ainda.
            </p>
          ) : filteredLinks.length === 0 ? (
            <p className={styles.linksPickerStatus}>
              Nenhum link corresponde ao filtro informado.
            </p>
          ) : (
            <ul className={styles.linksPickerList} aria-label="Links disponíveis para associação">
              {filteredLinks.map((item) => {
                const isChecked = selectedIdSet.has(item.id);
                const checkboxId = `collection-picker-link-${item.id}`;
                const statusBadge =
                  collection?.id === item.collection_id
                    ? 'Nesta coleção'
                    : item.collection_id
                      ? 'Em outra coleção'
                      : 'Sem coleção';

                return (
                  <li key={item.id}>
                    <div
                      className={[
                        styles.linkOption,
                        isChecked ? styles.linkOptionSelected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className={styles.linkCheckbox}
                        checked={isChecked}
                        disabled={isSubmitting}
                        onChange={() => {
                          handleToggleLink(item.id);
                        }}
                      />
                      <label htmlFor={checkboxId} className={styles.linkOptionCopy}>
                        {item.title}
                        <span className={styles.linkOptionMeta}>
                          <span>{extractUrlHostname(item.url)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{statusBadge}</span>
                        </span>
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={styles.actions}>
          <Dialog.Close asChild>
            <Button type="button" variant="secondary" disabled={isSubmitting}>
              Cancelar
            </Button>
          </Dialog.Close>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            loadingText="Salvando..."
          >
            {isEditing ? 'Salvar alterações' : 'Criar coleção'}
          </Button>
        </div>
      </form>
    </Dialog.Content>
  );
}

export function CollectionFormDialog({
  open,
  onOpenChange,
  collection = null,
  initialFocus = 'name',
  onSuccess,
}: CollectionFormDialogProps): React.JSX.Element {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen && isSubmitting) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const formSessionKey = collection
    ? `edit-${collection.id}-${collection.updated_at}-${initialFocus}`
    : `create-collection-${initialFocus}`;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        {open && (
          <CollectionFormDialogContent
            key={formSessionKey}
            collection={collection}
            initialFocus={initialFocus}
            onOpenChange={onOpenChange}
            onSubmittingChange={setIsSubmitting}
            onSuccess={onSuccess}
          />
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}