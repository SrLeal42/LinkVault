import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.collections.models import Collection
from app.collections.schemas import (
    CollectionCreateRequest,
    CollectionResponse,
    CollectionUpdateRequest,
)
from app.core.errors import NotFoundError
from app.links.models import Link


def _to_collection_response(collection: Collection, *, link_count: int) -> CollectionResponse:
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        visibility=collection.visibility,
        public_slug=collection.public_slug,
        link_count=link_count,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


def resolve_owned_collection(
    db: Session,
    *,
    collection_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Collection:
    collection = db.scalar(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.user_id == user_id,
        )
    )
    if collection is None:
        raise NotFoundError(detail="Coleção não encontrada.")
    return collection


def count_collection_links(
    db: Session,
    *,
    collection_id: uuid.UUID,
    user_id: uuid.UUID,
) -> int:
    stmt = select(func.count(Link.id)).where(
        Link.collection_id == collection_id,
        Link.user_id == user_id,
    )
    return int(db.scalar(stmt) or 0)


def list_user_collections(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> list[CollectionResponse]:
    stmt = (
        select(Collection, func.count(Link.id))
        .outerjoin(
            Link,
            (Link.collection_id == Collection.id) & (Link.user_id == Collection.user_id),
        )
        .where(Collection.user_id == user_id)
        .group_by(Collection.id)
        .order_by(func.lower(Collection.name).asc(), Collection.id.asc())
    )
    rows = db.execute(stmt).all()
    return [
        _to_collection_response(collection, link_count=int(count or 0))
        for collection, count in rows
    ]


def _sync_collection_links(
    db: Session,
    *,
    collection: Collection,
    link_ids: Sequence[uuid.UUID],
    unlink_missing: bool,
) -> None:
    unique_ids = list(dict.fromkeys(link_ids))
    now = datetime.now(UTC)

    if unique_ids:
        owned_count = int(
            db.scalar(
                select(func.count(Link.id)).where(
                    Link.user_id == collection.user_id,
                    Link.id.in_(unique_ids),
                )
            )
            or 0
        )
        if owned_count != len(unique_ids):
            raise NotFoundError(detail="Um ou mais links informados não foram encontrados.")

    if unlink_missing:
        unlink_stmt = update(Link).where(
            Link.user_id == collection.user_id,
            Link.collection_id == collection.id,
        )
        if unique_ids:
            unlink_stmt = unlink_stmt.where(Link.id.not_in(unique_ids))
        db.execute(unlink_stmt.values(collection_id=None, updated_at=now))

    if unique_ids:
        db.execute(
            update(Link)
            .where(
                Link.user_id == collection.user_id,
                Link.id.in_(unique_ids),
            )
            .values(collection_id=collection.id, updated_at=now)
        )
    db.flush()


def create_collection(
    db: Session,
    *,
    user_id: uuid.UUID,
    payload: CollectionCreateRequest,
) -> CollectionResponse:
    collection = Collection(
        user_id=user_id,
        name=payload.name,
        description=payload.description,
    )
    db.add(collection)
    db.flush()

    link_count = 0
    if payload.link_ids:
        _sync_collection_links(
            db,
            collection=collection,
            link_ids=payload.link_ids,
            unlink_missing=False,
        )
        link_count = len(payload.link_ids)

    db.commit()
    return _to_collection_response(collection, link_count=link_count)


def get_collection_details(
    db: Session,
    *,
    collection: Collection,
) -> CollectionResponse:
    link_count = count_collection_links(
        db,
        collection_id=collection.id,
        user_id=collection.user_id,
    )
    return _to_collection_response(collection, link_count=link_count)


def update_collection(
    db: Session,
    *,
    collection: Collection,
    payload: CollectionUpdateRequest,
) -> CollectionResponse:
    fields_set = payload.model_fields_set
    modified = False

    if "name" in fields_set and payload.name is not None:
        collection.name = payload.name
        modified = True

    if "description" in fields_set:
        collection.description = payload.description
        modified = True

    if "link_ids" in fields_set and payload.link_ids is not None:
        _sync_collection_links(
            db,
            collection=collection,
            link_ids=payload.link_ids,
            unlink_missing=True,
        )
        modified = True

    if modified:
        collection.updated_at = datetime.now(UTC)
        db.flush()
        db.commit()

    link_count = count_collection_links(
        db,
        collection_id=collection.id,
        user_id=collection.user_id,
    )
    return _to_collection_response(collection, link_count=link_count)


def delete_collection(
    db: Session,
    *,
    collection: Collection,
) -> None:
    db.delete(collection)
    db.commit()
