import { apiClient, type ApiComponents } from '@/api/client';
import { parseApiError } from '@/api/errors';
import {
  COLLECTIONS_LIST_QUERY_KEY,
  DEFAULT_LINK_SORT,
  LinksRequestError,
  fetchUserCollections,
  isLinkSortOption,
  type CollectionListResponse,
  type CollectionResponse,
  type LinkSortOption,
} from '@/features/links/links-api';

export type CollectionCreateRequest = ApiComponents['schemas']['CollectionCreateRequest'];
export type CollectionUpdateRequest = ApiComponents['schemas']['CollectionUpdateRequest'];
export type CollectionVisibility = ApiComponents['schemas']['CollectionVisibility'];

export {
  COLLECTIONS_LIST_QUERY_KEY,
  fetchUserCollections,
  type CollectionListResponse,
  type CollectionResponse,
};

export const COLLECTIONS_QUERY_KEY_PREFIX = ['collections'] as const;

export function buildCollectionDetailQueryKey(
  collectionId: string,
): readonly [string, string, string] {
  return ['collections', 'detail', collectionId] as const;
}

export function buildCollectionDetailPath(collectionId: string): string {
  return `/collections/${encodeURIComponent(collectionId)}`;
}

export function formatCollectionLinkCount(count: number): string {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const padded = String(safeCount).padStart(3, '0');
  return safeCount === 1 ? `${padded} LINK` : `${padded} LINKS`;
}

export interface CollectionLinksFilterState {
  q: string;
  tag: string;
  sort: LinkSortOption;
}

export function parseCollectionSearchParams(
  searchParams: URLSearchParams,
): CollectionLinksFilterState {
  const rawSort = searchParams.get('sort');
  return {
    q: searchParams.get('q')?.trim() ?? '',
    tag: searchParams.get('tag')?.trim() ?? '',
    sort: isLinkSortOption(rawSort) ? rawSort : DEFAULT_LINK_SORT,
  };
}

export function buildCollectionSearchParams(
  current: URLSearchParams,
  patch: Partial<CollectionLinksFilterState>,
): URLSearchParams {
  const base = parseCollectionSearchParams(current);
  const next: CollectionLinksFilterState = {
    q: patch.q !== undefined ? patch.q.trim() : base.q,
    tag: patch.tag !== undefined ? patch.tag.trim() : base.tag,
    sort: patch.sort ?? base.sort,
  };

  const result = new URLSearchParams();
  if (next.q.length > 0) {
    result.set('q', next.q);
  }
  if (next.tag.length > 0) {
    result.set('tag', next.tag);
  }
  if (next.sort !== DEFAULT_LINK_SORT) {
    result.set('sort', next.sort);
  }

  return result;
}

export function hasActiveCollectionFilters(filters: CollectionLinksFilterState): boolean {
  return filters.q.length > 0 || filters.tag.length > 0;
}

export async function fetchCollectionById(
  collectionId: string,
  signal?: AbortSignal,
): Promise<CollectionResponse> {
  let result: { data?: CollectionResponse; error?: unknown; response: Response };
  try {
    result = await apiClient.GET('/api/collections/{collection_id}', {
      params: { path: { collection_id: collectionId } },
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

export async function createCollection(
  payload: CollectionCreateRequest,
): Promise<CollectionResponse> {
  let result: { data?: CollectionResponse; error?: unknown; response: Response };
  try {
    result = await apiClient.POST('/api/collections', { body: payload });
  } catch (caught) {
    throw new LinksRequestError(parseApiError(caught));
  }

  if (!result.response.ok || !result.data) {
    throw new LinksRequestError(parseApiError(result.error, result.response));
  }

  return result.data;
}

export async function updateCollection(
  collectionId: string,
  payload: CollectionUpdateRequest,
): Promise<CollectionResponse> {
  let result: { data?: CollectionResponse; error?: unknown; response: Response };
  try {
    result = await apiClient.PATCH('/api/collections/{collection_id}', {
      params: { path: { collection_id: collectionId } },
      body: payload,
    });
  } catch (caught) {
    throw new LinksRequestError(parseApiError(caught));
  }

  if (!result.response.ok || !result.data) {
    throw new LinksRequestError(parseApiError(result.error, result.response));
  }

  return result.data;
}

export async function deleteCollection(collectionId: string): Promise<void> {
  let result: { error?: unknown; response: Response };
  try {
    result = await apiClient.DELETE('/api/collections/{collection_id}', {
      params: { path: { collection_id: collectionId } },
    });
  } catch (caught) {
    throw new LinksRequestError(parseApiError(caught));
  }

  if (!result.response.ok) {
    throw new LinksRequestError(parseApiError(result.error, result.response));
  }
}