import { createContext, useContext } from 'react';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

export interface ToastItem extends ToastInput {
  id: string;
  variant: ToastVariant;
}

export interface ToastContextValue {
  toast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser utilizado dentro de um ToastProvider.');
  }
  return context;
}