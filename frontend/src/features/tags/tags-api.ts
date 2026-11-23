import { apiClient, type ApiComponents } from '@/api/client';
import { parseApiError } from '@/api/errors';
import {
  LinksRequestError,
  TAGS_LIST_QUERY_KEY,
  fetchUserTags,
  type TagListResponse,
  type TagResponse,
} from '@/features/links/links-api';

export type TagCreateRequest = ApiComponents['schemas']['TagCreateRequest'];
export type TagUpdateRequest = ApiComponents['schemas']['TagUpdateRequest'];

export { TAGS_LIST_QUERY_KEY, fetchUserTags, type TagListResponse, type TagResponse };

export const TAGS_QUERY_KEY_PREFIX = ['tags'] as const;

export function buildLibraryTagFilterPath(tagName: string): string {
  return `/library?tag=${encodeURIComponent(tagName.trim())}`;
}

export function formatTagLinkCount(count: number | undefined): string {
  const safeCount =
    typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const padded = String(safeCount).padStart(3, '0');
  return safeCount === 1 ? `${padded} LINK` : `${padded} LINKS`;
}

export async function createTag(payload: TagCreateRequest): Promise<TagResponse> {
  let result: { data?: TagResponse; error?: unknown; response: Response };
  try {
    result = await apiClient.POST('/api/tags', { body: payload });
  } catch (caught) {
    throw new LinksRequestError(parseApiError(caught));
  }

  if (!result.response.ok || !result.data) {
    throw new LinksRequestError(parseApiError(result.error, result.response));
  }

  return result.data;
}

export async function updateTag(tagId: string, payload: TagUpdateRequest): Promise<TagResponse> {
  let result: { data?: TagResponse; error?: unknown; response: Response };
  try {
    result = await apiClient.PATCH('/api/tags/{tag_id}', {
      params: { path: { tag_id: tagId } },
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

export async function deleteTag(tagId: string): Promise<void> {
  let result: { error?: unknown; response: Response };
  try {
    result = await apiClient.DELETE('/api/tags/{tag_id}', {
      params: { path: { tag_id: tagId } },
    });
  } catch (caught) {
    throw new LinksRequestError(parseApiError(caught));
  }

  if (!result.response.ok) {
    throw new LinksRequestError(parseApiError(result.error, result.response));
  }
}
