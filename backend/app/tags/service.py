import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.tags.models import Tag
from app.tags.schemas import TagCreateRequest, TagUpdateRequest


def resolve_owned_tag(
    db: Session,
    *,
    tag_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Tag:
    tag = db.scalar(
        select(Tag).where(
            Tag.id == tag_id,
            Tag.user_id == user_id,
        )
    )
    if tag is None:
        raise NotFoundError(detail="Tag não encontrada.")
    return tag


def list_user_tags(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> list[Tag]:
    stmt = (
        select(Tag).where(Tag.user_id == user_id).order_by(func.lower(Tag.name).asc(), Tag.id.asc())
    )
    return list(db.scalars(stmt).all())


def create_tag(
    db: Session,
    *,
    user_id: uuid.UUID,
    payload: TagCreateRequest,
) -> Tag:
    existing = db.scalar(
        select(Tag).where(
            Tag.user_id == user_id,
            func.lower(Tag.name) == payload.name.lower(),
        )
    )
    if existing is not None:
        raise ConflictError(detail="Já existe uma tag com este nome.")

    tag = Tag(user_id=user_id, name=payload.name)
    db.add(tag)
    try:
        db.flush()
    except IntegrityError as err:
        db.rollback()
        raise ConflictError(detail="Já existe uma tag com este nome.") from err

    db.commit()
    return tag


def update_tag(
    db: Session,
    *,
    tag: Tag,
    payload: TagUpdateRequest,
) -> Tag:
    normalized_lower = payload.name.lower()
    conflict = db.scalar(
        select(Tag).where(
            Tag.user_id == tag.user_id,
            func.lower(Tag.name) == normalized_lower,
            Tag.id != tag.id,
        )
    )
    if conflict is not None:
        raise ConflictError(detail="Já existe uma tag com este nome.")

    tag.name = payload.name
    try:
        db.flush()
    except IntegrityError as err:
        db.rollback()
        raise ConflictError(detail="Já existe uma tag com este nome.") from err

    db.commit()
    return tag


def delete_tag(
    db: Session,
    *,
    tag: Tag,
) -> None:
    db.delete(tag)
    db.commit()


def get_or_create_tags_by_names(
    db: Session,
    *,
    user_id: uuid.UUID,
    names: Sequence[str],
) -> list[Tag]:
    unique_by_lower: dict[str, str] = {}
    for raw_name in names:
        cleaned = raw_name.strip()
        if not cleaned:
            continue
        lower_key = cleaned.lower()
        if lower_key not in unique_by_lower:
            unique_by_lower[lower_key] = cleaned

    if not unique_by_lower:
        return []

    now = datetime.now(UTC)
    values = [
        {
            "id": uuid.uuid7(),
            "user_id": user_id,
            "name": display_name,
            "created_at": now,
        }
        for display_name in unique_by_lower.values()
    ]

    stmt = pg_insert(Tag).values(values).on_conflict_do_nothing()
    db.execute(stmt)
    db.flush()

    fetch_stmt = (
        select(Tag)
        .where(
            Tag.user_id == user_id,
            func.lower(Tag.name).in_(list(unique_by_lower.keys())),
        )
        .order_by(func.lower(Tag.name).asc(), Tag.id.asc())
    )
    return list(db.scalars(fetch_stmt).all())
