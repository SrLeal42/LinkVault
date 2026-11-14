import base64
import json
import uuid
from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from app.core.db import get_db
from app.links.models import Link, LinkTag
from app.main import app
from app.tags.models import Tag
from fastapi.testclient import TestClient
from sqlalchemy import select, update
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


def _create_link(
    client: TestClient,
    *,
    csrf: str,
    url: str,
    title: str,
    description: str | None = None,
    collection_id: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {"url": url, "title": title}
    if description is not None:
        payload["description"] = description
    if collection_id is not None:
        payload["collection_id"] = collection_id
    if tags is not None:
        payload["tags"] = tags
    res = client.post("/api/links", json=payload, headers={"X-CSRF-Token": csrf})
    assert res.status_code == 201
    return dict(res.json())


def test_links_search_pg_trgm_and_like_escaping(client: TestClient) -> None:
    cookie, csrf, _ = _register_and_get_credentials(client, "links_search@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    pg_link = _create_link(
        client,
        csrf=csrf,
        url="https://www.postgresql.org/docs/",
        title="PostgreSQL Documentation",
        description="Guia oficial de índices GIN e trigramas.",
    )
    go_link = _create_link(
        client,
        csrf=csrf,
        url="https://go.dev/doc/",
        title="Go Language",
        description=None,
    )
    special_link = _create_link(
        client,
        csrf=csrf,
        url="https://example.com/metrics",
        title="Cobertura 100% em snake_case",
        description=r"Caminho C:\projetos\app",
    )

    # Termo curto (< 3 chars): substring case-insensitive via ILIKE
    res_short = client.get("/api/links", params={"q": "go"})
    assert res_short.status_code == 200
    assert [item["id"] for item in res_short.json()["items"]] == [go_link["id"]]

    # Termo >= 3 chars com erro de digitação no título: word_similarity (`<%`)
    res_typo_title = client.get("/api/links", params={"q": "postgreql"})
    assert res_typo_title.status_code == 200
    assert [item["id"] for item in res_typo_title.json()["items"]] == [pg_link["id"]]

    # Termo >= 3 chars com erro de digitação na descrição
    res_typo_desc = client.get("/api/links", params={"q": "trigramass"})
    assert res_typo_desc.status_code == 200
    assert [item["id"] for item in res_typo_desc.json()["items"]] == [pg_link["id"]]

    # Escape seguro de metacaracteres `%`, `_` e `\` no ILIKE (não atuam como curingas)
    for literal_q in ["100%", "snake_case", r"C:\projetos"]:
        res_lit = client.get("/api/links", params={"q": literal_q})
        assert res_lit.status_code == 200
        assert [item["id"] for item in res_lit.json()["items"]] == [special_link["id"]]

    # `%` isolado não pode casar com todos os links
    res_percent = client.get("/api/links", params={"q": "%"})
    assert res_percent.status_code == 200
    assert [item["id"] for item in res_percent.json()["items"]] == [special_link["id"]]


def test_links_filters_collection_and_tags_mixed_behavior(client: TestClient) -> None:
    cookie_a, csrf_a, _ = _register_and_get_credentials(client, "links_flt_a@linkvault.io")
    cookie_b, csrf_b, _ = _register_and_get_credentials(client, "links_flt_b@linkvault.io")

    # Usuário B cria uma coleção e uma tag próprias
    client.cookies.set("linkvault_session", cookie_b)
    col_b_id = client.post(
        "/api/collections",
        json={"name": "Privada B"},
        headers={"X-CSRF-Token": csrf_b},
    ).json()["id"]
    tag_b_id = client.post(
        "/api/tags",
        json={"name": "SegredoB"},
        headers={"X-CSRF-Token": csrf_b},
    ).json()["id"]

    # Usuário A cria coleção, tags e links
    client.cookies.set("linkvault_session", cookie_a)
    col_a_id = client.post(
        "/api/collections",
        json={"name": "Backend"},
        headers={"X-CSRF-Token": csrf_a},
    ).json()["id"]

    link_1 = _create_link(
        client,
        csrf=csrf_a,
        url="https://fastapi.tiangolo.com",
        title="FastAPI",
        collection_id=col_a_id,
        tags=["Python", "API"],
    )
    _create_link(
        client,
        csrf=csrf_a,
        url="https://docs.pytest.org",
        title="Pytest",
        collection_id=col_a_id,
        tags=["Python"],
    )
    _create_link(
        client,
        csrf=csrf_a,
        url="https://react.dev",
        title="React",
        tags=["API"],
    )

    api_tag_id = next(t["id"] for t in link_1["tags"] if t["name"] == "API")  # type: ignore[attr-defined]

    # Filtro combinado: collection_id + tag (case-insensitive) + tag_id
    res_combined = client.get(
        "/api/links",
        params={"collection_id": col_a_id, "tag": "python", "tag_id": api_tag_id},
    )
    assert res_combined.status_code == 200
    assert [item["id"] for item in res_combined.json()["items"]] == [link_1["id"]]

    # Coleção inexistente ou de outro usuário -> 404 Not Found (Problem Details)
    for bad_col_id in [str(uuid.uuid7()), col_b_id]:
        res_404 = client.get("/api/links", params={"collection_id": bad_col_id})
        assert res_404.status_code == 404
        assert res_404.headers["content-type"].startswith("application/problem+json")

    # Tag por nome ou tag_id inexistente ou de outro usuário -> 200 OK com lista vazia
    for empty_params in [
        {"tag": "inexistente"},
        {"tag": "SegredoB"},
        {"tag_id": str(uuid.uuid7())},
        {"tag_id": tag_b_id},
    ]:
        res_empty = client.get("/api/links", params=empty_params)
        assert res_empty.status_code == 200
        assert res_empty.json() == {"items": [], "next_cursor": None}


def test_links_sorting_and_deterministic_tie_breaking_with_pagination(
    client: TestClient,
    db_session: Session,
) -> None:
    cookie, csrf, _ = _register_and_get_credentials(client, "links_sort@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    link_a = _create_link(client, csrf=csrf, url="https://example.com/1", title="beta")
    link_b = _create_link(client, csrf=csrf, url="https://example.com/2", title="Alpha")
    link_c = _create_link(client, csrf=csrf, url="https://example.com/3", title="alpha")

    # Força exatamente o mesmo created_at nos 3 links e updated_at distintos para testar desempate
    base_time = datetime(2026, 11, 10, 12, 0, 0, tzinfo=UTC)
    ids_sorted_asc = sorted(
        [
            uuid.UUID(str(link_a["id"])),
            uuid.UUID(str(link_b["id"])),
            uuid.UUID(str(link_c["id"])),
        ]
    )
    for offset, uid in enumerate(ids_sorted_asc):
        db_session.execute(
            update(Link)
            .where(Link.id == uid)
            .values(
                created_at=base_time,
                updated_at=base_time + timedelta(minutes=offset),
            )
        )
    db_session.flush()

    # created_desc e created_asc empatados devem desempatar por id
    res_created_desc = client.get("/api/links", params={"sort": "created_desc"})
    assert [uuid.UUID(i["id"]) for i in res_created_desc.json()["items"]] == list(
        reversed(ids_sorted_asc)
    )

    res_created_asc = client.get("/api/links", params={"sort": "created_asc"})
    assert [uuid.UUID(i["id"]) for i in res_created_asc.json()["items"]] == ids_sorted_asc

    # updated_desc ordena pelo updated_at mais recente
    res_updated_desc = client.get("/api/links", params={"sort": "updated_desc"})
    assert [uuid.UUID(i["id"]) for i in res_updated_desc.json()["items"]] == list(
        reversed(ids_sorted_asc)
    )

    # title_asc (case-insensitive): "Alpha" e "alpha" empatam e desempatam por id ASC
    alpha_ids_asc = sorted([str(link_b["id"]), str(link_c["id"])])
    expected_title_asc = [*alpha_ids_asc, str(link_a["id"])]

    # Paginação com limit=1 garante que empates não pulam nem duplicam itens
    collected_asc: list[str] = []
    cursor: str | None = None
    for _ in range(3):
        params: dict[str, object] = {"sort": "title_asc", "limit": 1}
        if cursor is not None:
            params["cursor"] = cursor
        page = client.get("/api/links", params=params).json()
        collected_asc.extend(item["id"] for item in page["items"])
        cursor = page["next_cursor"]
    assert cursor is None
    assert collected_asc == expected_title_asc

    # title_desc: inverso exato de title_asc
    res_title_desc = client.get("/api/links", params={"sort": "title_desc"})
    assert [item["id"] for item in res_title_desc.json()["items"]] == list(
        reversed(expected_title_asc)
    )


def test_links_cursor_pagination_stability_and_validation_errors(client: TestClient) -> None:
    cookie, csrf, _ = _register_and_get_credentials(client, "links_page@linkvault.io")
    client.cookies.set("linkvault_session", cookie)

    created_ids = [
        _create_link(
            client,
            csrf=csrf,
            url=f"https://example.com/{i}",
            title=f"Item {i:02d}",
        )["id"]
        for i in range(5)
    ]
    expected_desc = list(reversed(created_ids))

    # Página 1 (limit=2)
    p1 = client.get("/api/links", params={"limit": 2, "sort": "created_desc"})
    assert p1.status_code == 200
    body1 = p1.json()
    assert [i["id"] for i in body1["items"]] == expected_desc[:2]
    assert body1["next_cursor"] is not None

    # Exclui item da página 1 antes de pedir página 2: cursor não pula nem duplica itens
    del_res = client.delete(f"/api/links/{expected_desc[0]}", headers={"X-CSRF-Token": csrf})
    assert del_res.status_code == 204

    p2 = client.get(
        "/api/links",
        params={"limit": 2, "sort": "created_desc", "cursor": body1["next_cursor"]},
    )
    assert p2.status_code == 200
    body2 = p2.json()
    assert [i["id"] for i in body2["items"]] == expected_desc[2:4]
    assert body2["next_cursor"] is not None

    p3 = client.get(
        "/api/links",
        params={"limit": 2, "sort": "created_desc", "cursor": body2["next_cursor"]},
    )
    assert p3.status_code == 200
    body3 = p3.json()
    assert [i["id"] for i in body3["items"]] == expected_desc[4:]
    assert body3["next_cursor"] is None

    # Cursor incompatível com a ordenação atual -> 400 Bad Request
    res_mismatch = client.get(
        "/api/links",
        params={"sort": "title_asc", "cursor": body1["next_cursor"]},
    )
    assert res_mismatch.status_code == 400
    assert res_mismatch.headers["content-type"].startswith("application/problem+json")

    # Cursores malformados -> 400 Bad Request
    bad_payloads = [
        "nao-eh-base64!",
        base64.urlsafe_b64encode(b"not-json").decode("ascii"),
        base64.urlsafe_b64encode(b'["array"]').decode("ascii"),
        base64.urlsafe_b64encode(
            json.dumps({"s": "created_desc", "v": "invalid-date", "id": str(uuid.uuid7())}).encode()
        ).decode("ascii"),
        base64.urlsafe_b64encode(
            json.dumps(
                {"s": "created_desc", "v": "2026-11-14T10:00:00+00:00", "id": "bad-uuid"}
            ).encode()
        ).decode("ascii"),
    ]
    for bad_cursor in bad_payloads:
        res_bad = client.get("/api/links", params={"cursor": bad_cursor})
        assert res_bad.status_code == 400
        assert res_bad.headers["content-type"].startswith("application/problem+json")

    # Parâmetros de query inválidos -> 422 Unprocessable Content
    for invalid_query in [
        {"limit": 0},
        {"limit": 101},
        {"sort": "random"},
        {"collection_id": "nao-uuid"},
        {"tag_id": "nao-uuid"},
        {"extra_param": "proibido"},
    ]:
        res_422 = client.get("/api/links", params=invalid_query)
        assert res_422.status_code == 422
        assert res_422.headers["content-type"].startswith("application/problem+json")
