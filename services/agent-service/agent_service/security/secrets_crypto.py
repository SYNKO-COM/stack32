"""Encrypt / decrypt user secrets (BYOK). Never log plaintext."""

from __future__ import annotations

import base64
import hashlib
import logging

from agent_service.config import get_settings

logger = logging.getLogger(__name__)


class SecretsCryptoError(Exception):
    pass


def _fernet():
    from cryptography.fernet import Fernet

    settings = get_settings()
    raw = (settings.SECRETS_ENCRYPTION_KEY or "").strip()
    if not raw:
        # Dev fallback derived from internal token — production must set explicit key.
        if settings.is_production:
            raise SecretsCryptoError("SECRETS_ENCRYPTION_KEY is required in production.")
        raw = settings.INTERNAL_SERVICE_TOKEN or "stack32-dev-secrets-key"
        logger.warning("SECRETS_ENCRYPTION_KEY missing — using derived development key")
    # Accept raw Fernet key or any passphrase (hash to 32 url-safe bytes)
    try:
        return Fernet(raw.encode() if not raw.endswith("=") and len(raw) == 44 else raw.encode())
    except Exception:
        digest = hashlib.sha256(raw.encode()).digest()
        key = base64.urlsafe_b64encode(digest)
        return Fernet(key)


def encrypt_secret(plaintext: str) -> str:
    if not plaintext or not plaintext.strip():
        raise SecretsCryptoError("Empty secret")
    token = _fernet().encrypt(plaintext.strip().encode("utf-8"))
    return token.decode("ascii")


def decrypt_secret(ciphertext: str) -> str:
    from cryptography.fernet import InvalidToken

    try:
        return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise SecretsCryptoError("Unable to decrypt secret") from exc


def secret_hint(plaintext: str) -> str:
    cleaned = plaintext.strip()
    if len(cleaned) <= 4:
        return "••••"
    return f"••••{cleaned[-4:]}"
