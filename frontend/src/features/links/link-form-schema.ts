import type { FieldPath, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { parseApiError, type ParsedApiError } from '@/api/errors';
import type { LinkCreateRequest, LinkResponse, LinkUpdateRequest } from './links-api';

export const MAX_TAGS_PER_LINK = 30;
export const MAX_TAG_NAME_LENGTH = 60;

export function isValidHttpUrl(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.trim().length > 0
    );
  } catch {
    return false;
  }
}

export const linkFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Informe a URL de destino.')
    .max(2048, 'A URL deve ter no máximo 2048 caracteres.')
    .refine((value) => !/\s/.test(value), {
      message: 'A URL não pode conter espaços.',
    })
    .refine((value) => isValidHttpUrl(value), {
      message: 'A URL deve ser válida e utilizar http:// ou https://.',
    }),
  title: z
    .string()
    .trim()
    .min(1, 'Informe o título do link.')
    .max(300, 'O título deve ter no máximo 300 caracteres.'),
  description: z
    .string()
    .trim()
    .max(1000, 'A descrição deve ter no máximo 1000 caracteres.'),
  notes: z
    .string()
    .trim()
    .max(2000, 'As notas pessoais devem ter no máximo 2000 caracteres.'),
  collection_id: z.string(),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'O nome da tag não pode estar em branco.')
        .max(
          MAX_TAG_NAME_LENGTH,
          `Cada tag deve ter no máximo ${String(MAX_TAG_NAME_LENGTH)} caracteres.`,
        ),
    )
    .max(MAX_TAGS_PER_LINK, `Um link pode ter no máximo ${String(MAX_TAGS_PER_LINK)} tags.`),
});

export type LinkFormValues = z.infer<typeof linkFormSchema>;

export interface TagAdditionResult {
  tags: string[];
  error: string | null;
}

export function addUniqueTag(
  currentTags: readonly string[],
  rawCandidate: string,
): TagAdditionResult {
  const segments = rawCandidate
    .split(',')
    .map((part) => part.trim().replace(/^#+/, '').trim())
    .filter((part) => part.length > 0);

  if (segments.length === 0) {
    return { tags: [...currentTags], error: null };
  }

  const nextTags = [...currentTags];
  const seenLower = new Set(nextTags.map((tag) => tag.toLowerCase()));

  for (const segment of segments) {
    if (segment.length > MAX_TAG_NAME_LENGTH) {
      return {
        tags: [...currentTags],
        error: `Cada tag deve ter no máximo ${String(MAX_TAG_NAME_LENGTH)} caracteres.`,
      };
    }

    const lower = segment.toLowerCase();
    if (seenLower.has(lower)) {
      continue;
    }

    if (nextTags.length >= MAX_TAGS_PER_LINK) {
      return {
        tags: [...currentTags],
        error: `Um link pode ter no máximo ${String(MAX_TAGS_PER_LINK)} tags.`,
      };
    }

    nextTags.push(segment);
    seenLower.add(lower);
  }

  return { tags: nextTags, error: null };
}

export function removeTagByName(currentTags: readonly string[], tagNameToRemove: string): string[] {
  const targetLower = tagNameToRemove.trim().toLowerCase();
  return currentTags.filter((tag) => tag.toLowerCase() !== targetLower);
}

export function buildLinkFormDefaultValues(
  link?: LinkResponse | null,
  defaultCollectionId?: string,
): LinkFormValues {
  if (link) {
    return {
      url: link.url,
      title: link.title,
      description: link.description ?? '',
      notes: link.notes ?? '',
      collection_id: link.collection_id ?? '',
      tags: link.tags.map((tag) => tag.name),
    };
  }

  return {
    url: '',
    title: '',
    description: '',
    notes: '',
    collection_id: defaultCollectionId?.trim() ?? '',
    tags: [],
  };
}

export function toLinkCreateRequest(values: LinkFormValues): LinkCreateRequest {
  const cleanedDescription = values.description.trim();
  const cleanedNotes = values.notes.trim();
  const cleanedCollectionId = values.collection_id.trim();

  return {
    url: values.url.trim(),
    title: values.title.trim(),
    description: cleanedDescription.length > 0 ? cleanedDescription : null,
    notes: cleanedNotes.length > 0 ? cleanedNotes : null,
    collection_id: cleanedCollectionId.length > 0 ? cleanedCollectionId : null,
    tags: values.tags,
  };
}

export function toLinkUpdateRequest(values: LinkFormValues): LinkUpdateRequest {
  const cleanedDescription = values.description.trim();
  const cleanedNotes = values.notes.trim();
  const cleanedCollectionId = values.collection_id.trim();

  return {
    url: values.url.trim(),
    title: values.title.trim(),
    description: cleanedDescription.length > 0 ? cleanedDescription : null,
    notes: cleanedNotes.length > 0 ? cleanedNotes : null,
    collection_id: cleanedCollectionId.length > 0 ? cleanedCollectionId : null,
    tags: values.tags,
  };
}

export interface LinkFormErrorState {
  bannerMessage: string;
  hasFieldErrors: boolean;
  parsed: ParsedApiError;
}

const ALLOWED_LINK_FIELDS: readonly FieldPath<LinkFormValues>[] = [
  'url',
  'title',
  'description',
  'notes',
  'collection_id',
  'tags',
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

export function applyLinkApiErrorToForm(
  error: unknown,
  setError: UseFormSetError<LinkFormValues>,
): LinkFormErrorState {
  const parsed = isParsedApiErrorLike(error) ? error : parseApiError(error);
  let hasFieldErrors = false;

  for (const field of ALLOWED_LINK_FIELDS) {
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
