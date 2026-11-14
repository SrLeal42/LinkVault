import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.collections.models import Collection, CollectionVisibility
from app.links.models import Link, LinkTag
from app.tags.models import Tag


@dataclass(frozen=True, slots=True)
class DemoCollectionSeed:
    key: str
    name: str
    description: str


@dataclass(frozen=True, slots=True)
class DemoLinkSeed:
    url: str
    title: str
    description: str | None
    notes: str | None
    collection_key: str | None
    tag_names: tuple[str, ...]
    minutes_ago: int


DEMO_COLLECTIONS: tuple[DemoCollectionSeed, ...] = (
    DemoCollectionSeed(
        key="backend",
        name="Backend & APIs",
        description="Documentações, arquiteturas REST e práticas de segurança no servidor.",
    ),
    DemoCollectionSeed(
        key="frontend",
        name="Frontend & UI",
        description=" Guias de React, tipagem estrita em TypeScript e componentes acessíveis.",
    ),
    DemoCollectionSeed(
        key="database",
        name="Banco de Dados & Infra",
        description="Modelagem relacional no PostgreSQL, índices GIN e containerização.",
    ),
)

DEMO_TAG_NAMES: tuple[str, ...] = (
    "Python",
    "FastAPI",
    "PostgreSQL",
    "React",
    "TypeScript",
    "Segurança",
)

DEMO_LINKS: tuple[DemoLinkSeed, ...] = (
    DemoLinkSeed(
        url="https://fastapi.tiangolo.com/tutorial/dependencies/",
        title="FastAPI — Injeção de Dependências e Segurança",
        description="Guia oficial sobre dependências reutilizáveis para autenticação e escopo.",
        notes="Referência para o padrão CurrentUser e OwnedLink na camada de rotas.",
        collection_key="backend",
        tag_names=("Python", "FastAPI", "Segurança"),
        minutes_ago=25,
    ),
    DemoLinkSeed(
        url="https://www.postgresql.org/docs/current/pgtrgm.html",
        title="PostgreSQL — Extensão pg_trgm e Índices GIN",
        description="Documentação de busca textual tolerante a erros por trigramas.",
        notes="Operador %> com índice gin_trgm_ops garante busca parcial rápida.",
        collection_key="database",
        tag_names=("PostgreSQL", "Backend" if False else "Python"),
        minutes_ago=20,
    ),
    DemoLinkSeed(
        url="https://docs.sqlalchemy.org/en/20/orm/Mapped_sql_expressions.html",
        title="SQLAlchemy 2.0 — Mapeamento Tipado com Mapped[]",
        description="Referência do ORM moderno com verificação estática de tipos (mypy strict).",
        notes=None,
        collection_key="backend",
        tag_names=("Python", "PostgreSQL"),
        minutes_ago=15,
    ),
    DemoLinkSeed(
        url="https://react.dev/learn/synchronizing-with-effects",
        title="React Docs — Arquitetura de Componentes e Estado",
        description="Boas práticas oficiais para separar estado de interface e cache de dados.",
        notes="Combinar com TanStack Query mantendo filtros na URL.",
        collection_key="frontend",
        tag_names=("React", "TypeScript"),
        minutes_ago=10,
    ),
    DemoLinkSeed(
        url="https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html",
        title="OWASP — Password Storage & Sessões Server-Side",
        description="Recomendações de custo Argon2id e proteção em camadas contra CSRF.",
        notes="Perfil mínimo OWASP: m=19 MiB, t=2, p=1.",
        collection_key="backend",
        tag_names=("Segurança", "FastAPI"),
        minutes_ago=5,
    ),
    DemoLinkSeed(
        url="https://www.typescriptlang.org/tsconfig/#strict",
        title="TypeScript TSConfig — Modo Strict de Ponta a Ponta",
        description="Referência de flags de compilação para contratos OpenAPI tipados.",
        notes=None,
        collection_key=None,
        tag_names=("TypeScript",),
        minutes_ago=1,
    ),
)


def seed_demo_user_library(
    db: Session,
    *,
    user_id: uuid.UUID,
    now: datetime | None = None,
) -> None:
    base_now = now or datetime.now(UTC)

    collections_by_key: dict[str, Collection] = {}
    for index, col_seed in enumerate(DEMO_COLLECTIONS):
        col_time = base_now - timedelta(minutes=30 - index)
        collection = Collection(
            id=uuid.uuid7(),
            user_id=user_id,
            name=col_seed.name.strip(),
            description=col_seed.description.strip(),
            visibility=CollectionVisibility.PRIVATE,
            public_slug=None,
            created_at=col_time,
            updated_at=col_time,
        )
        collections_by_key[col_seed.key] = collection

    tags_by_name: dict[str, Tag] = {}
    for index, tag_name in enumerate(DEMO_TAG_NAMES):
        tag_time = base_now - timedelta(minutes=25 - index)
        tags_by_name[tag_name] = Tag(
            id=uuid.uuid7(),
            user_id=user_id,
            name=tag_name,
            created_at=tag_time,
        )

    links: list[Link] = []
    link_tags: list[LinkTag] = []

    for link_seed in DEMO_LINKS:
        link_time = base_now - timedelta(minutes=link_seed.minutes_ago)
        target_collection = (
            collections_by_key[link_seed.collection_key]
            if link_seed.collection_key is not None
            else None
        )
        link = Link(
            id=uuid.uuid7(),
            user_id=user_id,
            collection_id=target_collection.id if target_collection is not None else None,
            url=link_seed.url,
            title=link_seed.title,
            description=link_seed.description,
            notes=link_seed.notes,
            created_at=link_time,
            updated_at=link_time,
        )
        links.append(link)

        for tag_name in link_seed.tag_names:
            tag = tags_by_name[tag_name]
            link_tags.append(
                LinkTag(
                    link_id=link.id,
                    tag_id=tag.id,
                    user_id=user_id,
                )
            )

    db.add_all(
        [
            *collections_by_key.values(),
            *tags_by_name.values(),
            *links,
        ]
    )
    db.flush()

    db.add_all(link_tags)
    db.flush()
