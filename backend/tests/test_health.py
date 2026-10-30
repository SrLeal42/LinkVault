from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health_check_returns_ok() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_check_returns_ready_when_db_is_up() -> None:
    response = client.get("/api/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "ok"}
