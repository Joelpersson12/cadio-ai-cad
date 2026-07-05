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
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DB_ENV = "CADIO_ACCOUNT_DB"
DATA_DIR_ENV = "CADIO_DATA_DIR"
MAX_LIBRARY_BYTES = 350_000
FREE_DOWNLOAD_LIMIT = 3
PRO_MONTHLY_LIMIT = 20


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


# Records what _connect() ACTUALLY used on its last call, so diagnostics reflect
# the real data path rather than a separate probe. Critically: the app can
# connect to Turso but then fall back to ephemeral local SQLite if a later setup
# step (row_factory / _init) throws — these globals capture that.
_ACTIVE_BACKEND: str = "unknown"
_TURSO_ERROR: str = ""


# ---------------------------------------------------------------------------
# libsql (Turso) compatibility shims.
#
# libsql_experimental's Rust-backed objects only partially mimic sqlite3:
#   * its Cursor is not iterable (handled in _ensure_column),
#   * its Connection does NOT support the `with conn:` context manager, and
#   * its rows are plain tuples (no row["column"] access).
# This module relies on all three sqlite3 behaviours, so a libsql connection is
# wrapped to provide them. Local sqlite3 connections are returned unwrapped.
# ---------------------------------------------------------------------------


class _LibsqlRow:
    """A row supporting both name access (row["col"]) and index access (row[0]),
    plus .keys()/in/.get(), matching the sqlite3.Row API this module uses."""

    __slots__ = ("_values", "_map")

    def __init__(self, columns: list[str], values: Any) -> None:
        self._values = values
        self._map = {col: values[idx] for idx, col in enumerate(columns)}

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return self._values[key]
        return self._map[key]

    def keys(self) -> Any:
        return list(self._map.keys())

    def __contains__(self, key: Any) -> bool:
        return key in self._map

    def get(self, key: str, default: Any = None) -> Any:
        return self._map.get(key, default)


class _LibsqlCursor:
    def __init__(self, cursor: Any) -> None:
        self._cursor = cursor

    def _columns(self) -> list[str]:
        return [d[0] for d in (self._cursor.description or [])]

    def fetchone(self) -> Any:
        row = self._cursor.fetchone()
        return None if row is None else _LibsqlRow(self._columns(), row)

    def fetchall(self) -> list[Any]:
        columns = self._columns()
        return [_LibsqlRow(columns, row) for row in self._cursor.fetchall()]

    def __getattr__(self, name: str) -> Any:
        return getattr(self._cursor, name)


class _LibsqlConn:
    """Adapter so a libsql connection works with `with conn:` and returns rows
    that support name and index access — the sqlite3 behaviours this code uses."""

    def __init__(self, conn: Any) -> None:
        self._conn = conn

    def execute(self, *args: Any, **kwargs: Any) -> _LibsqlCursor:
        return _LibsqlCursor(self._conn.execute(*args, **kwargs))

    def __enter__(self) -> "_LibsqlConn":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                try:
                    self._conn.rollback()
                except Exception:  # noqa: BLE001
                    pass
        finally:
            try:
                self._conn.close()
            except Exception:  # noqa: BLE001
                pass
        return False

    def commit(self) -> Any:
        return self._conn.commit()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._conn, name)


def _connect():
    global _ACTIVE_BACKEND, _TURSO_ERROR
    turso_url = os.environ.get("TURSO_DATABASE_URL", "")
    turso_token = os.environ.get("TURSO_AUTH_TOKEN", "")
    if turso_url:
        try:
            import libsql_experimental as libsql  # type: ignore[import]
            raw = libsql.connect(database=turso_url, auth_token=turso_token)
            # Wrap so `with conn:` and row["col"]/row[0] access work like sqlite3.
            conn = _LibsqlConn(raw)
            _init(conn)
            _ACTIVE_BACKEND = "turso"
            _TURSO_ERROR = ""
            return conn
        except ImportError:
            # Driver missing — the persistent DB silently degrades to ephemeral
            # local storage. Loud warning so this is caught instead of losing data.
            _TURSO_ERROR = "libsql-experimental not installed"
            print(
                "[account_store] WARNING: TURSO_DATABASE_URL is set but "
                "'libsql-experimental' is not installed — falling back to "
                "EPHEMERAL local SQLite (accounts/plans will be lost on restart). "
                "Add 'libsql-experimental' to requirements.txt."
            )
        except Exception as exc:  # noqa: BLE001 — never let DB setup crash the app
            _TURSO_ERROR = repr(exc)
            print(f"[account_store] WARNING: Turso connection failed ({exc!r}); falling back to local SQLite.")
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    _init(conn)
    _ACTIVE_BACKEND = "local-ephemeral"
    return conn


def db_backend_status() -> dict[str, Any]:
    """Report which database backend is ACTUALLY in use (for diagnostics).

    This opens a live connection and runs a real query so it reflects the truth,
    not merely whether the env vars are set. ``_connect()`` silently falls back
    to ephemeral local SQLite when a configured Turso connection fails at
    runtime, which otherwise hides the real reason accounts/logins keep resetting
    on every Space rebuild.
    """
    turso_url = os.environ.get("TURSO_DATABASE_URL", "")
    turso_token = os.environ.get("TURSO_AUTH_TOKEN", "")
    if not turso_url:
        return {
            "backend": "local-ephemeral",
            "turso_configured": False,
            "persistent": False,
            "hint": "Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN on the Space to persist accounts across rebuilds.",
        }

    try:
        import libsql_experimental as libsql  # type: ignore[import]
    except ImportError:
        return {
            "backend": "local-ephemeral",
            "turso_configured": True,
            "persistent": False,
            "driver_installed": False,
            "auth_token_set": bool(turso_token),
            "warning": "TURSO_DATABASE_URL is set but 'libsql-experimental' is not installed — Turso vars are ignored and accounts are EPHEMERAL.",
        }

    # Vars set + driver present — exercise the APP's real _connect() path so we
    # report the backend it actually lands on. _connect() can connect to Turso
    # and then fall back to ephemeral if a setup step throws, which a separate
    # probe would miss.
    try:
        conn = _connect()
        accounts = 0
        sessions = 0
        try:
            row = conn.execute("SELECT count(*) FROM accounts").fetchone()
            accounts = int(row[0]) if row else 0
            row = conn.execute("SELECT count(*) FROM sessions").fetchone()
            sessions = int(row[0]) if row else 0
        except Exception:
            pass
        if _ACTIVE_BACKEND == "turso":
            return {
                "backend": "turso",
                "turso_configured": True,
                "persistent": True,
                "driver_installed": True,
                "connection": "ok",
                "auth_token_set": bool(turso_token),
                "accounts": accounts,
                "sessions": sessions,
                "url_tail": turso_url[-32:],
            }
        return {
            "backend": "local-ephemeral (TURSO FELL BACK)",
            "turso_configured": True,
            "persistent": False,
            "driver_installed": True,
            "connection": "fell_back",
            "auth_token_set": bool(turso_token),
            "turso_error": _TURSO_ERROR[:300],
            "accounts_in_ephemeral": accounts,
            "hint": "The app connected but fell back to EPHEMERAL local SQLite (writes lost on rebuild). See turso_error for why.",
        }
    except Exception as exc:  # noqa: BLE001 — diagnostics must never throw
        return {
            "backend": "unknown (probe failed)",
            "turso_configured": True,
            "persistent": False,
            "driver_installed": True,
            "auth_token_set": bool(turso_token),
            "error": str(exc)[:300],
        }


def _init(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            plan TEXT NOT NULL DEFAULT 'free',
            downloads_used INTEGER NOT NULL DEFAULT 0,
            download_limit INTEGER NOT NULL DEFAULT 3,
            monthly_downloads_used INTEGER NOT NULL DEFAULT 0,
            monthly_reset_date TEXT NOT NULL DEFAULT '',
            agreed_terms INTEGER NOT NULL DEFAULT 0,
            stripe_customer_id TEXT NOT NULL DEFAULT '',
            stripe_subscription_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    _ensure_column(conn, "accounts", "plan", "TEXT NOT NULL DEFAULT 'free'")
    _ensure_column(conn, "accounts", "downloads_used", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "accounts", "download_limit", "INTEGER NOT NULL DEFAULT 3")
    _ensure_column(conn, "accounts", "monthly_downloads_used", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "accounts", "monthly_reset_date", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "accounts", "agreed_terms", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "accounts", "stripe_customer_id", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "accounts", "stripe_subscription_id", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "accounts", "oauth_provider", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "accounts", "oauth_provider_id", "TEXT NOT NULL DEFAULT ''")
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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            token TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )
        """
    )
    conn.commit()


def _ensure_column(
    conn: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    # NOTE: libsql (Turso) cursors are NOT iterable — `for row in conn.execute(...)`
    # raises "'builtins.Cursor' object is not iterable", which previously made
    # _init() throw and silently dropped the whole app back to ephemeral local
    # SQLite (every account/login lost on each rebuild). Always materialize with
    # fetchall(), and read the column name by key OR position (col 1 of
    # PRAGMA table_info) so it works whether rows are sqlite3.Row, dict, or tuple.
    columns: set[str] = set()
    for row in conn.execute(f"PRAGMA table_info({table})").fetchall():
        try:
            columns.add(row["name"])
        except (TypeError, KeyError, IndexError):
            columns.add(row[1])
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


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


def _row_value(row: sqlite3.Row, key: str, fallback: Any) -> Any:
    return row[key] if key in row.keys() and row[key] is not None else fallback


def _admin_emails() -> set[str]:
    raw = os.environ.get("CADIO_ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _account_from_row(row: sqlite3.Row) -> dict[str, Any]:
    plan = _row_value(row, "plan", "free")
    email = row["email"] or ""

    # Admin accounts always get unlimited access
    if email.lower() in _admin_emails():
        plan = "unlimited"

    downloads_used = max(0, int(_row_value(row, "downloads_used", 0)))
    download_limit = int(_row_value(row, "download_limit", FREE_DOWNLOAD_LIMIT))
    monthly_downloads_used = max(0, int(_row_value(row, "monthly_downloads_used", 0)))

    if plan == "unlimited":
        can_download = True
        downloads_remaining = None
    elif plan == "pro":
        can_download = monthly_downloads_used < PRO_MONTHLY_LIMIT
        downloads_remaining = max(0, PRO_MONTHLY_LIMIT - monthly_downloads_used)
    elif download_limit < 0:
        can_download = True
        downloads_remaining = None
    else:
        can_download = downloads_used < download_limit
        downloads_remaining = max(0, download_limit - downloads_used)

    stripe_customer_id = _row_value(row, "stripe_customer_id", "")
    stripe_subscription_id = _row_value(row, "stripe_subscription_id", "")

    return {
        "accountId": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "plan": plan,
        "downloadsUsed": downloads_used,
        "downloadLimit": download_limit,
        "monthlyDownloadsUsed": monthly_downloads_used,
        "downloadsRemaining": downloads_remaining,
        "canDownload": can_download,
        "hasStripeSubscription": bool(stripe_customer_id and stripe_subscription_id),
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
    agreed_terms: bool = False,
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
                INSERT INTO accounts (
                    id, name, email, phone, password_hash,
                    plan, downloads_used, download_limit,
                    monthly_downloads_used, monthly_reset_date,
                    agreed_terms,
                    stripe_customer_id, stripe_subscription_id,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    account_id,
                    (name or "").strip(),
                    clean_email,
                    clean_phone,
                    password_hash,
                    "free",
                    0,
                    FREE_DOWNLOAD_LIMIT,
                    0,
                    "",
                    1 if agreed_terms else 0,
                    "",
                    "",
                    now,
                    now,
                ),
            )
            account = {
                "accountId": account_id,
                "name": (name or "").strip(),
                "email": clean_email,
                "phone": clean_phone,
                "plan": "free",
                "downloadsUsed": 0,
                "downloadLimit": FREE_DOWNLOAD_LIMIT,
                "monthlyDownloadsUsed": 0,
                "downloadsRemaining": FREE_DOWNLOAD_LIMIT,
                "canDownload": True,
            }
        conn.execute(
            """
            INSERT INTO sessions (token, account_id, created_at, last_seen)
            VALUES (?, ?, ?, ?)
            """,
            (token, account_id, now, now),
        )
        conn.commit()
    # Self-heal a paid plan from Stripe if the local record lost it.
    if reconcile_plan_with_stripe(account_id, clean_email or "", str(account.get("plan", "free"))):
        account = _refetch_account(account_id) or account
    return {"token": token, "account": account}


def login_or_create_with_google(
    *,
    google_sub: str,
    email: str,
    name: str | None = None,
) -> dict[str, Any]:
    """Create or log in via a verified Google identity."""
    clean_email = _clean_email(email)
    if not clean_email:
        raise ValueError("Google account must have an email address")
    account_id = _account_id(clean_email, None)
    token = secrets.token_urlsafe(32)
    now = _now()

    with _connect() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if row:
            if not _row_value(row, "oauth_provider_id", ""):
                conn.execute(
                    "UPDATE accounts SET oauth_provider = 'google', oauth_provider_id = ?, updated_at = ? WHERE id = ?",
                    (google_sub, now, account_id),
                )
            if name and not row["name"]:
                conn.execute(
                    "UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?",
                    (name.strip(), now, account_id),
                )
            account = _account_from_row(
                conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
            )
        else:
            conn.execute(
                """
                INSERT INTO accounts (
                    id, name, email, phone, password_hash,
                    plan, downloads_used, download_limit,
                    monthly_downloads_used, monthly_reset_date, agreed_terms,
                    stripe_customer_id, stripe_subscription_id,
                    oauth_provider, oauth_provider_id,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    account_id,
                    (name or "").strip(),
                    clean_email,
                    "",
                    "oauth:google",
                    "free",
                    0,
                    FREE_DOWNLOAD_LIMIT,
                    0,
                    "",
                    1,
                    "",
                    "",
                    "google",
                    google_sub,
                    now,
                    now,
                ),
            )
            account = {
                "accountId": account_id,
                "name": (name or "").strip(),
                "email": clean_email,
                "phone": "",
                "plan": "free",
                "downloadsUsed": 0,
                "downloadLimit": FREE_DOWNLOAD_LIMIT,
                "monthlyDownloadsUsed": 0,
                "downloadsRemaining": FREE_DOWNLOAD_LIMIT,
                "canDownload": True,
            }
        conn.execute(
            "INSERT INTO sessions (token, account_id, created_at, last_seen) VALUES (?, ?, ?, ?)",
            (token, account_id, now, now),
        )
        conn.commit()
    if reconcile_plan_with_stripe(account_id, clean_email, str(account.get("plan", "free"))):
        account = _refetch_account(account_id) or account
    return {"token": token, "account": account}


def account_from_token(token: str | None) -> dict[str, Any] | None:
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


def get_account_profile(token: str | None) -> dict[str, Any]:
    account = account_from_token(token)
    if account is None:
        raise PermissionError("Login required")
    # Self-heal a paid plan from Stripe if the local record shows free (e.g. the
    # account row was recreated after the Space restarted on ephemeral storage).
    if str(account.get("plan", "free")) == "free" and account.get("email"):
        if reconcile_plan_with_stripe(str(account.get("accountId", "")), str(account.get("email", "")), "free"):
            account = _refetch_account(str(account.get("accountId", ""))) or account
    return account


def consume_download(token: str | None) -> dict[str, Any]:
    if not token:
        raise PermissionError("Login required to download")
    now = _now()
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")
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
            raise PermissionError("Login required to download")
        plan = _row_value(row, "plan", "free")
        account_id = row["id"]

        if plan == "pro":
            reset_date = _row_value(row, "monthly_reset_date", "")
            monthly_used = max(0, int(_row_value(row, "monthly_downloads_used", 0)))
            if not reset_date.startswith(month_key):
                conn.execute(
                    "UPDATE accounts SET monthly_downloads_used = 0, monthly_reset_date = ?, updated_at = ? WHERE id = ?",
                    (month_key, now, account_id),
                )
                monthly_used = 0
            if monthly_used >= PRO_MONTHLY_LIMIT:
                raise ValueError(
                    f"Monthly download limit of {PRO_MONTHLY_LIMIT} reached. Upgrade to Unlimited for unlimited downloads."
                )
            conn.execute(
                "UPDATE accounts SET monthly_downloads_used = monthly_downloads_used + 1, updated_at = ? WHERE id = ?",
                (now, account_id),
            )
        elif plan == "unlimited":
            pass  # no limit
        else:
            # free plan
            downloads_used = max(0, int(_row_value(row, "downloads_used", 0)))
            download_limit = int(_row_value(row, "download_limit", FREE_DOWNLOAD_LIMIT))
            if download_limit >= 0 and downloads_used >= download_limit:
                raise ValueError(
                    f"You've used all {download_limit} free downloads. Upgrade to Pro or Unlimited for more."
                )
            conn.execute(
                "UPDATE accounts SET downloads_used = downloads_used + 1, updated_at = ? WHERE id = ?",
                (now, account_id),
            )

        conn.execute(
            "UPDATE sessions SET last_seen = ? WHERE token = ?",
            (now, token),
        )
        updated = conn.execute(
            "SELECT * FROM accounts WHERE id = ?",
            (account_id,),
        ).fetchone()
        conn.commit()
    return _account_from_row(updated)


def upgrade_plan(
    account_id: str,
    plan: str,
    stripe_customer_id: str = "",
    stripe_subscription_id: str = "",
) -> dict[str, Any]:
    """Upgrade or downgrade an account plan. Called by Stripe webhook."""
    now = _now()
    new_limit = FREE_DOWNLOAD_LIMIT if plan == "free" else -1
    with _connect() as conn:
        conn.execute(
            """
            UPDATE accounts
            SET plan = ?, download_limit = ?,
                stripe_customer_id = ?, stripe_subscription_id = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (plan, new_limit, stripe_customer_id, stripe_subscription_id, now, account_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if row is None:
            raise ValueError("Account not found")
        return _account_from_row(row)


_PLAN_RANK = {"free": 0, "pro": 1, "unlimited": 2}


def _sf(obj: Any, key: str, default: Any = "") -> Any:
    """Read a field from a Stripe object. Recent stripe-python objects don't
    support dict ``.get``, so use index access (which they do support, like the
    webhook code) and fall back to attribute access."""
    try:
        if key in obj:
            return obj[key]
    except (TypeError, AttributeError, KeyError):
        pass
    return getattr(obj, key, default)


def _stripe_list_data(result: Any) -> list[Any]:
    """Return the ``data`` list from a Stripe ListObject across versions."""
    data = getattr(result, "data", None)
    if data is None:
        data = _sf(result, "data", [])
    return list(data or [])


def _plan_from_subscriptions(subs: list[Any], price_unlimited: str, statuses: list[str]) -> tuple[str | None, str]:
    """Return (best plan, subscription_id) from a list of Stripe subscriptions."""
    best_plan: str | None = None
    best_rank = 0
    best_sub = ""
    for sub in subs:
        status = str(_sf(sub, "status", ""))
        statuses.append(status)
        if status not in ("active", "trialing", "past_due"):
            continue
        try:
            price_id = sub["items"]["data"][0]["price"]["id"]
        except Exception:
            price_id = ""
        plan = "unlimited" if price_id and price_id == price_unlimited else "pro"
        rank = _PLAN_RANK.get(plan, 0)
        if rank > best_rank:
            best_rank, best_plan, best_sub = rank, plan, str(_sf(sub, "id", ""))
    return best_plan, best_sub


def stripe_active_plan(email: str, known_customer_id: str = "") -> tuple[str | None, dict[str, Any]]:
    """Find the best active plan for a user in Stripe + a diagnostic. Looks up by a
    known customer id first (covers customers created before persistence worked),
    then by email across up to 5 matching customers, accepting any live
    subscription (active/trialing/past_due). Returns (plan or None, info). Never raises."""
    info: dict[str, Any] = {}
    try:
        stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
        clean = _clean_email(email)
        info["email"] = clean
        info["stripe_configured"] = bool(stripe_key)
        # Surface whether we're in test or live mode — a test/live key mismatch
        # is a common reason a clearly-active subscription "can't be found".
        info["key_mode"] = (
            "live" if stripe_key.startswith("sk_live") or stripe_key.startswith("rk_live")
            else "test" if stripe_key.startswith("sk_test") or stripe_key.startswith("rk_test")
            else "unknown"
        )
        if not stripe_key or not (clean or known_customer_id):
            return None, info
        import stripe as stripe_lib

        stripe_lib.api_key = stripe_key
        price_unlimited = os.environ.get("STRIPE_PRICE_UNLIMITED", "")
        statuses: list[str] = []
        best_plan: str | None = None
        best_customer = ""
        best_sub = ""
        best_rank = 0

        # 1) Direct lookup by a customer id we already have on file.
        customer_ids: list[str] = []
        if known_customer_id:
            customer_ids.append(known_customer_id)

        # 2) Lookup by email.
        if clean:
            try:
                customers = _stripe_list_data(stripe_lib.Customer.list(email=clean, limit=5))
                info["customers_found"] = len(customers)
                for cust in customers:
                    cid = str(_sf(cust, "id", ""))
                    if cid and cid not in customer_ids:
                        customer_ids.append(cid)
            except Exception as exc:  # noqa: BLE001
                info["customer_list_error"] = repr(exc)

        for cid in customer_ids:
            try:
                subs = _stripe_list_data(stripe_lib.Subscription.list(customer=cid, status="all", limit=10))
            except Exception as exc:  # noqa: BLE001
                info.setdefault("subscription_errors", []).append(repr(exc))
                continue
            plan, sub_id = _plan_from_subscriptions(subs, price_unlimited, statuses)
            rank = _PLAN_RANK.get(plan or "free", 0)
            if rank > best_rank:
                best_rank, best_plan, best_customer, best_sub = rank, plan, cid, sub_id

        info["customers_checked"] = len(customer_ids)
        info["subscription_statuses"] = statuses
        info["plan"] = best_plan
        info["customer_id"] = best_customer
        info["subscription_id"] = best_sub
        return best_plan, info
    except Exception as exc:  # noqa: BLE001
        info["error"] = repr(exc)
        return None, info


def _account_stripe_customer_id(account_id: str) -> str:
    """Read the stored Stripe customer id for an account (not in the public profile)."""
    try:
        with _connect() as conn:
            row = conn.execute(
                "SELECT stripe_customer_id FROM accounts WHERE id = ?", (account_id,)
            ).fetchone()
        if row is None:
            return ""
        try:
            value = row["stripe_customer_id"]
        except Exception:
            value = row[0]
        return str(value or "")
    except Exception:
        return ""


def reconcile_plan_with_stripe(account_id: str, email: str, current_plan: str) -> str | None:
    """Restore a paid plan from Stripe (source of truth) when the local DB shows
    free. Only ever upgrades, never raises."""
    plan, info = stripe_active_plan(email, _account_stripe_customer_id(account_id))
    try:
        if plan and _PLAN_RANK.get(plan, 0) > _PLAN_RANK.get(current_plan, 0):
            upgrade_plan(
                account_id,
                plan,
                stripe_customer_id=str(info.get("customer_id", "")),
                stripe_subscription_id=str(info.get("subscription_id", "")),
            )
            return plan
    except Exception:
        pass
    return None


def refresh_account_plan(token: str | None) -> dict[str, Any]:
    """Force a Stripe re-check for the logged-in user and apply any paid plan.
    Returns the (possibly upgraded) account plus a Stripe diagnostic."""
    account = account_from_token(token)
    if account is None:
        raise PermissionError("Login required")
    account_id = str(account.get("accountId", ""))
    plan, info = stripe_active_plan(str(account.get("email", "")), _account_stripe_customer_id(account_id))
    current = str(account.get("plan", "free"))
    if plan and _PLAN_RANK.get(plan, 0) > _PLAN_RANK.get(current, 0):
        upgrade_plan(
            account_id,
            plan,
            stripe_customer_id=str(info.get("customer_id", "")),
            stripe_subscription_id=str(info.get("subscription_id", "")),
        )
        account = _refetch_account(account_id) or account
    return {"account": account, "stripe": info}


def _refetch_account(account_id: str) -> dict[str, Any] | None:
    try:
        with _connect() as conn:
            row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
            return _account_from_row(row) if row else None
    except Exception:
        return None


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


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

RESET_TOKEN_TTL_HOURS = 1


def _send_reset_email(to_email: str, to_name: str, reset_token: str) -> None:
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        return  # email not configured; token still written to DB

    app_url = os.environ.get("APP_URL", "https://cadio.net")
    reset_url = f"{app_url}/?reset_token={reset_token}"
    display_name = to_name.strip() or "there"

    payload = {
        "from": "Cadio <no-reply@cadio.net>",
        "to": [to_email],
        "subject": "Reset your Cadio password",
        "html": (
            f"<p>Hi {display_name},</p>"
            f"<p>Click the link below to reset your password. "
            f"The link expires in {RESET_TOKEN_TTL_HOURS} hour.</p>"
            f'<p><a href="{reset_url}">{reset_url}</a></p>'
            f"<p>If you didn't request this, you can safely ignore this email.</p>"
            f"<p>— The Cadio team</p>"
        ),
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
    except Exception:
        pass  # silently swallow; token is in DB regardless


def create_password_reset_token(email: str) -> None:
    """Create a reset token and email it. Always returns without revealing existence."""
    clean_email = _clean_email(email)
    if not clean_email:
        return

    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM accounts WHERE email = ?",
            (clean_email,),
        ).fetchone()
        if row is None:
            return  # no account — don't reveal this

        account_id = row["id"]
        name = row["name"] or ""

        reset_token = secrets.token_urlsafe(32)
        now = _now()
        expires_at = (
            datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_TTL_HOURS)
        ).isoformat()

        conn.execute(
            """
            INSERT INTO password_reset_tokens (token, account_id, expires_at, used, created_at)
            VALUES (?, ?, ?, 0, ?)
            """,
            (reset_token, account_id, expires_at, now),
        )
        conn.commit()

    _send_reset_email(clean_email, name, reset_token)


def reset_password_with_token(reset_token: str, new_password: str) -> dict[str, Any]:
    """Validate reset token, set new password, return auth session."""
    if not reset_token:
        raise ValueError("Invalid or expired reset link")
    if len(new_password) < 4:
        raise ValueError("Password must be at least 4 characters")

    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    session_token = secrets.token_urlsafe(32)

    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM password_reset_tokens WHERE token = ?",
            (reset_token,),
        ).fetchone()

        if row is None:
            raise ValueError("Invalid or expired reset link")
        if row["used"]:
            raise ValueError("This reset link has already been used")
        expires_at = datetime.fromisoformat(row["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if now_dt > expires_at:
            raise ValueError("Reset link has expired — please request a new one")

        account_id = row["account_id"]
        password_hash = _hash_password(new_password)

        conn.execute(
            "UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?",
            (password_hash, now, account_id),
        )
        conn.execute(
            "UPDATE password_reset_tokens SET used = 1 WHERE token = ?",
            (reset_token,),
        )
        conn.execute(
            "INSERT INTO sessions (token, account_id, created_at, last_seen) VALUES (?, ?, ?, ?)",
            (session_token, account_id, now, now),
        )
        conn.commit()

        account_row = conn.execute(
            "SELECT * FROM accounts WHERE id = ?",
            (account_id,),
        ).fetchone()

    return {"token": session_token, "account": _account_from_row(account_row)}
