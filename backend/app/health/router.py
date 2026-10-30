from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.db import check_database_connection, get_db
from app.health.schemas import HealthResponse, ReadyResponse

router = APIRouter(tags=["health"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/health", response_model=HealthResponse, summary="Verifica se o processo está ativo")
def health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get(
    "/ready",
    response_model=ReadyResponse,
    summary="Verifica se a aplicação e o banco de dados estão prontos",
)
def readiness_check(session: DbSession, response: Response) -> ReadyResponse:
    if check_database_connection(session):
        return ReadyResponse(status="ready", database="ok")

    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadyResponse(status="degraded", database="unreachable")
