import type { FieldPath, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { parseApiError, type ParsedApiError } from '@/api/errors';
import type {
  CollectionCreateRequest,
  CollectionResponse,
  CollectionUpdateRequest,
} from './collections-api';

export const MAX_COLLECTION_NAME_LENGTH = 120;
export const MAX_COLLECTION_DESCRIPTION_LENGTH = 500;

export const collectionFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome da coleção.')
    .max(
      MAX_COLLECTION_NAME_LENGTH,
      `O nome da coleção deve ter no máximo ${String(MAX_COLLECTION_NAME_LENGTH)} caracteres.`,
    ),
  description: z
    .string()
    .trim()
    .max(
      MAX_COLLECTION_DESCRIPTION_LENGTH,
      `A descrição deve ter no máximo ${String(MAX_COLLECTION_DESCRIPTION_LENGTH)} caracteres.`,
    ),
});

export type CollectionFormValues = z.infer<typeof collectionFormSchema>;

export interface CollectionFormErrorState {
  bannerMessage: string;
  hasFieldErrors: boolean;
  parsed: ParsedApiError;
}

const ALLOWED_COLLECTION_FIELDS: readonly FieldPath<CollectionFormValues>[] = [
  'name',
  'description',
];

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

export function buildCollectionFormDefaultValues(
  collection?: CollectionResponse | null,
): CollectionFormValues {
  if (collection) {
    return {
      name: collection.name,
      description: collection.description ?? '',
    };
  }

  return {
    name: '',
    description: '',
  };
}

export function toCollectionCreateRequest(values: CollectionFormValues): CollectionCreateRequest {
  const cleanedDescription = values.description.trim();
  return {
    name: values.name.trim(),
    description: cleanedDescription.length > 0 ? cleanedDescription : null,
  };
}

export function toCollectionUpdateRequest(values: CollectionFormValues): CollectionUpdateRequest {
  const cleanedDescription = values.description.trim();
  return {
    name: values.name.trim(),
    description: cleanedDescription.length > 0 ? cleanedDescription : null,
  };
}

export function applyCollectionApiErrorToForm(
  error: unknown,
  setError: UseFormSetError<CollectionFormValues>,
): CollectionFormErrorState {
  const parsed = isParsedApiErrorLike(error) ? error : parseApiError(error);
  let hasFieldErrors = false;

  for (const field of ALLOWED_COLLECTION_FIELDS) {
    const fieldMessage = Object.hasOwn(parsed.fieldErrors, field)
      ? parsed.fieldErrors[field]
      : undefined;
    if (fieldMessage) {
      setError(field, { type: 'server', message: fieldMessage });
      hasFieldErrors = true;
    }
  }

  return {
    bannerMessage: parsed.userMessage,
    hasFieldErrors,
    parsed,
  };
}