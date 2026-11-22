import { useMemo, useState } from 'react';
import type * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog } from 'radix-ui';
import { useForm } from 'react-hook-form';
import { AlertCircleIcon, CloseIcon } from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { FormField, Input, Textarea } from '@/components/ui/formfield';
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
  onSuccess?: (savedCollection: CollectionResponse, mode: 'create' | 'update') => void;
}

interface CollectionFormDialogContentProps {
  collection?: CollectionResponse | null;
  onOpenChange: (open: boolean) => void;
  onSubmittingChange: (submitting: boolean) => void;
  onSuccess?: (savedCollection: CollectionResponse, mode: 'create' | 'update') => void;
}

function CollectionFormDialogContent({
  collection,
  onOpenChange,
  onSubmittingChange,
  onSuccess,
}: CollectionFormDialogContentProps): React.JSX.Element {
  const isEditing = Boolean(collection);
  const initialValues = useMemo(() => buildCollectionFormDefaultValues(collection), [collection]);
  const [bannerError, setBannerError] = useState<string | null>(null);

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
        ? await updateCollection(collection.id, toCollectionUpdateRequest(values))
        : await createCollection(toCollectionCreateRequest(values));

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
          ? 'Atualize o nome e a descrição desta coleção.'
          : 'Crie uma coleção privada para reunir referências por tema, projeto ou estudo.'}
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
            rows={3}
            placeholder="Contexto ou tema das referências reunidas nesta coleção."
            disabled={isSubmitting}
            {...register('description')}
          />
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
    ? `edit-${collection.id}-${collection.updated_at}`
    : 'create-collection';

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        {open && (
          <CollectionFormDialogContent
            key={formSessionKey}
            collection={collection}
            onOpenChange={onOpenChange}
            onSubmittingChange={setIsSubmitting}
            onSuccess={onSuccess}
          />
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}