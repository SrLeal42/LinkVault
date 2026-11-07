import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import REQUEST_ID_HEADER, get_request_id

PROBLEM_JSON_MEDIA_TYPE: str = "application/problem+json"
logger = logging.getLogger(__name__)


class ValidationErrorItem(BaseModel):
    field: str = Field(description="Caminho do campo inválido (ex.: 'email', 'url').")
    message: str = Field(description="Mensagem descritiva do erro de validação.")
    code: str = Field(description="Código identificador do tipo de erro.")


class ProblemDetail(BaseModel):
    type: str = Field(default="about:blank", description="URI que identifica o tipo de problema.")
    title: str = Field(description="Resumo curto e legível do tipo de problema.")
    status: int = Field(description="Código de status HTTP.")
    detail: str = Field(description="Explicação específica para esta ocorrência do problema.")
    instance: str | None = Field(default=None, description="URI da requisição que originou o erro.")
    request_id: str | None = Field(
        default=None, description="Identificador de correlação da requisição."
    )
    errors: list[ValidationErrorItem] | None = Field(
        default=None,
        description="Lista de campos inválidos quando tratar-se de erro de validação.",
    )


class AppError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        title: str,
        detail: str,
        error_type: str = "about:blank",
        headers: dict[str, str] | None = None,
        errors: list[ValidationErrorItem] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.title = title
        self.detail = detail
        self.error_type = error_type
        self.headers = headers
        self.errors = errors


class BadRequestError(AppError):
    def __init__(
        self,
        detail: str,
        title: str = "Requisição inválida",
        error_type: str = "urn:linkvault:error:bad_request",
        headers: dict[str, str] | None = None,
        errors: list[ValidationErrorItem] | None = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            title=title,
            detail=detail,
            error_type=error_type,
            headers=headers,
            errors=errors,
        )


class UnauthorizedError(AppError):
    def __init__(
        self,
        detail: str = "Autenticação necessária.",
        title: str = "Não autenticado",
        error_type: str = "urn:linkvault:error:unauthorized",
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            title=title,
            detail=detail,
            error_type=error_type,
            headers=headers,
        )


class ForbiddenError(AppError):
    def __init__(
        self,
        detail: str = "Acesso negado ao recurso solicitado.",
        title: str = "Acesso negado",
        error_type: str = "urn:linkvault:error:forbidden",
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            title=title,
            detail=detail,
            error_type=error_type,
            headers=headers,
        )


class NotFoundError(AppError):
    def __init__(
        self,
        detail: str = "Recurso não encontrado.",
        title: str = "Não encontrado",
        error_type: str = "urn:linkvault:error:not_found",
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            title=title,
            detail=detail,
            error_type=error_type,
            headers=headers,
        )


class ConflictError(AppError):
    def __init__(
        self,
        detail: str,
        title: str = "Conflito de dados",
        error_type: str = "urn:linkvault:error:conflict",
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            title=title,
            detail=detail,
            error_type=error_type,
            headers=headers,
        )


class RateLimitExceededError(AppError):
    def __init__(
        self,
        detail: str = "Muitas tentativas. Tente novamente mais tarde.",
        retry_after: int | None = None,
        title: str = "Limite de requisições excedido",
        error_type: str = "urn:linkvault:error:rate_limit_exceeded",
    ) -> None:
        headers = {"Retry-After": str(retry_after)} if retry_after is not None else None
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            title=title,
            detail=detail,
            error_type=error_type,
            headers=headers,
        )


def _extract_validation_items(exc: RequestValidationError) -> list[ValidationErrorItem]:
    items: list[ValidationErrorItem] = []
    for err in exc.errors():
        raw_loc = [str(part) for part in err.get("loc", ())]
        if len(raw_loc) > 1 and raw_loc[0] in {"body", "query", "path", "header", "cookie"}:
            field_path = ".".join(raw_loc[1:])
        elif raw_loc:
            field_path = ".".join(raw_loc)
        else:
            field_path = "body"

        items.append(
            ValidationErrorItem(
                field=field_path,
                message=str(err.get("msg", "Valor inválido.")),
                code=str(err.get("type", "validation_error")),
            )
        )
    return items


def build_problem_response(
    request: Request,
    *,
    status_code: int,
    title: str,
    detail: str,
    error_type: str = "about:blank",
    headers: dict[str, str] | None = None,
    errors: list[ValidationErrorItem] | None = None,
) -> JSONResponse:
    request_id = get_request_id() or getattr(request.state, "request_id", None)
    problem = ProblemDetail(
        type=error_type,
        title=title,
        status=status_code,
        detail=detail,
        instance=request.url.path,
        request_id=request_id,
        errors=errors,
    )

    response_headers: dict[str, str] = {}
    if headers:
        response_headers.update(headers)
    if request_id:
        response_headers[REQUEST_ID_HEADER] = request_id

    return JSONResponse(
        content=problem.model_dump(exclude_none=True),
        status_code=status_code,
        media_type=PROBLEM_JSON_MEDIA_TYPE,
        headers=response_headers,
    )


def app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return build_problem_response(
        request,
        status_code=exc.status_code,
        title=exc.title,
        detail=exc.detail,
        error_type=exc.error_type,
        headers=exc.headers,
        errors=exc.errors,
    )


def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return build_problem_response(
        request,
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        title="Erro de validação",
        detail="Um ou mais campos enviados são inválidos.",
        error_type="urn:linkvault:error:validation_error",
        errors=_extract_validation_items(exc),
    )


def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    title_mapping: dict[int, str] = {
        status.HTTP_404_NOT_FOUND: "Não encontrado",
        status.HTTP_405_METHOD_NOT_ALLOWED: "Método não permitido",
    }
    title = title_mapping.get(exc.status_code, "Erro na requisição")
    detail = str(exc.detail) if exc.detail else title

    return build_problem_response(
        request,
        status_code=exc.status_code,
        title=title,
        detail=detail,
        error_type="urn:linkvault:error:http_error",
        headers=getattr(exc, "headers", None),
    )


def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Exceção não tratada na requisição HTTP", exc_info=exc)
    return build_problem_response(
        request,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        title="Erro interno do servidor",
        detail="Ocorreu um erro interno inesperado. Tente novamente mais tarde.",
        error_type="urn:linkvault:error:internal_server_error",
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)