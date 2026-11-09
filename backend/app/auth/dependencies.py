from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.service import AuthenticatedSession, resolve_authenticated_session
from app.core.db import get_db
from app.core.security import SAFE_METHODS, extract_session_token, verify_csrf_token

DbSession = Annotated[Session, Depends(get_db)]


def get_current_session(request: Request, session: DbSession) -> AuthenticatedSession:
    raw_token = extract_session_token(request)
    auth_session = resolve_authenticated_session(session, raw_token)
    if request.method.upper() not in SAFE_METHODS:
        verify_csrf_token(request, auth_session.session.csrf_token)
    request.state.auth_session = auth_session
    return auth_session


def get_current_user(
    auth_session: Annotated[AuthenticatedSession, Depends(get_current_session)],
) -> User:
    return auth_session.user


CurrentSession = Annotated[AuthenticatedSession, Depends(get_current_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
