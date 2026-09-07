"""
NE-SHIELD API Key Authentication Service
=========================================
Provides FastAPI Depends() guards for sensitive endpoints.

Roles enforced at backend:
  - require_officer : Field Officer or Admin
  - require_admin   : Admin (HQ) only

Keys are loaded from environment variables.
Production path: replace with Supabase JWT verification
(verify_jwt -> decode with SUPABASE_JWT_SECRET).
"""

import os
import hmac
from typing import Optional
from fastapi import Header, HTTPException
from dotenv import load_dotenv

load_dotenv()

# Load API keys from env; defaults are for local dev only
OFFICER_KEY: str = os.getenv("OFFICER_API_KEY", "ne-shield-officer-key-2026")
ADMIN_KEY: str   = os.getenv("ADMIN_API_KEY",   "ne-shield-admin-key-2026")


def _extract_token(authorization: Optional[str]) -> str:
    """Strips 'Bearer ' prefix and returns the raw token string."""
    return (authorization or "").replace("Bearer ", "").strip()


def require_officer(authorization: Optional[str] = Header(None)) -> str:
    """
    Dependency: allows Field Officers and Admins.
    Usage: `_: str = Depends(require_officer)`
    """
    token = _extract_token(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing. Provide 'Bearer <OFFICER_API_KEY>'."
        )
    is_officer = hmac.compare_digest(token, OFFICER_KEY)
    is_admin   = hmac.compare_digest(token, ADMIN_KEY)
    if not (is_officer or is_admin):
        raise HTTPException(
            status_code=403,
            detail="Field Officer or Admin credentials required for this action."
        )
    return token


def require_admin(authorization: Optional[str] = Header(None)) -> str:
    """
    Dependency: allows Admin (HQ) only.
    Usage: `_: str = Depends(require_admin)`
    """
    token = _extract_token(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing. Provide 'Bearer <ADMIN_API_KEY>'."
        )
    if not hmac.compare_digest(token, ADMIN_KEY):
        raise HTTPException(
            status_code=403,
            detail="Admin (Disaster HQ) credentials required for this action."
        )
    return token
