import type { UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { parseApiError, type ParsedApiError } from '@/api/errors';
import { MAX_TAG_NAME_LENGTH } from '@/features/links/link-form-schema';
import type { TagCreateRequest, TagResponse, TagUpdateRequest } from './tags-api';

export { MAX_TAG_NAME_LENGTH };

export function normalizeTagNameInput(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim();
}

export const tagFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome da tag.')
    .refine((value) => normalizeTagNameInput(value).length > 0, {
      message: 'Informe o nome da tag.',
    })
    .refine((value) => normalizeTagNameInput(value).length <= MAX_TAG_NAME_LENGTH, {
      message: `O nome da tag deve ter no máximo ${String(MAX_TAG_NAME_LENGTH)} caracteres.`,
    }),
});

export type TagFormValues = z.infer<typeof tagFormSchema>;

export interface TagFormErrorState {
  bannerMessage: string;
  hasFieldErrors: boolean;
  parsed: ParsedApiError;
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

export function buildTagFormDefaultValues(tag?: TagResponse | null): TagFormValues {
  return {
    name: tag?.name ?? '',
  };
}

export function toTagCreateRequest(values: TagFormValues): TagCreateRequest {
  return {
    name: normalizeTagNameInput(values.name),
  };
}

export function toTagUpdateRequest(values: TagFormValues): TagUpdateRequest {
  return {
    name: normalizeTagNameInput(values.name),
  };
}

export function applyTagApiErrorToForm(
  error: unknown,
  setError: UseFormSetError<TagFormValues>,
): TagFormErrorState {
  const parsed = isParsedApiErrorLike(error) ? error : parseApiError(error);
  let hasFieldErrors = false;

  const fieldMessage = Object.hasOwn(parsed.fieldErrors, 'name')
    ? parsed.fieldErrors.name
    : undefined;
  if (fieldMessage) {
    setError('name', { type: 'server', message: fieldMessage });
    hasFieldErrors = true;
  }

  if (parsed.kind === 'conflict' && !hasFieldErrors) {
    setError('name', { type: 'server', message: parsed.userMessage });
    hasFieldErrors = true;
  }

  return {
    bannerMessage: parsed.userMessage,
    hasFieldErrors,
    parsed,
  };
}
