import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.collections.service import resolve_owned_collection
from app.core.errors import NotFoundError
from app.links.models import Link, LinkTag
from app.links.schemas import (
    LinkCreateRequest,
    LinkListResponse,
    LinkResponse,
    LinkUpdateRequest,
)
from app.tags.models import Tag
from app.tags.schemas import TagResponse
from app.tags.service import get_or_create_tags_by_names


def _to_link_response(link: Link, *, tags: Sequence[Tag] | None = None) -> LinkResponse:
    raw_tags = tags if tags is not None else link.tags
    sorted_tags = sorted(raw_tags, key=lambda t: (t.name.lower(), str(t.id)))
    return LinkResponse(
        id=link.id,
        collection_id=link.collection_id,
        url=link.url,
        title=link.title,
        description=link.description,
        notes=link.notes,
        tags=[TagResponse.model_validate(t) for t in sorted_tags],
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


def _sync_link_tags(
    db: Session,
    *,
    link: Link,
    tag_names: Sequence[str],
) -> list[Tag]:
    db.execute(
        delete(LinkTag).where(
            LinkTag.link_id == link.id,
            LinkTag.user_id == link.user_id,
        )
    )
    resolved_tags = get_or_create_tags_by_names(
        db,
        user_id=link.user_id,
        names=tag_names,
    )
    for tag in resolved_tags:
        db.add(LinkTag(link_id=link.id, tag_id=tag.id, user_id=link.user_id))
    db.flush()
    return resolved_tags


def resolve_owned_link(
    db: Session,
    *,
    link_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Link:
    link = db.scalar(
        select(Link)
        .options(selectinload(Link.tags))
        .where(
            Link.id == link_id,
            Link.user_id == user_id,
        )
    )
    if link is None:
        raise NotFoundError(detail="Link não encontrado.")
    return link


def list_user_links(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> LinkListResponse:
    stmt = (
        select(Link)
        .options(selectinload(Link.tags))
        .where(Link.user_id == user_id)
        .order_by(Link.created_at.desc(), Link.id.desc())
    )
    links = list(db.scalars(stmt).all())
    return LinkListResponse(
        items=[_to_link_response(link) for link in links],
        next_cursor=None,
    )


def create_link(
    db: Session,
    *,
    user_id: uuid.UUID,
    payload: LinkCreateRequest,
) -> LinkResponse:
    if payload.collection_id is not None:
        resolve_owned_collection(
            db,
            collection_id=payload.collection_id,
            user_id=user_id,
        )

    link = Link(
        user_id=user_id,
        collection_id=payload.collection_id,
        url=payload.url,
        title=payload.title,
        description=payload.description,
        notes=payload.notes,
    )
    db.add(link)
    db.flush()

    tags = _sync_link_tags(db, link=link, tag_names=payload.tags)
    db.commit()
    return _to_link_response(link, tags=tags)


def get_link_details(link: Link) -> LinkResponse:
    return _to_link_response(link)


def update_link(
    db: Session,
    *,
    link: Link,
    payload: LinkUpdateRequest,
) -> LinkResponse:
    fields_set = payload.model_fields_set
    modified = False
    updated_tags: list[Tag] | None = None

    if "collection_id" in fields_set:
        if payload.collection_id is not None:
            resolve_owned_collection(
                db,
                collection_id=payload.collection_id,
                user_id=link.user_id,
            )
        link.collection_id = payload.collection_id
        modified = True

    if "url" in fields_set and payload.url is not None:
        link.url = payload.url
        modified = True

    if "title" in fields_set and payload.title is not None:
        link.title = payload.title
        modified = True

    if "description" in fields_set:
        link.description = payload.description
        modified = True

    if "notes" in fields_set:
        link.notes = payload.notes
        modified = True

    if "tags" in fields_set and payload.tags is not None:
        updated_tags = _sync_link_tags(db, link=link, tag_names=payload.tags)
        modified = True

    if modified:
        link.updated_at = datetime.now(UTC)
        db.flush()
        db.commit()

    return _to_link_response(link, tags=updated_tags)


def delete_link(
    db: Session,
    *,
    link: Link,
) -> None:
    db.delete(link)
    db.commit()
