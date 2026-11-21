import { useMemo, useState } from 'react';
import type * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog } from 'radix-ui';
import { useForm } from 'react-hook-form';
import { AlertCircleIcon, CloseIcon, PlusIcon } from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/formfield';
import {
  addUniqueTag,
  applyLinkApiErrorToForm,
  buildLinkFormDefaultValues,
  linkFormSchema,
  removeTagByName,
  toLinkCreateRequest,
  toLinkUpdateRequest,
  type LinkFormValues,
} from './link-form-schema';
import {
  createLink,
  updateLink,
  type CollectionResponse,
  type LinkResponse,
  type TagResponse,
} from './links-api';
import styles from './link-form-dialog.module.css';

export interface LinkFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link?: LinkResponse | null;
  defaultCollectionId?: string;
  collections: readonly CollectionResponse[];
  availableTags: readonly TagResponse[];
  onSuccess?: (savedLink: LinkResponse, mode: 'create' | 'update') => void;
}

interface LinkFormDialogContentProps {
  link?: LinkResponse | null;
  defaultCollectionId?: string;
  collections: readonly CollectionResponse[];
  availableTags: readonly TagResponse[];
  onOpenChange: (open: boolean) => void;
  onSubmittingChange: (submitting: boolean) => void;
  onSuccess?: (savedLink: LinkResponse, mode: 'create' | 'update') => void;
}

function LinkFormDialogContent({
  link,
  defaultCollectionId,
  collections,
  availableTags,
  onOpenChange,
  onSubmittingChange,
  onSuccess,
}: LinkFormDialogContentProps): React.JSX.Element {
  const isEditing = Boolean(link);
  const initialValues = useMemo(
    () => buildLinkFormDefaultValues(link, defaultCollectionId),
    [link, defaultCollectionId],
  );

  const [selectedTags, setSelectedTags] = useState<string[]>(initialValues.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [tagDraftError, setTagDraftError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkFormSchema),
    defaultValues: initialValues,
  });

  const unselectedSuggestions = useMemo(() => {
    const selectedLower = new Set(selectedTags.map((tag) => tag.toLowerCase()));
    return availableTags.filter((tag) => !selectedLower.has(tag.name.toLowerCase()));
  }, [availableTags, selectedTags]);

  const commitTagDraft = (rawValue: string): void => {
    const result = addUniqueTag(selectedTags, rawValue);
    if (result.error) {
      setTagDraftError(result.error);
      return;
    }
    setTagDraftError(null);
    setSelectedTags(result.tags);
    setValue('tags', result.tags, { shouldValidate: true });
    setTagDraft('');
  };

  const handleTagKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (tagDraft.trim().length > 0) {
        commitTagDraft(tagDraft);
      }
    }
  };

  const handleRemoveTag = (tagName: string): void => {
    const nextTags = removeTagByName(selectedTags, tagName);
    setSelectedTags(nextTags);
    setValue('tags', nextTags, { shouldValidate: true });
    setTagDraftError(null);
  };

  const handleSelectSuggestion = (tagName: string): void => {
    const result = addUniqueTag(selectedTags, tagName);
    if (result.error) {
      setTagDraftError(result.error);
      return;
    }
    setTagDraftError(null);
    setSelectedTags(result.tags);
    setValue('tags', result.tags, { shouldValidate: true });
  };

  const onFormSubmit = async (values: LinkFormValues): Promise<void> => {
    setBannerError(null);
    setTagDraftError(null);

    let finalTags = selectedTags;
    if (tagDraft.trim().length > 0) {
      const addition = addUniqueTag(selectedTags, tagDraft);
      if (addition.error) {
        setTagDraftError(addition.error);
        return;
      }
      finalTags = addition.tags;
      setSelectedTags(finalTags);
      setValue('tags', finalTags);
      setTagDraft('');
    }

    const payloadValues: LinkFormValues = {
      ...values,
      tags: finalTags,
    };

    onSubmittingChange(true);
    try {
      const saved = link
        ? await updateLink(link.id, toLinkUpdateRequest(payloadValues))
        : await createLink(toLinkCreateRequest(payloadValues));

      onSuccess?.(saved, link ? 'update' : 'create');
      onOpenChange(false);
    } catch (error: unknown) {
      const { bannerMessage } = applyLinkApiErrorToForm(error, setError);
      setBannerError(bannerMessage);
    } finally {
      onSubmittingChange(false);
    }
  };

  const combinedTagError = tagDraftError ?? errors.tags?.message;

  return (
    <Dialog.Content
      className={styles.content}
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
          <p className={styles.eyebrow}>{isEditing ? 'EDIÇÃO DE REFERÊNCIA' : 'NOVA REFERÊNCIA'}</p>
          <Dialog.Title className={styles.title}>
            {isEditing ? 'Editar link' : 'Adicionar link'}
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
          ? 'Atualize os dados do link, sua coleção ou as tags associadas.'
          : 'Salve uma URL com título, contexto e notas privadas. Novas tags são criadas automaticamente pelo nome.'}
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
          id="link-form-url"
          label="URL"
          hint="Aceita endereços iniciados por http:// ou https://."
          error={errors.url?.message}
          required
        >
          <Input
            type="url"
            placeholder="https://localhost:5173/"
            disabled={isSubmitting}
            {...register('url')}
          />
        </FormField>

        <FormField id="link-form-title" label="Título" error={errors.title?.message} required>
          <Input
            type="text"
            placeholder="Servidor local"
            disabled={isSubmitting}
            {...register('title')}
          />
        </FormField>

        <FormField
          id="link-form-description"
          label="Descrição"
          optionalLabel="Opcional"
          error={errors.description?.message}
        >
          <Textarea
            rows={2}
            placeholder="Resumo curto sobre o conteúdo desta referência."
            disabled={isSubmitting}
            {...register('description')}
          />
        </FormField>

        <FormField
          id="link-form-notes"
          label="Notas pessoais"
          optionalLabel="Privado"
          hint="Visível apenas na sua biblioteca autenticada; nunca exibido em coleções públicas."
          error={errors.notes?.message}
        >
          <Textarea
            rows={2}
            placeholder="Anotações particulares, trechos ou lembretes de estudo."
            disabled={isSubmitting}
            {...register('notes')}
          />
        </FormField>

        <FormField
          id="link-form-collection"
          label="Coleção"
          optionalLabel="Opcional"
          error={errors.collection_id?.message}
        >
          <Select disabled={isSubmitting} {...register('collection_id')}>
            <option value="">Sem coleção</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          id="link-form-tags"
          label="Tags"
          optionalLabel="Opcional"
          hint="Digite o nome e pressione Enter ou clique em Adicionar. Tags inéditas são criadas automaticamente."
          error={combinedTagError}
        >
          <div className={styles.tagInputRow}>
            <Input
              id="link-form-tags"
              type="text"
              placeholder="Ex.: python, arquitetura..."
              disabled={isSubmitting}
              value={tagDraft}
              onChange={(event) => {
                setTagDraft(event.target.value);
                if (tagDraftError) {
                  setTagDraftError(null);
                }
              }}
              onKeyDown={handleTagKeyDown}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<PlusIcon size={14} />}
              disabled={isSubmitting || tagDraft.trim().length === 0}
              onClick={() => {
                commitTagDraft(tagDraft);
              }}
            >
              Adicionar
            </Button>
          </div>

          {selectedTags.length > 0 && (
            <div className={styles.selectedTagsList} aria-label="Tags selecionadas">
              {selectedTags.map((tagName) => (
                <span key={tagName} className={styles.tagChip}>
                  <span>#{tagName}</span>
                  <button
                    type="button"
                    className={styles.tagChipRemove}
                    aria-label={`Remover tag ${tagName}`}
                    disabled={isSubmitting}
                    onClick={() => {
                      handleRemoveTag(tagName);
                    }}
                  >
                    <CloseIcon size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {unselectedSuggestions.length > 0 && (
            <div className={styles.suggestionsBlock}>
              <p className={styles.suggestionsLabel}>Tags existentes</p>
              <div className={styles.suggestionsList}>
                {unselectedSuggestions.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={styles.suggestionPill}
                    aria-label={`Associar tag ${tag.name}`}
                    disabled={isSubmitting}
                    onClick={() => {
                      handleSelectSuggestion(tag.name);
                    }}
                  >
                    <PlusIcon size={11} />
                    <span>#{tag.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </FormField>

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
            loadingText={isEditing ? 'Salvando...' : 'Adicionando...'}
          >
            {isEditing ? 'Salvar alterações' : 'Salvar link'}
          </Button>
        </div>
      </form>
    </Dialog.Content>
  );
}

export function LinkFormDialog({
  open,
  onOpenChange,
  link = null,
  defaultCollectionId,
  collections,
  availableTags,
  onSuccess,
}: LinkFormDialogProps): React.JSX.Element {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen && isSubmitting) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const formSessionKey = link
    ? `edit-${link.id}-${link.updated_at}`
    : `create-${defaultCollectionId ?? 'none'}`;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        {open && (
          <LinkFormDialogContent
            key={formSessionKey}
            link={link}
            defaultCollectionId={defaultCollectionId}
            collections={collections}
            availableTags={availableTags}
            onOpenChange={onOpenChange}
            onSubmittingChange={setIsSubmitting}
            onSuccess={onSuccess}
          />
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
