import createClient, { type Middleware } from 'openapi-fetch';
import type { components, operations, paths } from './schema';

export type ApiPaths = paths;
export type ApiComponents = components;
export type ApiOperations = operations;
export type ProblemDetail = components['schemas']['ProblemDetail'];
export type ValidationErrorItem = components['schemas']['ValidationErrorItem'];

export const CSRF_HEADER_NAME = 'X-CSRF-Token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
const IGNORED_401_PATHS = new Set(['/api/auth/login', '/api/auth/password']);

export type UnauthorizedListener = () => void;

let csrfTokenInMemory: string | null = null;
let unauthorizedListener: UnauthorizedListener | null = null;

export function getCsrfToken(): string | null {
  return csrfTokenInMemory;
}

export function setCsrfToken(token: string | null): void {
  csrfTokenInMemory = token;
}

export function setUnauthorizedListener(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

export function applyCsrfHeader(request: Request): Request {
  const method = request.method.toUpperCase();
  if (!SAFE_METHODS.has(method) && csrfTokenInMemory !== null && csrfTokenInMemory !== '') {
    request.headers.set(CSRF_HEADER_NAME, csrfTokenInMemory);
  }
  return request;
}

export function handleAuthUnauthorizedResponse(request: Request, response: Response): Response {
  if (response.status !== 401) {
    return response;
  }

  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (IGNORED_401_PATHS.has(pathname)) {
    return response;
  }

  setCsrfToken(null);
  if (pathname !== '/api/auth/me') {
    unauthorizedListener?.();
  }
  return response;
}

export const csrfMiddleware: Middleware = {
  onRequest({ request }) {
    return applyCsrfHeader(request);
  },
  onResponse({ request, response }) {
    return handleAuthUnauthorizedResponse(request, response);
  },
};

export const apiClient = createClient<paths>({
  baseUrl: '',
  credentials: 'same-origin',
});

apiClient.use(csrfMiddleware);