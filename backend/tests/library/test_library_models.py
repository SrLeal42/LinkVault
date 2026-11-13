import uuid

import pytest
from app.auth.models import User
from app.collections.models import Collection, CollectionVisibility
from app.links.models import Link, LinkTag
from app.tags.models import Tag
from sqlalchemy import delete, insert, select
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session


def _create_user(db_session: Session, email: str) -> User:
    user = User(email=email, password_hash="argon2id$mockhash")
    db_session.add(user)
    db_session.flush()
    return user


def test_library_models_creation_and_relationships(db_session: Session) -> None:
    user = _create_user(db_session, "owner@linkvault.io")

    collection = Collection(
        user_id=user.id,
        name="Backend Python",
        description="Referências de FastAPI e SQLAlchemy.",
    )
    tag_fastapi = Tag(user_id=user.id, name="FastAPI")
    tag_postgres = Tag(user_id=user.id, name="PostgreSQL")
    db_session.add_all([collection, tag_fastapi, tag_postgres])
    db_session.flush()

    link = Link(
        user_id=user.id,
        collection_id=collection.id,
        url="https://fastapi.tiangolo.com/",
        title="FastAPI Documentation",
        description="Documentação oficial.",
        notes="Nota privada do usuário.",
    )
    db_session.add(link)
    db_session.flush()

    db_session.add_all(
        [
            LinkTag(link_id=link.id, tag_id=tag_fastapi.id, user_id=user.id),
            LinkTag(link_id=link.id, tag_id=tag_postgres.id, user_id=user.id),
        ]
    )
    db_session.flush()
    db_session.expire_all()

    loaded_link = db_session.scalar(select(Link).where(Link.id == link.id))
    assert loaded_link is not None
    assert loaded_link.id.version == 7
    assert loaded_link.collection is not None
    assert loaded_link.collection.id == collection.id
    assert loaded_link.collection.visibility == CollectionVisibility.PRIVATE
    assert loaded_link.collection.public_slug is None
    assert {tag.name for tag in loaded_link.tags} == {"FastAPI", "PostgreSQL"}


def test_collection_visibility_and_slug_consistency_constraint(db_session: Session) -> None:
    user = _create_user(db_session, "visibility@linkvault.io")

    invalid_private = Collection(
        user_id=user.id,
        name="Privada com slug",
        visibility=CollectionVisibility.PRIVATE,
        public_slug="slug-proibido",
    )
    db_session.add(invalid_private)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()

    user = _create_user(db_session, "visibility2@linkvault.io")
    invalid_public = Collection(
        user_id=user.id,
        name="Publica sem slug",
        visibility=CollectionVisibility.PUBLIC,
        public_slug=None,
    )
    db_session.add(invalid_public)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()

    user = _create_user(db_session, "visibility3@linkvault.io")
    valid_public = Collection(
        user_id=user.id,
        name="Publica valida",
        visibility=CollectionVisibility.PUBLIC,
        public_slug="Xk3m9Qp2LwZr7A",
    )
    db_session.add(valid_public)
    db_session.flush()
    assert valid_public.public_slug == "Xk3m9Qp2LwZr7A"


def test_tag_name_unique_case_insensitive_scoped_by_user(db_session: Session) -> None:
    user_a = _create_user(db_session, "tag-user-a@linkvault.io")
    user_b = _create_user(db_session, "tag-user-b@linkvault.io")

    db_session.add(Tag(user_id=user_a.id, name="Python"))
    db_session.flush()

    # Usuário B pode criar tag com o mesmo nome sem colidir com Usuário A
    db_session.add(Tag(user_id=user_b.id, name="Python"))
    db_session.flush()

    # Usuário A não pode duplicar com variação de maiúsculas/minúsculas
    db_session.add(Tag(user_id=user_a.id, name="python"))
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_composite_fk_blocks_cross_user_link_collection_association(db_session: Session) -> None:
    user_a = _create_user(db_session, "cross-col-a@linkvault.io")
    user_b = _create_user(db_session, "cross-col-b@linkvault.io")

    collection_b = Collection(user_id=user_b.id, name="Coleção de B")
    db_session.add(collection_b)
    db_session.flush()

    stmt = insert(Link).values(
        id=uuid.uuid7(),
        user_id=user_a.id,
        collection_id=collection_b.id,
        url="https://example.com",
        title="Link de A tentando invadir coleção de B",
    )
    with pytest.raises(IntegrityError):
        db_session.execute(stmt)
    db_session.rollback()


def test_composite_fk_blocks_cross_user_link_tag_association(db_session: Session) -> None:
    user_a = _create_user(db_session, "cross-tag-a@linkvault.io")
    user_b = _create_user(db_session, "cross-tag-b@linkvault.io")

    link_a = Link(
        user_id=user_a.id,
        url="https://example.com/a",
        title="Link de A",
    )
    tag_b = Tag(user_id=user_b.id, name="TagDeB")
    db_session.add_all([link_a, tag_b])
    db_session.flush()

    # Tentativa usando user_id de A (falha na FK composta de tags)
    stmt_as_a = insert(LinkTag).values(
        link_id=link_a.id,
        tag_id=tag_b.id,
        user_id=user_a.id,
    )
    with pytest.raises(IntegrityError):
        db_session.execute(stmt_as_a)
    db_session.rollback()

    # Recria os registros após rollback do savepoint para testar user_id de B
    user_a = _create_user(db_session, "cross-tag-a2@linkvault.io")
    user_b = _create_user(db_session, "cross-tag-b2@linkvault.io")
    link_a = Link(user_id=user_a.id, url="https://example.com/a2", title="Link de A2")
    tag_b = Tag(user_id=user_b.id, name="TagDeB2")
    db_session.add_all([link_a, tag_b])
    db_session.flush()

    # Tentativa usando user_id de B (falha na FK composta de links)
    stmt_as_b = insert(LinkTag).values(
        link_id=link_a.id,
        tag_id=tag_b.id,
        user_id=user_b.id,
    )
    with pytest.raises(IntegrityError):
        db_session.execute(stmt_as_b)
    db_session.rollback()


def test_deleting_collection_sets_only_collection_id_null_preserving_link(
    db_session: Session,
) -> None:
    user = _create_user(db_session, "set-null@linkvault.io")
    collection = Collection(user_id=user.id, name="Temporária")
    db_session.add(collection)
    db_session.flush()

    link = Link(
        user_id=user.id,
        collection_id=collection.id,
        url="https://example.com/persist",
        title="Link que deve permanecer",
    )
    db_session.add(link)
    db_session.flush()
    link_id = link.id

    db_session.execute(delete(Collection).where(Collection.id == collection.id))
    db_session.flush()
    db_session.expire_all()

    persisted_link = db_session.scalar(select(Link).where(Link.id == link_id))
    assert persisted_link is not None
    assert persisted_link.collection_id is None
    assert persisted_link.user_id == user.id


def test_cascade_delete_on_user_link_and_tag_removal(db_session: Session) -> None:
    user = _create_user(db_session, "cascade-lib@linkvault.io")
    collection = Collection(user_id=user.id, name="Coleção")
    tag1 = Tag(user_id=user.id, name="Tag1")
    tag2 = Tag(user_id=user.id, name="Tag2")
    db_session.add_all([collection, tag1, tag2])
    db_session.flush()

    link = Link(
        user_id=user.id,
        collection_id=collection.id,
        url="https://example.com/cascade",
        title="Cascade Test",
    )
    db_session.add(link)
    db_session.flush()

    db_session.add_all(
        [
            LinkTag(link_id=link.id, tag_id=tag1.id, user_id=user.id),
            LinkTag(link_id=link.id, tag_id=tag2.id, user_id=user.id),
        ]
    )
    db_session.flush()

    # Remover tag1 remove apenas a associação correspondente em link_tags
    db_session.execute(delete(Tag).where(Tag.id == tag1.id))
    db_session.flush()
    remaining_lt = db_session.scalars(select(LinkTag).where(LinkTag.link_id == link.id)).all()
    assert len(remaining_lt) == 1
    assert remaining_lt[0].tag_id == tag2.id

    # Remover usuário remove coleção, link, tags e link_tags em cascata
    user_id = user.id
    db_session.execute(delete(User).where(User.id == user_id))
    db_session.flush()
    db_session.expire_all()

    assert db_session.scalar(select(Collection).where(Collection.user_id == user_id)) is None
    assert db_session.scalar(select(Link).where(Link.user_id == user_id)) is None
    assert db_session.scalar(select(Tag).where(Tag.user_id == user_id)) is None
    assert db_session.scalar(select(LinkTag).where(LinkTag.user_id == user_id)) is None


def test_length_and_blank_check_constraints(db_session: Session) -> None:
    user = _create_user(db_session, "checks@linkvault.io")

    # Tag em branco (btrim == '')
    db_session.add(Tag(user_id=user.id, name="   "))
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()

    user = _create_user(db_session, "checks2@linkvault.io")
    # URL maior que 2048 caracteres
    db_session.add(
        Link(
            user_id=user.id,
            url="https://example.com/" + ("a" * 2040),
            title="URL longa",
        )
    )
    with pytest.raises(DataError):
        db_session.flush()
    db_session.rollback()
