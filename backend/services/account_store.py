"""Tiny account and saved-model store for Cadio.

This is intentionally dependency-free so the Hugging Face/Railway app can keep
running without adding a managed database during early testing.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_ENV = "CADIO_ACCOUNT_DB"
DATA_DIR_ENV = "CADIO_DATA_DIR"
MAX_LIBRARY_BYTES = 350_000


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_path() -> Path:
    configured = os.environ.get(DB_ENV)
    if configured:
        path = Path(configured)
    else:
        data_dir = Path(os.environ.get(DATA_DIR_ENV, "runtime-data"))
        path = data_dir / "cadio_accounts.sqlite3"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    _init(conn)
    return conn


def _init(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS saved_libraries (
            account_id TEXT PRIMARY KEY,
            library_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )
        """
    )
    conn.commit()


def _clean_email(value: str | None) -> str:
    return (value or "").strip().lower()


def _clean_phone(value: str | None) -> str:
    return "".join(ch for ch in (value or "").strip() if ch.isdigit() or ch == "+")


def _identity(email: str | None, phone: str | None) -> str:
    clean_email = _clean_email(email)
    clean_phone = _clean_phone(phone)
    if clean_email:
        return f"email:{clean_email}"
    if clean_phone:
        return f"phone:{clean_phone}"
    raise ValueError("Email or phone is required")


def _account_id(email: str | None, phone: str | None) -> str:
    digest = hashlib.sha256(_identity(email, phone).encode("utf-8")).hexdigest()
    return f"acct_{digest[:24]}"


def _hash_password(password: str) -> str:
    if len(password) < 4:
        raise ValueError("Password must be at least 4 characters")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        240_000,
    ).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        method, salt, expected = stored.split("$", 2)
    except ValueError:
        return False
    if method != "pbkdf2_sha256":
        return False
    actual = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        240_000,
    ).hex()
    return hmac.compare_digest(actual, expected)


def _account_from_row(row: sqlite3.Row) -> dict[str, str]:
    return {
        "accountId": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
    }


def _default_library() -> dict[str, Any]:
    now = _now()
    return {
        "folders": [{"id": "favorites", "name": "Favorites", "createdAt": now}],
        "models": [],
    }


def _sanitize_library(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Saved library must be an object")
    folders = value.get("folders")
    models = value.get("models")
    if not isinstance(folders, list):
        folders = []
    if not isinstance(models, list):
        models = []
    clean = {
        "folders": folders[:80],
        "models": models[:250],
    }
    if not clean["folders"]:
        clean["folders"] = _default_library()["folders"]
    encoded = json.dumps(clean, separators=(",", ":"), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_LIBRARY_BYTES:
        raise ValueError("Saved library is too large")
    return clean


def login_or_create_account(
    *,
    name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    password: str | None = None,
) -> dict[str, Any]:
    """Create an account or log into the existing matching email/phone account."""
    clean_email = _clean_email(email)
    clean_phone = _clean_phone(phone)
    account_id = _account_id(clean_email, clean_phone)
    password_value = password or ""
    token = secrets.token_urlsafe(32)
    now = _now()

    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM accounts WHERE id = ?",
            (account_id,),
        ).fetchone()
        if row:
            if not _verify_password(password_value, row["password_hash"]):
                raise ValueError("Wrong password for this account")
            if name:
                conn.execute(
                    "UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?",
                    (name.strip(), now, account_id),
                )
            account = _account_from_row(
                conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
            )
        else:
            password_hash = _hash_password(password_value)
            conn.execute(
                """
                INSERT INTO accounts (id, name, email, phone, password_hash, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    account_id,
                    (name or "").strip(),
                    clean_email,
                    clean_phone,
                    password_hash,
                    now,
                    now,
                ),
            )
            account = {
                "accountId": account_id,
                "name": (name or "").strip(),
                "email": clean_email,
                "phone": clean_phone,
            }
        conn.execute(
            """
            INSERT INTO sessions (token, account_id, created_at, last_seen)
            VALUES (?, ?, ?, ?)
            """,
            (token, account_id, now, now),
        )
        conn.commit()
    return {"token": token, "account": account}


def account_from_token(token: str | None) -> dict[str, str] | None:
    if not token:
        return None
    now = _now()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT accounts.*
            FROM sessions
            JOIN accounts ON accounts.id = sessions.account_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()
        if row is None:
            return None
        conn.execute(
            "UPDATE sessions SET last_seen = ? WHERE token = ?",
            (now, token),
        )
        conn.commit()
        return _account_from_row(row)


def load_saved_library(token: str) -> dict[str, Any]:
    account = account_from_token(token)
    if account is None:
        raise PermissionError("Login required")
    with _connect() as conn:
        row = conn.execute(
            "SELECT library_json FROM saved_libraries WHERE account_id = ?",
            (account["accountId"],),
        ).fetchone()
    if row is None:
        library = _default_library()
    else:
        try:
            library = _sanitize_library(json.loads(row["library_json"]))
        except (json.JSONDecodeError, ValueError):
            library = _default_library()
    return {"account": account, "library": library}


def save_saved_library(token: str, library: Any) -> dict[str, Any]:
    account = account_from_token(token)
    if account is None:
        raise PermissionError("Login required")
    clean = _sanitize_library(library)
    now = _now()
    encoded = json.dumps(clean, separators=(",", ":"), ensure_ascii=False)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO saved_libraries (account_id, library_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(account_id)
            DO UPDATE SET library_json = excluded.library_json, updated_at = excluded.updated_at
            """,
            (account["accountId"], encoded, now),
        )
        conn.commit()
    return {"account": account, "library": clean}
