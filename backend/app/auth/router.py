from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response, status
from sqlalchemy.orm import Session

from app.auth.schemas import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from app.auth.service import authenticate_user, register_user
from app.core.db import get_db
from app.core.security import set_session_cookie

router = APIRouter(prefix="/auth", tags=["auth"])
DbSession = Annotated[Session, Depends(get_db)]


@router.post(
    "/register",
    operation_id="register_user",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastra um novo usuário e inicia a sessão",
)
def register(
    payload: RegisterRequest,
    response: Response,
    session: DbSession,
    user_agent: Annotated[str | None, Header(include_in_schema=False)] = None,
) -> AuthResponse:
    result = register_user(session, payload, user_agent=user_agent)
    set_session_cookie(response, result.raw_session_token)
    return AuthResponse(
        user=UserResponse.model_validate(result.user),
        csrf_token=result.csrf_token,
    )


@router.post(
    "/login",
    operation_id="login_user",
    response_model=AuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Autentica o usuário e inicia uma nova sessão",
)
def login(
    payload: LoginRequest,
    response: Response,
    session: DbSession,
    user_agent: Annotated[str | None, Header(include_in_schema=False)] = None,
) -> AuthResponse:
    result = authenticate_user(session, payload, user_agent=user_agent)
    set_session_cookie(response, result.raw_session_token)
    return AuthResponse(
        user=UserResponse.model_validate(result.user),
        csrf_token=result.csrf_token,
    )
