import { useMemo, useState } from 'react';
import type * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog } from 'radix-ui';
import { useForm } from 'react-hook-form';
import { AlertCircleIcon, CloseIcon } from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/formfield';
import {
  applyTagApiErrorToForm,
  buildTagFormDefaultValues,
  tagFormSchema,
  toTagUpdateRequest,
  type TagFormValues,
} from './tag-form-schema';
import { updateTag, type TagResponse } from './tags-api';
import styles from './tag-rename-dialog.module.css';

export interface TagRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: TagResponse | null;
  onSuccess?: (updatedTag: TagResponse) => void;
}

interface TagRenameDialogContentProps {
  tag: TagResponse;
  onOpenChange: (open: boolean) => void;
  onSubmittingChange: (submitting: boolean) => void;
  onSuccess?: (updatedTag: TagResponse) => void;
}

function TagRenameDialogContent({
  tag,
  onOpenChange,
  onSubmittingChange,
  onSuccess,
}: TagRenameDialogContentProps): React.JSX.Element {
  const initialValues = useMemo(() => buildTagFormDefaultValues(tag), [tag]);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: initialValues,
  });

  const onFormSubmit = async (values: TagFormValues): Promise<void> => {
    setBannerError(null);
    onSubmittingChange(true);
    try {
      const updated = await updateTag(tag.id, toTagUpdateRequest(values));
      onSuccess?.(updated);
      onOpenChange(false);
    } catch (error: unknown) {
      const { bannerMessage } = applyTagApiErrorToForm(error, setError);
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
          <p className={styles.eyebrow}>EDIÇÃO DE TAG</p>
          <Dialog.Title className={styles.title}>Renomear tag</Dialog.Title>
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
        Altere o nome de #{tag.name}. A mudança é aplicada automaticamente a todos os links
        associados.
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
          id="tag-rename-name"
          label="Nome da tag"
          hint="Máximo de 60 caracteres. O prefixo # é opcional."
          error={errors.name?.message}
          required
        >
          <Input
            type="text"
            placeholder="Ex.: python"
            disabled={isSubmitting}
            {...register('name')}
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
            Salvar nome
          </Button>
        </div>
      </form>
    </Dialog.Content>
  );
}

export function TagRenameDialog({
  open,
  onOpenChange,
  tag,
  onSuccess,
}: TagRenameDialogProps): React.JSX.Element {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen && isSubmitting) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const formSessionKey = tag ? `rename-${tag.id}-${tag.name}` : 'rename-closed';

  return (
    <Dialog.Root open={open && tag !== null} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        {open && tag && (
          <TagRenameDialogContent
            key={formSessionKey}
            tag={tag}
            onOpenChange={onOpenChange}
            onSubmittingChange={setIsSubmitting}
            onSuccess={onSuccess}
          />
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
