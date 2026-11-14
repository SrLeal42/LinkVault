import { useCallback, useMemo, useState } from 'react';
import type * as React from 'react';

import { Toast as RadixToast } from 'radix-ui';
import { AlertCircleIcon, CheckIcon, CloseIcon } from '@/components/icons/icons';
import styles from './toast.module.css';
import {
  ToastContext,
  type ToastContextValue,
  type ToastInput,
  type ToastItem,
  type ToastVariant,
} from './toast-context';

let nextToastId = 0;

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: styles.toastDefault ?? '',
  success: styles.toastSuccess ?? '',
  error: styles.toastError ?? '',
  warning: styles.toastWarning ?? '',
};

export function ToastProvider({
  children,
  defaultDurationMs = 5000,
}: {
  children: React.ReactNode;
  defaultDurationMs?: number;
}): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput): string => {
    nextToastId += 1;
    const id = `toast-${String(nextToastId)}`;
    const nextItem: ToastItem = {
      ...input,
      id,
      variant: input.variant ?? 'default',
    };
    setToasts((prev) => [...prev, nextItem]);
    return id;
  }, []);

  const contextValue = useMemo<ToastContextValue>(
    () => ({ toast, dismissToast }),
    [toast, dismissToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      <RadixToast.Provider
        label="Notificação"
        duration={defaultDurationMs}
        swipeDirection="right"
      >
        {children}

        {toasts.map((item) => (
          <RadixToast.Root
            key={item.id}
            open={true}
            duration={item.durationMs}
            type={
              item.variant === 'error' || item.variant === 'warning'
                ? 'foreground'
                : 'background'
            }
            onOpenChange={(open) => {
              if (!open) {
                dismissToast(item.id);
              }
            }}
            className={[styles.toast, VARIANT_CLASSES[item.variant]].filter(Boolean).join(' ')}
          >
            <div className={styles.body}>
              {item.variant === 'success' && (
                <CheckIcon size={16} className={styles.statusIcon} />
              )}
              {(item.variant === 'error' || item.variant === 'warning') && (
                <AlertCircleIcon size={16} className={styles.statusIcon} />
              )}
              <div className={styles.content}>
                <RadixToast.Title className={styles.title}>{item.title}</RadixToast.Title>
                {item.description && (
                  <RadixToast.Description className={styles.description}>
                    {item.description}
                  </RadixToast.Description>
                )}
              </div>
            </div>

            <RadixToast.Close className={styles.closeButton} aria-label="Fechar notificação">
              <CloseIcon size={14} />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}

        <RadixToast.Viewport label="Notificações ({hotkey})" className={styles.viewport} />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}