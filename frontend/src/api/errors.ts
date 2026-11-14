import type { ProblemDetail, ValidationErrorItem } from './client';

export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'bad_request'
  | 'server'
  | 'network'
  | 'unknown';

export interface ParsedApiError {
  kind: ApiErrorKind;
  status: number | null;
  title: string;
  detail: string;
  userMessage: string;
  fieldErrors: Record<string, string>;
  validationItems: ValidationErrorItem[];
  retryAfterSeconds: number | null;
  requestId: string | null;
  type: string;
  isRecoverable: boolean;
}

export function isProblemDetail(value: unknown): value is ProblemDetail {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'number' &&
    Number.isFinite(candidate.status) &&
    typeof candidate.detail === 'string'
  );
}

export function parseRetryAfter(headerValue: string | null | undefined): number | null {
  if (!headerValue) {
    return null;
  }
  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    return seconds > 0 ? seconds : null;
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diffSeconds = Math.ceil((dateMs - Date.now()) / 1000);
    return diffSeconds > 0 ? diffSeconds : null;
  }
  return null;
}

export function extractFieldErrors(
  errors: readonly ValidationErrorItem[] | null | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!errors) {
    return result;
  }
  for (const item of errors) {
    const key = item.field.trim();
    if (key && !Object.hasOwn(result, key)) {
      result[key] = item.message;
    }
  }
  return result;
}

function classifyStatus(status: number | null): ApiErrorKind {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'validation';
    case 429:
      return 'rate_limit';
    default:
      if (status !== null && status >= 500) {
        return 'server';
      }
      return 'unknown';
  }
}

export function parseApiError(
  error: unknown,
  response?: Pick<Response, 'status' | 'headers'> | null,
): ParsedApiError {
  const retryAfterSeconds = parseRetryAfter(response?.headers.get('Retry-After'));

  if (isProblemDetail(error)) {
    const status = error.status;
    const kind = classifyStatus(status);
    const validationItems = Array.isArray(error.errors) ? error.errors : [];
    const fieldErrors = extractFieldErrors(validationItems);

    let userMessage = error.detail || error.title;
    if (kind === 'rate_limit' && retryAfterSeconds !== null) {
      userMessage = `Muitas tentativas. Aguarde ${String(retryAfterSeconds)} segundos antes de tentar novamente.`;
    } else if (kind === 'server') {
      userMessage =
        'Não foi possível concluir a operação no servidor. Tente novamente em instantes.';
    }

    return {
      kind,
      status,
      title: error.title,
      detail: error.detail,
      userMessage,
      fieldErrors,
      validationItems,
      retryAfterSeconds,
      requestId: error.request_id ?? null,
      type: error.type || 'about:blank',
      isRecoverable: kind === 'rate_limit' || kind === 'server' || kind === 'network',
    };
  }

  if (
    error instanceof TypeError ||
    (error instanceof Error && /fetch|network/i.test(error.message))
  ) {
    return {
      kind: 'network',
      status: null,
      title: 'Falha de conexão',
      detail: 'Não foi possível conectar ao servidor.',
      userMessage: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
      fieldErrors: {},
      validationItems: [],
      retryAfterSeconds: null,
      requestId: null,
      type: 'about:blank',
      isRecoverable: true,
    };
  }

  const fallbackStatus = response?.status ?? null;
  const fallbackKind = classifyStatus(fallbackStatus);
  return {
    kind: fallbackKind,
    status: fallbackStatus,
    title: 'Erro inesperado',
    detail: 'Não foi possível concluir a solicitação.',
    userMessage:
      fallbackKind === 'rate_limit' && retryAfterSeconds !== null
        ? `Muitas tentativas. Aguarde ${String(retryAfterSeconds)} segundos antes de tentar novamente.`
        : 'Não foi possível concluir a solicitação. Tente novamente.',
    fieldErrors: {},
    validationItems: [],
    retryAfterSeconds,
    requestId: null,
    type: 'about:blank',
    isRecoverable: fallbackKind === 'server' || fallbackKind === 'rate_limit',
  };
}