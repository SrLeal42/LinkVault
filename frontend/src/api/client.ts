import createClient, { type Middleware } from 'openapi-fetch';
import type { components, operations, paths } from './schema';

export type ApiPaths = paths;
export type ApiComponents = components;
export type ApiOperations = operations;
export type ProblemDetail = components['schemas']['ProblemDetail'];
export type ValidationErrorItem = components['schemas']['ValidationErrorItem'];

export const CSRF_HEADER_NAME = 'X-CSRF-Token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

let csrfTokenInMemory: string | null = null;

export function getCsrfToken(): string | null {
  return csrfTokenInMemory;
}

export function setCsrfToken(token: string | null): void {
  csrfTokenInMemory = token;
}

export function applyCsrfHeader(request: Request): Request {
  const method = request.method.toUpperCase();
  if (!SAFE_METHODS.has(method) && csrfTokenInMemory !== null && csrfTokenInMemory !== '') {
    request.headers.set(CSRF_HEADER_NAME, csrfTokenInMemory);
  }
  return request;
}
export const csrfMiddleware: Middleware = {
  onRequest({ request }) {
    return applyCsrfHeader(request);
  },
};

export const apiClient = createClient<paths>({
  baseUrl: '',
  credentials: 'same-origin',
});

apiClient.use(csrfMiddleware);