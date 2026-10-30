from fastapi import FastAPI

from app.core.config import get_settings
from app.health.router import router as health_router


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/api/docs" if settings.show_docs else None,
        redoc_url="/api/redoc" if settings.show_docs else None,
        openapi_url="/api/openapi.json" if settings.show_docs else None,
    )

    app.include_router(health_router, prefix="/api")

    return app


app = create_app()
