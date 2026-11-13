import uuid
from collections.abc import Generator

import pytest
from app.core.db import get_db
from app.links.models import Link, LinkTag
from app.main import app
from app.tags.models import Tag
from app.tags.service import get_or_create_tags_by_names
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.conftest import DEFAULT_TEST_ORIGIN


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app, headers={"Origin": DEFAULT_TEST_ORIGIN})
    finally:
        app.dependency_overrides.clear()


def _register_and_get_credentials(client: TestClient, email: str) -> tuple[str, str, uuid.UUID]:
    res = client.post(
        "/api/auth/register",
        json={"email": email, "password": "valid_secure_password_123"},
    )
    assert res.status_code == 201
    cookie = res.cookies["linkvault_session"]
    data = res.json()
    return cookie, str(data["csrf_token"]), uuid.UUID(str(data["user"]["id"]))


def test_tags_crud_and_case_insensitive_ordering(client: TestClient) -> None:
    cookie, csrf, _ = _register_and_get_credentials(client, "tags_crud@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    res_z = client.post(
        "/api/tags",
        json={"name": "  zsh  "},
        headers={"X-CSRF-Token": csrf},
    )
    assert res_z.status_code == 201
    assert res_z.json()["name"] == "zsh"

    res_a = client.post(
        "/api/tags",
        json={"name": "AsyncIO"},
        headers={"X-CSRF-Token": csrf},
    )
    assert res_a.status_code == 201

    list_res = client.get("/api/tags")
    assert list_res.status_code == 200
    assert [item["name"] for item in list_res.json()["items"]] == ["AsyncIO", "zsh"]

    # Validação de nome em branco e campo extra
    assert (
        client.post("/api/tags", json={"name": "   "}, headers={"X-CSRF-Token": csrf}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/tags",
            json={"name": "ok", "extra": 1},
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 422
    )


def test_tags_unique_case_insensitive_per_user_and_allowed_across_users(
    client: TestClient,
) -> None:
    cookie_a, csrf_a, _ = _register_and_get_credentials(client, "tag_uniq_a@linkvault.io")
    cookie_b, csrf_b, _ = _register_and_get_credentials(client, "tag_uniq_b@linkvault.io")

    client.cookies.set("linkvault_session", cookie_a)
    res_a1 = client.post("/api/tags", json={"name": "FastAPI"}, headers={"X-CSRF-Token": csrf_a})
    assert res_a1.status_code == 201

    # Mesmo usuário tentando variação de caixa -> 409 Conflict
    res_dup = client.post(
        "/api/tags",
        json={"name": "  fastapi  "},
        headers={"X-CSRF-Token": csrf_a},
    )
    assert res_dup.status_code == 409
    assert res_dup.headers["content-type"] == "application/problem+json"
    assert res_dup.json()["type"] == "urn:linkvault:error:conflict"

    # Outro usuário pode criar a mesma tag sem conflito
    client.cookies.set("linkvault_session", cookie_b)
    res_b1 = client.post("/api/tags", json={"name": "FastAPI"}, headers={"X-CSRF-Token": csrf_b})
    assert res_b1.status_code == 201


def test_update_tag_allows_own_case_change_and_blocks_collision(client: TestClient) -> None:
    cookie, csrf, _ = _register_and_get_credentials(client, "tag_patch@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    t1 = client.post("/api/tags", json={"name": "python"}, headers={"X-CSRF-Token": csrf}).json()
    client.post("/api/tags", json={"name": "docker"}, headers={"X-CSRF-Token": csrf})

    # Alterar apenas maiúsculas/minúsculas da própria tag é permitido
    res_case = client.patch(
        f"/api/tags/{t1['id']}",
        json={"name": "  Python  "},
        headers={"X-CSRF-Token": csrf},
    )
    assert res_case.status_code == 200
    assert res_case.json()["name"] == "Python"

    # Renomear colidindo com outra tag existente -> 409 Conflict
    res_conflict = client.patch(
        f"/api/tags/{t1['id']}",
        json={"name": "DOCKER"},
        headers={"X-CSRF-Token": csrf},
    )
    assert res_conflict.status_code == 409


def test_get_or_create_tags_by_names_is_idempotent_and_preserves_existing_case(
    client: TestClient,
    db_session: Session,
) -> None:
    cookie, csrf, user_id = _register_and_get_credentials(client, "tag_batch@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    # Cria tag pré-existente com capitalização específica
    res = client.post("/api/tags", json={"name": "FastAPI"}, headers={"X-CSRF-Token": csrf})
    assert res.status_code == 201

    assert get_or_create_tags_by_names(db_session, user_id=user_id, names=[]) == []
    assert get_or_create_tags_by_names(db_session, user_id=user_id, names=["   ", ""]) == []

    tags = get_or_create_tags_by_names(
        db_session,
        user_id=user_id,
        names=["fastapi", "PostgreSQL", "POSTGRESQL", "   ", "Docker"],
    )
    db_session.commit()

    assert [t.name for t in tags] == ["Docker", "FastAPI", "PostgreSQL"]

    # Execução repetida não duplica e mantém registros idênticos
    tags_again = get_or_create_tags_by_names(
        db_session,
        user_id=user_id,
        names=["docker", "FASTAPI", "postgresql"],
    )
    assert [t.id for t in tags_again] == [t.id for t in tags]


def test_delete_tag_removes_link_associations_and_preserves_link(
    client: TestClient,
    db_session: Session,
) -> None:
    cookie, csrf, user_id = _register_and_get_credentials(client, "tag_delete@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    res_tag = client.post(
        "/api/tags",
        json={"name": "TempTag"},
        headers={"X-CSRF-Token": csrf},
    )
    tag_id = uuid.UUID(str(res_tag.json()["id"]))
    link = Link(user_id=user_id, url="https://example.com/keep", title="Link intacto")
    db_session.add(link)
    db_session.flush()
    db_session.add(LinkTag(link_id=link.id, tag_id=tag_id, user_id=user_id))
    db_session.commit()
    link_id = link.id

    del_res = client.delete(f"/api/tags/{tag_id}", headers={"X-CSRF-Token": csrf})
    assert del_res.status_code == 204
    assert del_res.text == ""

    db_session.expire_all()
    assert db_session.scalar(select(Tag).where(Tag.id == tag_id)) is None
    assert db_session.scalar(select(LinkTag).where(LinkTag.tag_id == tag_id)) is None
    assert db_session.scalar(select(Link).where(Link.id == link_id)) is not None


def test_tags_cross_user_isolation_and_auth_csrf(client: TestClient) -> None:
    assert client.get("/api/tags").status_code == 401
    assert client.post("/api/tags", json={"name": "NoAuth"}).status_code == 401

    cookie_a, csrf_a, _ = _register_and_get_credentials(client, "tag_iso_a@linkvault.io")
    cookie_b, csrf_b, _ = _register_and_get_credentials(client, "tag_iso_b@linkvault.io")

    client.cookies.set("linkvault_session", cookie_a)
    assert client.post("/api/tags", json={"name": "NoCSRF"}).status_code == 403

    tag_a_id = client.post(
        "/api/tags",
        json={"name": "PrivadaDeA"},
        headers={"X-CSRF-Token": csrf_a},
    ).json()["id"]

    # Usuário B não vê nem altera tag de A -> 404
    client.cookies.set("linkvault_session", cookie_b)
    assert client.get("/api/tags").json()["items"] == []
    assert (
        client.patch(
            f"/api/tags/{tag_a_id}",
            json={"name": "Hacked"},
            headers={"X-CSRF-Token": csrf_b},
        ).status_code
        == 404
    )
    res_del = client.delete(
        f"/api/tags/{tag_a_id}",
        headers={"X-CSRF-Token": csrf_b},
    )
    assert res_del.status_code == 404
