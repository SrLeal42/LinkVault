import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from app.auth.router import router as auth_router
from app.auth.service import cleanup_expired_demo_users
from app.collections.router import router as collections_router
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.errors import ProblemDetail, register_exception_handlers
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.security import CSRFMiddleware
from app.health.router import router as health_router
from app.links.router import router as links_router
from app.tags.router import router as tags_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    try:
        with SessionLocal() as session:
            removed = cleanup_expired_demo_users(session)
            session.commit()
            if removed > 0:
                logger.info(
                    "startup.demo_cleanup.completed",
                    extra={"event_data": {"removed_demo_users": removed}},
                )
    except Exception:
        logger.warning("startup.demo_cleanup.failed", exc_info=True)
    yield


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
        404: {"model": ProblemDetail, "description": "Recurso não encontrado (RFC 9457)"},
        409: {"model": ProblemDetail, "description": "Conflito de dados (RFC 9457)"},
        422: {"model": ProblemDetail, "description": "Erro de validação (RFC 9457)"},
        429: {
            "model": ProblemDetail,
            "description": "Limite de requisições excedido (RFC 9457)",
        },
        500: {"model": ProblemDetail, "description": "Erro interno do servidor (RFC 9457)"},
    }

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
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
    app.include_router(collections_router, prefix="/api")
    app.include_router(links_router, prefix="/api")
    app.include_router(tags_router, prefix="/api")

    return app


app = create_app()
