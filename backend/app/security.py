"""JWT creation/verification and the bearer-token auth dependency."""

import hmac
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
TOKEN_TTL = timedelta(hours=24)

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "password123"

# auto_error=False so missing/malformed headers reach our own 401 below
# (consistent body {"detail": "Not authenticated"} + WWW-Authenticate: Bearer).
_bearer_scheme = HTTPBearer(auto_error=False)


def verify_credentials(email: str, password: str) -> bool:
    email_ok = hmac.compare_digest(email.encode("utf-8"), ADMIN_EMAIL.encode("utf-8"))
    password_ok = hmac.compare_digest(
        password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")
    )
    return email_ok and password_ok


# In-memory token versioning gives this database-less app real revocation:
# every JWT embeds the version current at mint time ("tv" claim), and
# verification rejects tokens carrying a stale version. rotate_tokens() bumps
# the version, revoking every previously issued token at once.
_token_version = 1
_version_lock = threading.Lock()


def current_token_version() -> int:
    with _version_lock:
        return _token_version


def rotate_tokens() -> int:
    """Revoke ALL previously issued tokens. Returns the new version."""
    global _token_version
    with _version_lock:
        _token_version += 1
        return _token_version


def create_token(email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "iat": now,
        "exp": now + TOKEN_TTL,
        "tv": current_token_version(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_token(token: str) -> Optional[str]:
    """Verify a JWT bearer token. Returns the authenticated email, or None.

    Single source of truth for token verification — used by the REST auth
    dependency below and by the MCP auth middleware (app/mcp_server.py).
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:  # covers expired, bad signature, malformed
        return None
    email = payload.get("sub")
    if email != ADMIN_EMAIL:
        return None
    if payload.get("tv") != current_token_version():
        return None  # issued before the last rotation — revoked
    return email


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> str:
    """Auth dependency for all /tasks* routes. Returns the authenticated email."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthenticated()
    email = verify_token(credentials.credentials)
    if email is None:
        raise _unauthenticated()
    return email
