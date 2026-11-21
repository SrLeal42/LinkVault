import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { parseApiError, type ParsedApiError } from '@/api/errors';
import {
  ROUTES,
  resolveSafeRedirectPath,
  type ChangePasswordRequest,
  type LoginRequest,
  type RedirectLocationState,
  type RegisterRequest,
} from './auth-context';

export const EMAIL_PATTERN = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Informe seu endereço de e-mail.')
    .max(320, 'O e-mail deve ter no máximo 320 caracteres.')
    .regex(EMAIL_PATTERN, 'Informe um endereço de e-mail válido.'),
  password: z
    .string()
    .min(1, 'Informe sua senha.')
    .max(128, 'A senha deve ter no máximo 128 caracteres.'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const registerFormSchema = z.object({
  name: z
    .string()
    .trim()
    .max(120, 'O nome deve ter no máximo 120 caracteres.'),
  email: z
    .string()
    .trim()
    .min(1, 'Informe seu endereço de e-mail.')
    .max(320, 'O e-mail deve ter no máximo 320 caracteres.')
    .regex(EMAIL_PATTERN, 'Informe um endereço de e-mail válido.'),
  password: z
    .string()
    .min(12, 'A senha deve possuir no mínimo 12 caracteres.')
    .max(128, 'A senha deve possuir no máximo 128 caracteres.')
    .refine((val) => val.trim().length > 0, {
      message: 'A senha não pode conter apenas espaços em branco.',
    }),
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export const changePasswordFormSchema = z
  .object({
    current_password: z
      .string()
      .min(1, 'Informe sua senha atual.')
      .max(128, 'A senha deve ter no máximo 128 caracteres.'),
    new_password: z
      .string()
      .min(12, 'A nova senha deve possuir no mínimo 12 caracteres.')
      .max(128, 'A nova senha deve possuir no máximo 128 caracteres.')
      .refine((val) => val.trim().length > 0, {
        message: 'A senha não pode conter apenas espaços em branco.',
      }),
  })
  .refine((values) => values.new_password !== values.current_password, {
    path: ['new_password'],
    message: 'A nova senha deve ser diferente da senha atual.',
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

const PT_BR_MONTHS = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
] as const;

export function formatDemoExpiration(expiresAtIso: string | null | undefined): string | null {
  if (!expiresAtIso) {
    return null;
  }
  const date = new Date(expiresAtIso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = PT_BR_MONTHS[date.getUTCMonth()] ?? '';
  const year = String(date.getUTCFullYear());
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

export interface AuthFormErrorState {
  bannerMessage: string;
  hasFieldErrors: boolean;
  parsed: ParsedApiError;
}

export function toLoginRequestPayload(values: LoginFormValues): LoginRequest {
  return {
    email: values.email.trim().toLowerCase(),
    password: values.password,
  };
}

export function toRegisterRequestPayload(values: RegisterFormValues): RegisterRequest {
  const cleanedName = values.name.trim();
  return {
    email: values.email.trim().toLowerCase(),
    password: values.password,
    name: cleanedName.length > 0 ? cleanedName : null,
  };
}

export function toChangePasswordRequestPayload(
  values: ChangePasswordFormValues,
): ChangePasswordRequest {
  return {
    current_password: values.current_password,
    new_password: values.new_password,
  };
}

export function resolveAuthRedirectFromLocationState(
  locationState: unknown,
  fallback: string = ROUTES.LIBRARY,
): string {
  if (typeof locationState === 'object' && locationState !== null && 'from' in locationState) {
    const candidate = (locationState as RedirectLocationState).from;
    return resolveSafeRedirectPath(candidate, fallback);
  }
  return fallback;
}

function isParsedApiErrorLike(value: unknown): value is ParsedApiError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.kind === 'string' &&
    typeof candidate.userMessage === 'string' &&
    typeof candidate.fieldErrors === 'object' &&
    candidate.fieldErrors !== null
  );
}

export function toParsedAuthError(error: unknown): ParsedApiError {
  if (isParsedApiErrorLike(error)) {
    return error;
  }
  return parseApiError(error);
}

export function applyAuthErrorToForm<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>,
  allowedFields: readonly FieldPath<TFieldValues>[],
  options?: {
    mapConflictToField?: FieldPath<TFieldValues>;
    mapUnauthorizedToField?: FieldPath<TFieldValues>;
  },
): AuthFormErrorState {
  const parsed = toParsedAuthError(error);
  let hasFieldErrors = false;
  for (const field of allowedFields) {
    const fieldMessage = Object.hasOwn(parsed.fieldErrors, field)
      ? parsed.fieldErrors[field]
      : undefined;
    if (fieldMessage) {
      setError(field, { type: 'server', message: fieldMessage });
      hasFieldErrors = true;
    }
  }
  if (parsed.kind === 'conflict' && options?.mapConflictToField && !hasFieldErrors) {
    setError(options.mapConflictToField, {
      type: 'server',
      message: parsed.userMessage,
    });
    hasFieldErrors = true;
  }
  if (parsed.kind === 'unauthorized' && options?.mapUnauthorizedToField && !hasFieldErrors) {
    setError(options.mapUnauthorizedToField, {
      type: 'server',
      message: parsed.userMessage,
    });
    hasFieldErrors = true;
  }
  return {
    bannerMessage: parsed.userMessage,
    hasFieldErrors,
    parsed,
  };
}
