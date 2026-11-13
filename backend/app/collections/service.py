import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
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
    db.commit()
    return _to_collection_response(collection, link_count=0)


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
