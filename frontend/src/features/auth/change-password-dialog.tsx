import { useState } from 'react';
import type * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog } from 'radix-ui';
import { useForm } from 'react-hook-form';
import { AlertCircleIcon, CloseIcon } from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { FormField, PasswordInput } from '@/components/ui/formfield';
import { useToast } from '@/components/ui/toast-context';
import { useAuth } from './auth-context';
import {
  applyAuthErrorToForm,
  changePasswordFormSchema,
  toChangePasswordRequestPayload,
  type ChangePasswordFormValues,
} from './auth-forms';
import styles from './change-password-dialog.module.css';

export interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps): React.JSX.Element {
  const { changePassword } = useAuth();
  const { toast } = useToast();
  const [bannerError, setBannerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
    },
  });

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen && isSubmitting) {
      return;
    }
    reset();
    setBannerError(null);
    onOpenChange(nextOpen);
  };

  const onSubmit = async (values: ChangePasswordFormValues): Promise<void> => {
    setBannerError(null);
    try {
      await changePassword(toChangePasswordRequestPayload(values));
      reset();
      onOpenChange(false);
      toast({
        title: 'Senha alterada com sucesso.',
        description: 'Sua sessão foi atualizada e os demais dispositivos foram desconectados.',
        variant: 'success',
      });
    } catch (error: unknown) {
      const { bannerMessage } = applyAuthErrorToForm(
        error,
        setError,
        ['current_password', 'new_password'],
        { mapUnauthorizedToField: 'current_password' },
      );
      setBannerError(bannerMessage);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
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
              <p className={styles.eyebrow}>SEGURANÇA DA CONTA</p>
              <Dialog.Title className={styles.title}>Alterar senha</Dialog.Title>
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
            Confirme sua senha atual para definir uma nova credencial. Todas as outras sessões
            ativas serão encerradas automaticamente.
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
              void handleSubmit(onSubmit)(event);
            }}
          >
            <FormField
              id="change-password-current"
              label="Senha atual"
              error={errors.current_password?.message}
              required
            >
              <PasswordInput
                autoComplete="current-password"
                placeholder="Digite sua senha atual"
                disabled={isSubmitting}
                {...register('current_password')}
              />
            </FormField>

            <FormField
              id="change-password-new"
              label="Nova senha"
              hint="Mínimo de 12 caracteres. Todas as outras sessões ativas serão encerradas."
              error={errors.new_password?.message}
              required
            >
              <PasswordInput
                autoComplete="new-password"
                placeholder="Crie uma nova senha forte"
                disabled={isSubmitting}
                {...register('new_password')}
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
                loadingText="Alterando..."
              >
                Salvar nova senha
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}