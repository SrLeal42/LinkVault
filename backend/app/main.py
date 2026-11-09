from typing import Any

from fastapi import FastAPI

from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.core.errors import ProblemDetail, register_exception_handlers
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.security import CSRFMiddleware
from app.health.router import router as health_router


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    default_responses: dict[int | str, dict[str, Any]] = {
        400: {"model": ProblemDetail, "description": "Requisição inválida (RFC 9457)"},
        401: {
            "model": ProblemDetail,
            "description": "Não autenticado ou credenciais inválidas (RFC 9457)",
        },
        403: {
            "model": ProblemDetail,
            "description": "Acesso proibido ou CSRF bloqueado (RFC 9457)",
        },
        409: {"model": ProblemDetail, "description": "Conflito de dados (RFC 9457)"},
        422: {"model": ProblemDetail, "description": "Erro de validação (RFC 9457)"},
        500: {"model": ProblemDetail, "description": "Erro interno do servidor (RFC 9457)"},
    }

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/api/docs" if settings.show_docs else None,
        redoc_url="/api/redoc" if settings.show_docs else None,
        openapi_url="/api/openapi.json" if settings.show_docs else None,
        responses=default_responses,
    )

    app.add_middleware(CSRFMiddleware)
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)

    app.include_router(health_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")

    return app


app = create_app()
