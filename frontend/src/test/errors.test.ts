import { describe, expect, it } from 'vitest';
import {
  extractFieldErrors,
  isProblemDetail,
  parseApiError,
  parseRetryAfter,
} from '@/api/errors';

describe('isProblemDetail', () => {
  it('aceita objetos válidos no padrão RFC 9457', () => {
    expect(
      isProblemDetail({
        type: 'urn:linkvault:error:not_found',
        title: 'Não encontrado',
        status: 404,
        detail: 'Coleção não encontrada.',
      }),
    ).toBe(true);
  });

  it('rejeita null, primitivos e objetos incompletos', () => {
    expect(isProblemDetail(null)).toBe(false);
    expect(isProblemDetail('<html>502 Bad Gateway</html>')).toBe(false);
    expect(isProblemDetail({ title: 'Erro', status: '400', detail: 'Inválido' })).toBe(false);
    expect(isProblemDetail({ title: 'Erro', status: Number.NaN, detail: 'Inválido' })).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('interpreta segundos inteiros positivos', () => {
    expect(parseRetryAfter('45')).toBe(45);
    expect(parseRetryAfter(' 120 ')).toBe(120);
    expect(parseRetryAfter('0')).toBeNull();
    expect(parseRetryAfter('-5')).toBeNull();
  });

  it('interpreta datas HTTP futuras e ignora valores inválidos ou passados', () => {
    const futureDate = new Date(Date.now() + 30_000).toUTCString();
    const parsed = parseRetryAfter(futureDate);
    expect(parsed).not.toBeNull();
    expect(parsed ?? 0).toBeGreaterThanOrEqual(28);
    expect(parsed ?? 0).toBeLessThanOrEqual(31);

    expect(parseRetryAfter(new Date(Date.now() - 10_000).toUTCString())).toBeNull();
    expect(parseRetryAfter('nao-e-data')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe('extractFieldErrors', () => {
  it('mapeia campos preservando a primeira mensagem quando há múltiplos erros no mesmo campo', () => {
    const map = extractFieldErrors([
      { field: 'email', message: 'Informe um e-mail válido.', code: 'value_error' },
      { field: 'email', message: 'E-mail obrigatório.', code: 'missing' },
      { field: ' password ', message: 'Mínimo de 12 caracteres.', code: 'string_too_short' },
    ]);

    expect(map).toEqual({
      email: 'Informe um e-mail válido.',
      password: 'Mínimo de 12 caracteres.',
    });
  });

  it('retorna objeto vazio quando errors é null ou undefined', () => {
    expect(extractFieldErrors(null)).toEqual({});
    expect(extractFieldErrors(undefined)).toEqual({});
  });
});

describe('parseApiError', () => {
  it('normaliza erro 422 ProblemDetail com erros de validação por campo', () => {
    const problem = {
      type: 'urn:linkvault:error:validation_error',
      title: 'Erro de validação',
      status: 422,
      detail: 'Um ou mais campos enviados são inválidos.',
      request_id: 'req-abc-123',
      errors: [
        { field: 'url', message: 'Use http:// ou https://.', code: 'url_scheme' },
        { field: 'url', message: 'Campo obrigatório.', code: 'missing' },
      ],
    };

    const parsed = parseApiError(problem);

    expect(parsed.kind).toBe('validation');
    expect(parsed.status).toBe(422);
    expect(parsed.fieldErrors).toEqual({ url: 'Use http:// ou https://.' });
    expect(parsed.validationItems).toHaveLength(2);
    expect(parsed.requestId).toBe('req-abc-123');
    expect(parsed.isRecoverable).toBe(false);
  });

  it('normaliza erro 429 com cabeçalho Retry-After', () => {
    const problem = {
      type: 'urn:linkvault:error:rate_limit_exceeded',
      title: 'Limite de requisições excedido',
      status: 429,
      detail: 'Muitas tentativas. Tente novamente mais tarde.',
    };
    const response = {
      status: 429,
      headers: new Headers({ 'Retry-After': '30' }),
    };

    const parsed = parseApiError(problem, response);

    expect(parsed.kind).toBe('rate_limit');
    expect(parsed.retryAfterSeconds).toBe(30);
    expect(parsed.userMessage).toContain('30 segundos');
    expect(parsed.isRecoverable).toBe(true);
  });

  it('mascara detalhes internos em erro 500 e marca como recuperável', () => {
    const parsed = parseApiError({
      type: 'urn:linkvault:error:internal_server_error',
      title: 'Erro interno do servidor',
      status: 500,
      detail: 'Internal failure',
    });

    expect(parsed.kind).toBe('server');
    expect(parsed.userMessage).toBe(
      'Não foi possível concluir a operação no servidor. Tente novamente em instantes.',
    );
    expect(parsed.isRecoverable).toBe(true);
  });

  it('classifica falha de rede (TypeError) sem vazar mensagem técnica', () => {
    const parsed = parseApiError(new TypeError('Failed to fetch'));

    expect(parsed.kind).toBe('network');
    expect(parsed.status).toBeNull();
    expect(parsed.userMessage).not.toContain('Failed to fetch');
    expect(parsed.isRecoverable).toBe(true);
  });

  it('usa fallback seguro para respostas malformadas (ex.: HTML de gateway 502)', () => {
    const parsed = parseApiError('<html>502 Bad Gateway</html>', {
      status: 502,
      headers: new Headers(),
    });

    expect(parsed.kind).toBe('server');
    expect(parsed.status).toBe(502);
    expect(parsed.fieldErrors).toEqual({});
    expect(parsed.isRecoverable).toBe(true);
  });
});