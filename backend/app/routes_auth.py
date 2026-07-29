"""Authentication routes."""

from fastapi import APIRouter, Depends, HTTPException

from app.models import LoginRequest, LoginResponse, UserOut
from app.security import (
    create_token,
    get_current_user,
    rotate_tokens,
    verify_credentials,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest) -> LoginResponse:
    if not verify_credentials(body.email, body.password):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return LoginResponse(
        token=create_token(body.email),
        user=UserOut(email=body.email),
    )


@router.post("/rotate", response_model=LoginResponse)
def rotate(email: str = Depends(get_current_user)) -> LoginResponse:
    """Mint a fresh token, immediately revoking ALL previously issued tokens.

    Requires a currently valid token (you can't rotate your way in from
    outside). Rotation bumps the token version first, so the returned token
    is the only valid one afterward.
    """
    rotate_tokens()
    return LoginResponse(token=create_token(email), user=UserOut(email=email))
