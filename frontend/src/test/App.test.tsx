import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import {
  CSRF_HEADER_NAME,
  applyCsrfHeader,
  csrfMiddleware,
  getCsrfToken,
  setCsrfToken,
} from '@/api/client';

describe('App Smoke Test', () => {
  it('renderiza o título da aplicação corretamente', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'LinkVault' })).toBeInTheDocument();
  });
});

describe('csrfMiddleware e applyCsrfHeader', () => {
  beforeEach(() => {
    setCsrfToken(null);
  });

  it('gerencia estado do token CSRF em memória', () => {
    expect(getCsrfToken()).toBeNull();
    setCsrfToken('test-token-123');
    expect(getCsrfToken()).toBe('test-token-123');
  });

  it('não anexa header CSRF em requisições GET mesmo com token definido', () => {
    setCsrfToken('test-token-123');
    const request = new Request('http://localhost/api/health', { method: 'GET' });
    const result = applyCsrfHeader(request);

    expect(result.headers.get(CSRF_HEADER_NAME)).toBeNull();
  });

  it('anexa header CSRF em requisições mutáveis quando token estiver presente', () => {
    setCsrfToken('secure-csrf-token');
    const request = new Request('http://localhost/api/auth/logout', { method: 'POST' });
    const result = applyCsrfHeader(request);

    expect(result.headers.get(CSRF_HEADER_NAME)).toBe('secure-csrf-token');
  });

  it('expõe onRequest no objeto csrfMiddleware', () => {
    expect(typeof csrfMiddleware.onRequest).toBe('function');
  });
});