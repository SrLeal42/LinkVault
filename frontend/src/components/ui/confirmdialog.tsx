import type * as React from 'react';

import { AlertDialog } from 'radix-ui';
import { AlertCircleIcon } from '@/components/icons/icons';
import { Button } from './button';

import styles from './confirmdialog.module.css';

export type ConfirmDialogTone = 'default' | 'danger';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  consequence?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  trigger?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequence,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  isLoading = false,
  onConfirm,
  trigger,
}: ConfirmDialogProps): React.JSX.Element {
  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && isLoading) {
      return;
    }
    onOpenChange(nextOpen);
  }

  function handleConfirm(event: React.MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    if (isLoading) {
      return;
    }
    void onConfirm();
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      {trigger && <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content
          className={styles.content}
          onEscapeKeyDown={(event) => {
            if (isLoading) {
              event.preventDefault();
            }
          }}
        >
          <AlertDialog.Title className={styles.title}>{title}</AlertDialog.Title>
          <AlertDialog.Description className={styles.description}>
            {description}
          </AlertDialog.Description>

          {consequence && (
            <div
              className={[
                styles.consequence,
                tone === 'danger' ? styles.consequenceDanger : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <AlertCircleIcon size={16} className={styles.consequenceIcon} />
              <span>{consequence}</span>
            </div>
          )}

          <div className={styles.actions}>
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="secondary" disabled={isLoading}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild onClick={handleConfirm}>
              <Button
                type="button"
                variant={tone === 'danger' ? 'danger' : 'primary'}
                isLoading={isLoading}
                loadingText={confirmLabel}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}