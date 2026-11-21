import { apiClient, type ApiComponents, type ValidationErrorItem } from '@/api/client';
import { parseApiError, type ApiErrorKind, type ParsedApiError } from '@/api/errors';

export type LinkResponse = ApiComponents['schemas']['LinkResponse'];
export type LinkListResponse = ApiComponents['schemas']['LinkListResponse'];
export type LinkSortOption = ApiComponents['schemas']['LinkSortOption'];
export type CollectionResponse = ApiComponents['schemas']['CollectionResponse'];
export type CollectionListResponse = ApiComponents['schemas']['CollectionListResponse'];
export type TagResponse = ApiComponents['schemas']['TagResponse'];
export type TagListResponse = ApiComponents['schemas']['TagListResponse'];

export const DEFAULT_LINK_SORT: LinkSortOption = 'created_desc';
export const DEFAULT_LINKS_PAGE_LIMIT = 20;

export interface LinkSortOptionMeta {
  readonly value: LinkSortOption;
  readonly label: string;
}

export const LINK_SORT_OPTIONS: readonly LinkSortOptionMeta[] = [
  { value: 'created_desc', label: 'Mais recentes' },
  { value: 'created_asc', label: 'Mais antigos' },
  { value: 'title_asc', label: 'Título (A–Z)' },
  { value: 'title_desc', label: 'Título (Z–A)' },
  { value: 'updated_desc', label: 'Última atualização' },
] as const;

const VALID_SORT_VALUES = new Set<string>(LINK_SORT_OPTIONS.map((option) => option.value));

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

export interface LibraryFilterState {
  q: string;
  collectionId: string;
  tag: string;
  sort: LinkSortOption;
}

export interface FetchLinksPageParams {
  q?: string;
  collectionId?: string;
  tag?: string;
  sort?: LinkSortOption;
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
}

export const LINKS_QUERY_KEY_PREFIX = ['links'] as const;
export const COLLECTIONS_LIST_QUERY_KEY = ['collections', 'list'] as const;
export const TAGS_LIST_QUERY_KEY = ['tags', 'list'] as const;

export class LinksRequestError extends Error implements ParsedApiError {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly title: string;
  readonly detail: string;
  readonly userMessage: string;
  readonly fieldErrors: Record<string, string>;
  readonly validationItems: ValidationErrorItem[];
  readonly retryAfterSeconds: number | null;
  readonly requestId: string | null;
  readonly type: string;
  readonly isRecoverable: boolean;

  constructor(parsed: ParsedApiError) {
    super(parsed.userMessage);
    this.name = 'LinksRequestError';
    this.kind = parsed.kind;
    this.status = parsed.status;
    this.title = parsed.title;
    this.detail = parsed.detail;
    this.userMessage = parsed.userMessage;
    this.fieldErrors = parsed.fieldErrors;
    this.validationItems = parsed.validationItems;
    this.retryAfterSeconds = parsed.retryAfterSeconds;
    this.requestId = parsed.requestId;
    this.type = parsed.type;
    this.isRecoverable = parsed.isRecoverable;
  }
}

export function isLinkSortOption(value: unknown): value is LinkSortOption {
  return typeof value === 'string' && VALID_SORT_VALUES.has(value);
}

export function buildLinksListQueryKey(
  filters: LibraryFilterState,
  limit: number = DEFAULT_LINKS_PAGE_LIMIT,
): readonly unknown[] {
  return [
    ...LINKS_QUERY_KEY_PREFIX,
    'list',
    {
      q: filters.q,
      collectionId: filters.collectionId,
      tag: filters.tag,
      sort: filters.sort,
      limit,
    },
  ] as const;
}

export function parseLibrarySearchParams(searchParams: URLSearchParams): LibraryFilterState {
  const rawSort = searchParams.get('sort');
  return {
    q: searchParams.get('q')?.trim() ?? '',
    collectionId: searchParams.get('collection_id')?.trim() ?? '',
    tag: searchParams.get('tag')?.trim() ?? '',
    sort: isLinkSortOption(rawSort) ? rawSort : DEFAULT_LINK_SORT,
  };
}

export function buildLibrarySearchParams(
  current: URLSearchParams,
  patch: Partial<LibraryFilterState>,
): URLSearchParams {
  const base = parseLibrarySearchParams(current);
  const next: LibraryFilterState = {
    q: patch.q !== undefined ? patch.q.trim() : base.q,
    collectionId: patch.collectionId !== undefined ? patch.collectionId.trim() : base.collectionId,
    tag: patch.tag !== undefined ? patch.tag.trim() : base.tag,
    sort: patch.sort ?? base.sort,
  };

  const result = new URLSearchParams();
  if (next.q.length > 0) {
    result.set('q', next.q);
  }
  if (next.collectionId.length > 0) {
    result.set('collection_id', next.collectionId);
  }
  if (next.tag.length > 0) {
    result.set('tag', next.tag);
  }
  if (next.sort !== DEFAULT_LINK_SORT) {
    result.set('sort', next.sort);
  }

  return result;
}

export function hasActiveLibraryFilters(filters: LibraryFilterState): boolean {
  return filters.q.length > 0 || filters.collectionId.length > 0 || filters.tag.length > 0;
}

export function extractUrlHostname(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return rawUrl;
  }
}

export function formatEditorialDate(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return '';
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = PT_BR_MONTHS[date.getUTCMonth()] ?? '';
  const year = String(date.getUTCFullYear());
  return `${day} ${month} ${year}`;
}

export async function fetchLinksPage({
  q,
  collectionId,
  tag,
  sort = DEFAULT_LINK_SORT,
  limit = DEFAULT_LINKS_PAGE_LIMIT,
  cursor,
  signal,
}: FetchLinksPageParams): Promise<LinkListResponse> {
  const query: {
    q?: string;
    collection_id?: string;
    tag?: string;
    sort: LinkSortOption;
    limit: number;
    cursor?: string;
  } = {
    sort,
    limit,
  };

  const cleanedQ = q?.trim() ?? '';
  if (cleanedQ.length > 0) {
    query.q = cleanedQ;
  }
  const cleanedCollectionId = collectionId?.trim() ?? '';
  if (cleanedCollectionId.length > 0) {
    query.collection_id = cleanedCollectionId;
  }
  const cleanedTag = tag?.trim() ?? '';
  if (cleanedTag.length > 0) {
    query.tag = cleanedTag;
  }
  const cleanedCursor = cursor?.trim() ?? '';
  if (cleanedCursor.length > 0) {
    query.cursor = cleanedCursor;
  }

  let result: { data?: LinkListResponse; error?: unknown; response: Response };
  try {
    result = await apiClient.GET('/api/links', {
      params: { query },
      signal,
    });
  } catch (caught) {
    throw new LinksRequestError(parseApiError(caught));
  }

  if (!result.response.ok || !result.data) {
    throw new LinksRequestError(parseApiError(result.error, result.response));
  }

  return result.data;
}

export async function fetchUserCollections(signal?: AbortSignal): Promise<CollectionResponse[]> {
  let result: { data?: CollectionListResponse; error?: unknown; response: Response };
  try {
    result = await apiClient.GET('/api/collections', { signal });
  } catch (caught) {
    throw new LinksRequestError(parseApiError(caught));
  }

  if (!result.response.ok || !result.data) {
    throw new LinksRequestError(parseApiError(result.error, result.response));
  }

  return result.data.items;
}

export async function fetchUserTags(signal?: AbortSignal): Promise<TagResponse[]> {
  let result: { data?: TagListResponse; error?: unknown; response: Response };
  try {
    result = await apiClient.GET('/api/tags', { signal });
  } catch (caught) {
    throw new LinksRequestError(parseApiError(caught));
  }

  if (!result.response.ok || !result.data) {
    throw new LinksRequestError(parseApiError(result.error, result.response));
  }

  return result.data.items;
}