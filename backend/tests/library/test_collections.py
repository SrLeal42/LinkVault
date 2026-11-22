import uuid
from collections.abc import Generator

import pytest
from app.collections.models import Collection
from app.core.db import get_db
from app.links.models import Link
from app.main import app
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


def test_collections_crud_and_ordering_with_link_count(
    client: TestClient,
    db_session: Session,
) -> None:
    cookie, csrf, user_id = _register_and_get_credentials(client, "col_owner@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    # 1. Criação
    res_z = client.post(
        "/api/collections",
        json={"name": "  Zsh & Terminal  ", "description": "  Dotfiles e aliases  "},
        headers={"X-CSRF-Token": csrf},
    )
    assert res_z.status_code == 201
    col_z = res_z.json()
    assert col_z["name"] == "Zsh & Terminal"
    assert col_z["description"] == "Dotfiles e aliases"
    assert col_z["visibility"] == "private"
    assert col_z["public_slug"] is None
    assert col_z["link_count"] == 0

    res_a = client.post(
        "/api/collections",
        json={"name": "apis rest", "description": "   "},
        headers={"X-CSRF-Token": csrf},
    )
    assert res_a.status_code == 201
    col_a = res_a.json()
    assert col_a["name"] == "apis rest"
    assert col_a["description"] is None

    # 2. Associa 2 links à coleção 'apis rest'
    col_a_id = uuid.UUID(str(col_a["id"]))
    db_session.add_all(
        [
            Link(
                user_id=user_id,
                collection_id=col_a_id,
                url="https://fastapi.tiangolo.com",
                title="FastAPI",
            ),
            Link(
                user_id=user_id,
                collection_id=col_a_id,
                url="https://spec.openapis.org",
                title="OpenAPI",
            ),
        ]
    )
    db_session.commit()

    # 3. Listagem ordenada por lower(name) ASC com link_count preciso
    list_res = client.get("/api/collections")
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert [item["name"] for item in items] == ["apis rest", "Zsh & Terminal"]
    assert [item["link_count"] for item in items] == [2, 0]

    # 4. Consulta individual
    get_res = client.get(f"/api/collections/{col_a_id}")
    assert get_res.status_code == 200
    assert get_res.json()["link_count"] == 2


def test_update_collection_partial_patch_semantics(client: TestClient) -> None:
    cookie, csrf, _ = _register_and_get_credentials(client, "col_patch@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    create_res = client.post(
        "/api/collections",
        json={"name": "Original", "description": "Descrição inicial"},
        headers={"X-CSRF-Token": csrf},
    )
    assert create_res.status_code == 201
    col_id = create_res.json()["id"]

    # Atualiza apenas o nome -> preserva description
    patch_name = client.patch(
        f"/api/collections/{col_id}",
        json={"name": "  Renomeada  "},
        headers={"X-CSRF-Token": csrf},
    )
    assert patch_name.status_code == 200
    assert patch_name.json()["name"] == "Renomeada"
    assert patch_name.json()["description"] == "Descrição inicial"

    # Atualiza apenas a descrição -> preserva name
    patch_desc = client.patch(
        f"/api/collections/{col_id}",
        json={"description": "Nova descrição"},
        headers={"X-CSRF-Token": csrf},
    )
    assert patch_desc.status_code == 200
    assert patch_desc.json()["name"] == "Renomeada"
    assert patch_desc.json()["description"] == "Nova descrição"

    # Limpa description com null
    clear_null = client.patch(
        f"/api/collections/{col_id}",
        json={"description": None},
        headers={"X-CSRF-Token": csrf},
    )
    assert clear_null.status_code == 200
    assert clear_null.json()["description"] is None

    # Preenche novamente e limpa com string em branco
    client.patch(
        f"/api/collections/{col_id}",
        json={"description": "Temporária"},
        headers={"X-CSRF-Token": csrf},
    )
    clear_blank = client.patch(
        f"/api/collections/{col_id}",
        json={"description": "   "},
        headers={"X-CSRF-Token": csrf},
    )
    assert clear_blank.status_code == 200
    assert clear_blank.json()["description"] is None

    # Rejeita name null, em branco ou campo extra
    assert (
        client.patch(
            f"/api/collections/{col_id}",
            json={"name": None},
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/collections/{col_id}",
            json={"name": "   "},
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/collections/{col_id}",
            json={"visibility": "public"},
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 422
    )


def test_delete_collection_preserves_links_with_set_null(
    client: TestClient,
    db_session: Session,
) -> None:
    cookie, csrf, user_id = _register_and_get_credentials(client, "col_delete@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    create_res = client.post(
        "/api/collections",
        json={"name": "Para excluir"},
        headers={"X-CSRF-Token": csrf},
    )
    assert create_res.status_code == 201
    col_id = uuid.UUID(str(create_res.json()["id"]))

    link = Link(
        user_id=user_id,
        collection_id=col_id,
        url="https://example.com/keep",
        title="Link preservado",
    )
    db_session.add(link)
    db_session.commit()
    link_id = link.id

    del_res = client.delete(
        f"/api/collections/{col_id}",
        headers={"X-CSRF-Token": csrf},
    )
    assert del_res.status_code == 204
    assert del_res.text == ""

    db_session.expire_all()
    assert db_session.scalar(select(Collection).where(Collection.id == col_id)) is None
    persisted_link = db_session.scalar(select(Link).where(Link.id == link_id))
    assert persisted_link is not None
    assert persisted_link.collection_id is None
    assert persisted_link.user_id == user_id


def test_collections_cross_user_isolation_returns_404(client: TestClient) -> None:
    cookie_a, csrf_a, _ = _register_and_get_credentials(client, "col_iso_a@linkvault.io")
    cookie_b, csrf_b, _ = _register_and_get_credentials(client, "col_iso_b@linkvault.io")

    # Usuário A cria coleção
    client.cookies.set("linkvault_session", cookie_a)
    res_a = client.post(
        "/api/collections",
        json={"name": "Privada de A"},
        headers={"X-CSRF-Token": csrf_a},
    )
    assert res_a.status_code == 201
    col_a_id = res_a.json()["id"]

    # Usuário B tenta listar, consultar, editar e excluir a coleção de A
    client.cookies.set("linkvault_session", cookie_b)
    assert client.get("/api/collections").json()["items"] == []

    res_get = client.get(f"/api/collections/{col_a_id}")
    assert res_get.status_code == 404
    assert res_get.headers["content-type"] == "application/problem+json"
    assert res_get.json()["type"] == "urn:linkvault:error:not_found"

    res_patch = client.patch(
        f"/api/collections/{col_a_id}",
        json={"name": "Sequestrada"},
        headers={"X-CSRF-Token": csrf_b},
    )
    assert res_patch.status_code == 404

    res_del = client.delete(
        f"/api/collections/{col_a_id}",
        headers={"X-CSRF-Token": csrf_b},
    )
    assert res_del.status_code == 404

    # UUID aleatório também retorna 404 idêntico
    assert client.get(f"/api/collections/{uuid.uuid7()}").status_code == 404

    # Coleção de A continua intacta
    client.cookies.set("linkvault_session", cookie_a)
    res_check = client.get(f"/api/collections/{col_a_id}")
    assert res_check.status_code == 200
    assert res_check.json()["name"] == "Privada de A"


def test_collections_require_authentication_and_csrf(client: TestClient) -> None:
    # Sem sessão -> 401
    assert client.get("/api/collections").status_code == 401
    assert client.post("/api/collections", json={"name": "Sem auth"}).status_code == 401

    cookie, csrf, _ = _register_and_get_credentials(client, "col_csrf@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    # POST sem X-CSRF-Token -> 403
    res_no_csrf = client.post("/api/collections", json={"name": "Sem CSRF"})
    assert res_no_csrf.status_code == 403
    assert res_no_csrf.json()["type"] == "urn:linkvault:error:csrf_failed"

    # Cria com CSRF válido e testa PATCH/DELETE sem CSRF -> 403
    col_id = client.post(
        "/api/collections",
        json={"name": "Protegida"},
        headers={"X-CSRF-Token": csrf},
    ).json()["id"]

    assert client.patch(f"/api/collections/{col_id}", json={"name": "X"}).status_code == 403
    assert client.delete(f"/api/collections/{col_id}").status_code == 403


def test_collections_batch_link_ids_sync_and_isolation(
    client: TestClient,
    db_session: Session,
) -> None:
    cookie_a, csrf_a, user_a_id = _register_and_get_credentials(client, "col_batch_a@linkvault.io")
    cookie_b, csrf_b, user_b_id = _register_and_get_credentials(client, "col_batch_b@linkvault.io")

    # Cria 3 links para A e 1 link para B
    link_a1 = Link(user_id=user_a_id, url="https://example.com/a1", title="Link A1")
    link_a2 = Link(user_id=user_a_id, url="https://example.com/a2", title="Link A2")
    link_a3 = Link(user_id=user_a_id, url="https://example.com/a3", title="Link A3")
    link_b1 = Link(user_id=user_b_id, url="https://example.com/b1", title="Link B1")
    db_session.add_all([link_a1, link_a2, link_a3, link_b1])
    db_session.commit()

    client.cookies.set("linkvault_session", cookie_a)

    # 1. Criação de coleção já associando link_a1 e link_a2 (com duplicata deduplicada)
    create_res = client.post(
        "/api/collections",
        json={
            "name": "Coleção Inicial",
            "link_ids": [str(link_a1.id), str(link_a2.id), str(link_a1.id)],
        },
        headers={"X-CSRF-Token": csrf_a},
    )
    assert create_res.status_code == 201
    col_1_id = uuid.UUID(str(create_res.json()["id"]))
    assert create_res.json()["link_count"] == 2

    # 2. PATCH sem link_ids preserva os links associados
    rename_res = client.patch(
        f"/api/collections/{col_1_id}",
        json={"name": "Coleção Renomeada"},
        headers={"X-CSRF-Token": csrf_a},
    )
    assert rename_res.status_code == 200
    assert rename_res.json()["link_count"] == 2

    # 3. PATCH com link_ids remove link_a1 (desmarcado) e adiciona link_a3
    sync_res = client.patch(
        f"/api/collections/{col_1_id}",
        json={"link_ids": [str(link_a2.id), str(link_a3.id)]},
        headers={"X-CSRF-Token": csrf_a},
    )
    assert sync_res.status_code == 200
    assert sync_res.json()["link_count"] == 2

    db_session.expire_all()
    persisted_a1 = db_session.scalar(select(Link).where(Link.id == link_a1.id))
    persisted_a2 = db_session.scalar(select(Link).where(Link.id == link_a2.id))
    persisted_a3 = db_session.scalar(select(Link).where(Link.id == link_a3.id))
    assert persisted_a1 is not None and persisted_a1.collection_id is None
    assert persisted_a2 is not None and persisted_a2.collection_id == col_1_id
    assert persisted_a3 is not None and persisted_a3.collection_id == col_1_id

    # 4. Criação de segunda coleção movendo link_a2 (relação 1:N)
    create_res_2 = client.post(
        "/api/collections",
        json={"name": "Destino", "link_ids": [str(link_a2.id)]},
        headers={"X-CSRF-Token": csrf_a},
    )
    assert create_res_2.status_code == 201
    assert create_res_2.json()["link_count"] == 1
    assert client.get(f"/api/collections/{col_1_id}").json()["link_count"] == 1

    # 5. Isolamento cross-user: tentar associar link de B ou UUID inexistente retorna 404
    cross_create = client.post(
        "/api/collections",
        json={"name": "Invasora", "link_ids": [str(link_b1.id)]},
        headers={"X-CSRF-Token": csrf_a},
    )
    assert cross_create.status_code == 404

    cross_patch = client.patch(
        f"/api/collections/{col_1_id}",
        json={"link_ids": [str(link_b1.id)]},
        headers={"X-CSRF-Token": csrf_a},
    )
    assert cross_patch.status_code == 404

    # Link de B permanece sem coleção
    client.cookies.set("linkvault_session", cookie_b)
    db_session.expire_all()
    persisted_b1 = db_session.scalar(select(Link).where(Link.id == link_b1.id))
    assert persisted_b1 is not None and persisted_b1.collection_id is None
    assert csrf_b != ""
