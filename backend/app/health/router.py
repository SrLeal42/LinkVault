from fastapi import APIRouter

from app.health.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Verifica se o processo está ativo")
def health_check() -> HealthResponse:
    return HealthResponse(status="ok")
