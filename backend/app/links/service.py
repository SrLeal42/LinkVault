import base64
import binascii
import json
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, Select, and_, delete, exists, func, or_, select, tuple_
from sqlalchemy.orm import Session, selectinload

from app.collections.service import resolve_owned_collection
from app.core.errors import BadRequestError, NotFoundError
from app.links.models import Link, LinkTag
from app.links.schemas import (
    LinkCreateRequest,
    LinkListQueryParams,
    LinkListResponse,
    LinkResponse,
    LinkSortOption,
    LinkUpdateRequest,
)
from app.tags.models import Tag
from app.tags.schemas import TagResponse
from app.tags.service import get_or_create_tags_by_names


@dataclass(frozen=True, slots=True)
class DecodedCursor:
    sort: LinkSortOption
    sort_value: datetime | str
    last_id: uuid.UUID


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


def encode_link_cursor(*, link: Link, sort: LinkSortOption) -> str:
    if sort in {LinkSortOption.CREATED_DESC, LinkSortOption.CREATED_ASC}:
        raw_val = link.created_at.isoformat()
    elif sort == LinkSortOption.UPDATED_DESC:
        raw_val = link.updated_at.isoformat()
    else:
        raw_val = link.title.lower()

    payload = json.dumps(
        {"s": sort.value, "v": raw_val, "id": str(link.id)},
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_link_cursor(*, cursor: str, expected_sort: LinkSortOption) -> DecodedCursor:
    try:
        padding = "=" * (-len(cursor) % 4)
        raw_bytes = base64.urlsafe_b64decode((cursor + padding).encode("ascii"))
        data = json.loads(raw_bytes.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, binascii.Error) as err:
        raise BadRequestError(detail="Cursor de paginação inválido.") from err

    if not isinstance(data, dict):
        raise BadRequestError(detail="Cursor de paginação inválido.")

    cursor_sort = data.get("s")
    raw_val = data.get("v")
    raw_id = data.get("id")

    if (
        cursor_sort != expected_sort.value
        or not isinstance(raw_val, str)
        or not isinstance(raw_id, str)
    ):
        raise BadRequestError(
            detail="Cursor de paginação inválido ou incompatível com a ordenação atual."
        )

    try:
        last_id = uuid.UUID(raw_id)
    except ValueError as err:
        raise BadRequestError(detail="Cursor de paginação inválido.") from err

    if expected_sort in {
        LinkSortOption.CREATED_DESC,
        LinkSortOption.CREATED_ASC,
        LinkSortOption.UPDATED_DESC,
    }:
        try:
            parsed_dt = datetime.fromisoformat(raw_val)
        except ValueError as err:
            raise BadRequestError(detail="Cursor de paginação inválido.") from err
        if parsed_dt.tzinfo is None:
            parsed_dt = parsed_dt.replace(tzinfo=UTC)
        return DecodedCursor(sort=expected_sort, sort_value=parsed_dt, last_id=last_id)

    return DecodedCursor(sort=expected_sort, sort_value=raw_val.lower(), last_id=last_id)


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _build_search_predicate(q: str) -> ColumnElement[bool]:
    pattern = f"%{_escape_like(q)}%"
    ilike_cond = or_(
        Link.title.ilike(pattern, escape="\\"),
        Link.description.ilike(pattern, escape="\\"),
    )
    if len(q) < 3:
        return ilike_cond

    # Operador `<%` (commutator de word_similarity `q <% col`), indexável por GIN gin_trgm_ops
    trgm_cond = or_(
        Link.title.op("%>")(q),
        Link.description.op("%>")(q),
    )
    return or_(ilike_cond, trgm_cond)


def _apply_sort_and_cursor(
    stmt: Select[Link],
    *,
    sort: LinkSortOption,
    decoded_cursor: DecodedCursor | None,
) -> Select[Link]:
    title_lower = func.lower(Link.title)

    if sort == LinkSortOption.CREATED_DESC:
        if decoded_cursor is not None:
            stmt = stmt.where(
                tuple_(Link.created_at, Link.id)
                < tuple_(decoded_cursor.sort_value, decoded_cursor.last_id)
            )
        return stmt.order_by(Link.created_at.desc(), Link.id.desc())

    if sort == LinkSortOption.CREATED_ASC:
        if decoded_cursor is not None:
            stmt = stmt.where(
                tuple_(Link.created_at, Link.id)
                > tuple_(decoded_cursor.sort_value, decoded_cursor.last_id)
            )
        return stmt.order_by(Link.created_at.asc(), Link.id.asc())

    if sort == LinkSortOption.UPDATED_DESC:
        if decoded_cursor is not None:
            stmt = stmt.where(
                tuple_(Link.updated_at, Link.id)
                < tuple_(decoded_cursor.sort_value, decoded_cursor.last_id)
            )
        return stmt.order_by(Link.updated_at.desc(), Link.id.desc())

    if sort == LinkSortOption.TITLE_ASC:
        if decoded_cursor is not None:
            stmt = stmt.where(
                tuple_(title_lower, Link.id)
                > tuple_(decoded_cursor.sort_value, decoded_cursor.last_id)
            )
        return stmt.order_by(title_lower.asc(), Link.id.asc())

    if decoded_cursor is not None:
        stmt = stmt.where(
            tuple_(title_lower, Link.id) < tuple_(decoded_cursor.sort_value, decoded_cursor.last_id)
        )
    return stmt.order_by(title_lower.desc(), Link.id.desc())


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
    params: LinkListQueryParams | None = None,
) -> LinkListResponse:
    query = params or LinkListQueryParams()

    decoded_cursor: DecodedCursor | None = None
    if query.cursor is not None:
        decoded_cursor = decode_link_cursor(
            cursor=query.cursor,
            expected_sort=query.sort,
        )

    if query.collection_id is not None:
        resolve_owned_collection(
            db,
            collection_id=query.collection_id,
            user_id=user_id,
        )

    stmt = select(Link).options(selectinload(Link.tags)).where(Link.user_id == user_id)

    if query.collection_id is not None:
        stmt = stmt.where(Link.collection_id == query.collection_id)

    if query.tag_id is not None:
        stmt = stmt.where(
            exists(
                select(1).where(
                    LinkTag.link_id == Link.id,
                    LinkTag.user_id == user_id,
                    LinkTag.tag_id == query.tag_id,
                )
            )
        )

    if query.tag is not None:
        normalized_tag = query.tag.lower()
        stmt = stmt.where(
            exists(
                select(1)
                .select_from(LinkTag)
                .join(
                    Tag,
                    and_(
                        Tag.id == LinkTag.tag_id,
                        Tag.user_id == LinkTag.user_id,
                    ),
                )
                .where(
                    LinkTag.link_id == Link.id,
                    LinkTag.user_id == user_id,
                    func.lower(Tag.name) == normalized_tag,
                )
            )
        )

    if query.q is not None:
        stmt = stmt.where(_build_search_predicate(query.q))

    stmt = _apply_sort_and_cursor(stmt, sort=query.sort, decoded_cursor=decoded_cursor)
    stmt = stmt.limit(query.limit + 1)

    rows = list(db.scalars(stmt).all())
    has_more = len(rows) > query.limit
    page_items = rows[: query.limit]
    next_cursor = encode_link_cursor(link=page_items[-1], sort=query.sort) if has_more else None

    return LinkListResponse(
        items=[_to_link_response(link) for link in page_items],
        next_cursor=next_cursor,
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
