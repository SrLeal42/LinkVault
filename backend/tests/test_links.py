import uuid
from collections.abc import Generator

import pytest
from app.core.db import get_db
from app.links.models import Link, LinkTag
from app.main import app
from app.tags.models import Tag
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


def test_links_crud_with_collection_and_tag_names(client: TestClient) -> None:
    cookie, csrf, _ = _register_and_get_credentials(client, "links_crud@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    col_res = client.post(
        "/api/collections",
        json={"name": "Estudos Python"},
        headers={"X-CSRF-Token": csrf},
    )
    assert col_res.status_code == 201
    col_id = col_res.json()["id"]

    # Pré-cria uma tag para verificar reaproveitamento preservando capitalização original
    tag_res = client.post(
        "/api/tags",
        json={"name": "FastAPI"},
        headers={"X-CSRF-Token": csrf},
    )
    assert tag_res.status_code == 201

    # Cria primeiro link sem coleção e sem tags
    res1 = client.post(
        "/api/links",
        json={
            "url": "  https://docs.python.org/3/  ",
            "title": "  Python Docs  ",
            "description": "  Documentação padrão  ",
            "notes": "  Nota privada  ",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert res1.status_code == 201
    link1 = res1.json()
    assert link1["url"] == "https://docs.python.org/3/"
    assert link1["title"] == "Python Docs"
    assert link1["description"] == "Documentação padrão"
    assert link1["notes"] == "Nota privada"
    assert link1["collection_id"] is None
    assert link1["tags"] == []

    # Cria segundo link com coleção e tags (misturando tag existente e novas duplicadas)
    res2 = client.post(
        "/api/links",
        json={
            "url": "http://fastapi.tiangolo.com",
            "title": "FastAPI Docs",
            "collection_id": col_id,
            "tags": ["fastapi", "Backend", "BACKEND"],
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert res2.status_code == 201
    link2 = res2.json()
    assert link2["collection_id"] == col_id
    assert [t["name"] for t in link2["tags"]] == ["Backend", "FastAPI"]

    # Listagem ordenada por created_at DESC, id DESC
    list_res = client.get("/api/links")
    assert list_res.status_code == 200
    body = list_res.json()
    assert body["next_cursor"] is None
    assert [item["id"] for item in body["items"]] == [link2["id"], link1["id"]]

    # Consulta individual
    get_res = client.get(f"/api/links/{link2['id']}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "FastAPI Docs"
    assert [t["name"] for t in get_res.json()["tags"]] == ["Backend", "FastAPI"]

    # Exclusão
    del_res = client.delete(f"/api/links/{link2['id']}", headers={"X-CSRF-Token": csrf})
    assert del_res.status_code == 204
    assert client.get(f"/api/links/{link2['id']}").status_code == 404


def test_links_reject_malicious_and_invalid_urls(client: TestClient) -> None:
    cookie, csrf, _ = _register_and_get_credentials(client, "links_url@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    invalid_urls = [
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "ftp://files.example.com/archive.zip",
        "file:///etc/passwd",
        "http://",
        "https://example.com/with spaces",
        "   ",
        "example.com/sem-esquema",
    ]
    for bad_url in invalid_urls:
        res = client.post(
            "/api/links",
            json={"url": bad_url, "title": "URL inválida"},
            headers={"X-CSRF-Token": csrf},
        )
        assert res.status_code == 422, f"URL deveria ser rejeitada: {bad_url}"


def test_create_and_update_link_atomicity_with_foreign_or_missing_collection(
    client: TestClient,
    db_session: Session,
) -> None:
    cookie_a, csrf_a, _ = _register_and_get_credentials(client, "links_atom_a@linkvault.io")
    cookie_b, csrf_b, user_b_id = _register_and_get_credentials(client, "links_atom_b@linkvault.io")

    # Usuário A cria uma coleção privada
    client.cookies.set("linkvault_session", cookie_a)
    col_a_id = client.post(
        "/api/collections",
        json={"name": "Coleção de A"},
        headers={"X-CSRF-Token": csrf_a},
    ).json()["id"]

    # Usuário B tenta criar link apontando para a coleção de A + tags novas
    client.cookies.set("linkvault_session", cookie_b)
    res_create = client.post(
        "/api/links",
        json={
            "url": "https://example.com",
            "title": "Invasão",
            "collection_id": col_a_id,
            "tags": ["TagOrfaNaoCriada"],
        },
        headers={"X-CSRF-Token": csrf_b},
    )
    assert res_create.status_code == 404

    # Verifica que nenhum link nem tag órfã foi gravado para Usuário B
    assert db_session.scalar(select(Link).where(Link.user_id == user_b_id)) is None
    assert db_session.scalar(select(Tag).where(Tag.user_id == user_b_id)) is None

    # Usuário B cria um link válido e depois tenta mover para coleção de A no PATCH
    link_b_id = client.post(
        "/api/links",
        json={"url": "https://example.com/b", "title": "Link de B"},
        headers={"X-CSRF-Token": csrf_b},
    ).json()["id"]

    res_patch = client.patch(
        f"/api/links/{link_b_id}",
        json={"collection_id": col_a_id, "tags": ["OutraTagOrfa"]},
        headers={"X-CSRF-Token": csrf_b},
    )
    assert res_patch.status_code == 404
    assert db_session.scalar(select(Tag).where(Tag.user_id == user_b_id)) is None


def test_update_link_partial_patch_semantics_for_fields_collection_and_tags(
    client: TestClient,
    db_session: Session,
) -> None:
    cookie, csrf, user_id = _register_and_get_credentials(client, "links_patch@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    col_id = client.post(
        "/api/collections",
        json={"name": "Coleção Alvo"},
        headers={"X-CSRF-Token": csrf},
    ).json()["id"]

    created = client.post(
        "/api/links",
        json={
            "url": "https://example.com/v1",
            "title": "Título v1",
            "description": "Descrição v1",
            "notes": "Nota v1",
            "collection_id": col_id,
            "tags": ["Alpha", "Beta"],
        },
        headers={"X-CSRF-Token": csrf},
    ).json()
    link_id = created["id"]

    # 1. PATCH omitindo tags e collection_id preserva ambos
    res_title = client.patch(
        f"/api/links/{link_id}",
        json={"title": "  Título v2  "},
        headers={"X-CSRF-Token": csrf},
    )
    assert res_title.status_code == 200
    body1 = res_title.json()
    assert body1["title"] == "Título v2"
    assert body1["url"] == "https://example.com/v1"
    assert body1["collection_id"] == col_id
    assert [t["name"] for t in body1["tags"]] == ["Alpha", "Beta"]

    # 2. PATCH substituindo tags
    res_tags = client.patch(
        f"/api/links/{link_id}",
        json={"tags": ["Gamma"]},
        headers={"X-CSRF-Token": csrf},
    )
    assert res_tags.status_code == 200
    assert [t["name"] for t in res_tags.json()["tags"]] == ["Gamma"]

    # 3. PATCH com tags=[] remove associações mas preserva tags cadastradas do usuário
    res_clear_tags = client.patch(
        f"/api/links/{link_id}",
        json={"tags": []},
        headers={"X-CSRF-Token": csrf},
    )
    assert res_clear_tags.status_code == 200
    assert res_clear_tags.json()["tags"] == []
    assert (
        db_session.scalar(select(LinkTag).where(LinkTag.link_id == uuid.UUID(str(link_id)))) is None
    )
    user_tags = db_session.scalars(select(Tag).where(Tag.user_id == user_id)).all()
    assert {t.name for t in user_tags} == {"Alpha", "Beta", "Gamma"}

    # 4. PATCH limpando collection_id, description e notes
    res_clear_fields = client.patch(
        f"/api/links/{link_id}",
        json={"collection_id": None, "description": None, "notes": "   "},
        headers={"X-CSRF-Token": csrf},
    )
    assert res_clear_fields.status_code == 200
    cleared = res_clear_fields.json()
    assert cleared["collection_id"] is None
    assert cleared["description"] is None
    assert cleared["notes"] is None

    # 5. Rejeita null explícito em campos obrigatórios e URL inválida no PATCH
    for bad_payload in [
        {"tags": None},
        {"url": None},
        {"title": None},
        {"url": "javascript:alert(1)"},
        {"title": "   "},
    ]:
        res_bad = client.patch(
            f"/api/links/{link_id}",
            json=bad_payload,
            headers={"X-CSRF-Token": csrf},
        )
        assert res_bad.status_code == 422


def test_links_cross_user_isolation_and_auth_csrf(client: TestClient) -> None:
    assert client.get("/api/links").status_code == 401
    assert (
        client.post(
            "/api/links",
            json={"url": "https://example.com", "title": "NoAuth"},
        ).status_code
        == 401
    )

    cookie_a, csrf_a, _ = _register_and_get_credentials(client, "links_iso_a@linkvault.io")
    cookie_b, csrf_b, _ = _register_and_get_credentials(client, "links_iso_b@linkvault.io")

    client.cookies.set("linkvault_session", cookie_a)
    assert (
        client.post(
            "/api/links",
            json={"url": "https://example.com", "title": "NoCSRF"},
        ).status_code
        == 403
    )

    link_a_id = client.post(
        "/api/links",
        json={"url": "https://example.com/secret", "title": "Link Privado de A"},
        headers={"X-CSRF-Token": csrf_a},
    ).json()["id"]

    # Usuário B não vê nem altera link de A -> 404
    client.cookies.set("linkvault_session", cookie_b)
    assert client.get("/api/links").json()["items"] == []
    assert client.get(f"/api/links/{link_a_id}").status_code == 404
    assert (
        client.patch(
            f"/api/links/{link_a_id}",
            json={"title": "Hacked"},
            headers={"X-CSRF-Token": csrf_b},
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/links/{link_a_id}",
            headers={"X-CSRF-Token": csrf_b},
        ).status_code
        == 404
    )
