"""Source-scan gate — every secret/token/signature comparison rides a
constant-time compare (hmac/secrets.compare_digest), never plain ==.

Why a SOURCE scan (and not a timing measurement): the mutation audit
on 2026-10-30 proved the functional belts cannot see this class —
swapping `hmac.compare_digest(header_token, cookie_token)` for `!=`
in fb_dashboard/app/middleware.py passes the ENTIRE suite (the
double-submit e2e pins wrong-token→403 / matching→200, and `==`
produces byte-identical observable outcomes). The only property lost
is side-channel resistance, which is exactly what the attacker uses.
Statistical timing probes are flaky in CI (scheduler noise dwarfs the
nanosecond-scale leak), so the honest pin is the repo's own idiom for
implementation contracts: scan the live source (comments stripped —
tombstone prose quoting old shapes can never satisfy a pin) and
demand the constant-time spelling at every comparison site.

The pinned inventory (2026-10-30, 8 sites — grown from the audit):
  · app/middleware.py      — the CSRF double-submit cookie/header pair
  · app/webhooks.py        — Meta hub verify token + X-Hub-Signature-256
  · app/telegram.py        — the Telegram bot secret header
  · routers/bot.py         — the bot API bearer secret
  · routers/plans_config.py— the CRON secret (header AND form token)
  · commerce_engine.py     — payment signature verification

The reverse pin: no secret-named variable may ride a plain ==/!=
comparison anywhere in fb_dashboard/ (the audit found zero — this gate
keeps it zero). A new comparison site added without compare_digest
fails this file loudly on the next push.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DEBUG", "True")

import pytest

ROOT = Path(__file__).resolve().parent.parent
PKG = ROOT / "fb_dashboard"

# Sites that must use a constant-time compare (path → the secret being
# compared). Every entry was verified by hand on 2026-10-30; the value
# documents WHAT is protected so a future reader can re-verify intent.
CONSTANT_TIME_SITES: dict[str, str] = {
    "app/middleware.py": "CSRF double-submit header↔cookie",
    "app/webhooks.py": "hub verify token + X-Hub-Signature-256",
    "app/telegram.py": "Telegram secret-token header",
    "routers/bot.py": "bot API bearer secret",
    "routers/plans_config.py": "CRON secret (header and form token)",
    "commerce_engine.py": "payment signature verification",
}

STRIP_BLOCK = re.compile(r"/\*[\s\S]*?\*/")
STRIP_LINE = re.compile(r"^\s*#.*$", re.MULTILINE)
STRIP_DOCSTRINGS = re.compile(r"(?:^|[=(:\[,\s])\"\"\"[\s\S]*?\"\"\"", re.MULTILINE)


def _live_source(rel: str) -> str:
    """The file's source with comments AND docstrings stripped (the
    landing-funnel convention): tombstone prose quoting an OLD shape —
    like plans_config.py's docstring narrating the retired
    `token != CRON_SECRET` — can never satisfy or fake a pin."""
    raw = (PKG / rel).read_text(encoding="utf-8")
    return STRIP_LINE.sub("", STRIP_DOCSTRINGS.sub("", STRIP_BLOCK.sub("", raw)))


class TestConstantTimeCompares:
    def test_every_pinned_site_uses_compare_digest(self) -> None:
        """Each inventoried site must spell a constant-time compare in
        live code. A regression to plain == (the mutation the audit
        planted) turns this red immediately."""
        for rel, what in CONSTANT_TIME_SITES.items():
            src = _live_source(rel)
            assert re.search(r"(?:hmac|secrets)\.compare_digest\s*\(", src), (
                f"{rel} lost its constant-time compare ({what}) — "
                "a plain ==/!= leaks the secret through timing. Restore "
                "hmac.compare_digest / secrets.compare_digest."
            )

    def test_no_secret_variable_rides_a_plain_equality(self) -> None:
        """The reverse pin: no secret-VALUE comparison on ==/!= anywhere.

        Shape-true filter (the audit's false-positive harvest taught
        the shapes): only a comparison where a secret-NAMED variable
        meets another VARIABLE/attribute — `header_token == cookie_token`,
        `sig != expected` — is a value comparison. A secret-named STRING
        LITERAL on one side (`key == "fb_access_token"`) is a config-key
        lookup, and `if not secret:` truthiness leaks nothing."""
        offenders: list[str] = []
        # identifier-ish operand that carries a secret name
        SECRET_IDENT = r"[A-Za-z0-9_]*(?:[Tt]oken|[Ss]ecret|[Ss]ignature|[Ss]ig|password)[A-Za-z0-9_]*"
        # the OTHER side: an identifier/attribute/call — NOT a literal
        OTHER_IDENT = r"(?:[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*|\([^)]*\))"
        for py in sorted(PKG.rglob("*.py")):
            if "__pycache__" in py.parts:
                continue
            rel = py.relative_to(PKG).as_posix()
            src = _live_source(rel)
            for lineno, line in enumerate(src.splitlines(), start=1):
                stripped = line.strip()
                if "compare_digest" in stripped:
                    continue
                m = re.search(
                    rf"({SECRET_IDENT})\s*([=!]=)\s*({OTHER_IDENT})"
                    rf"|({OTHER_IDENT})\s*([=!]=)\s*({SECRET_IDENT})",
                    stripped,
                )
                if m:
                    offenders.append(f"{rel}:{lineno}: {stripped}")
        assert not offenders, (
            "plain-equality comparison between a secret-named variable and "
            "another variable (side-channel class — use "
            "hmac/secrets.compare_digest):\n  " + "\n  ".join(offenders)
        )


@pytest.mark.parametrize("rel", sorted(CONSTANT_TIME_SITES))
def test_compare_digest_call_is_live(rel: str) -> None:
    """The constant-time spelling must actually RESOLVE (hmac/secrets
    imported in the file) — `compare_digest` referenced without the
    import is a NameError away from a 500, not a gate."""
    src = _live_source(rel)
    assert re.search(r"(?:hmac|secrets)\.compare_digest\s*\(", src), f"{rel}: no live compare_digest call"
    assert re.search(r"^import (?:hmac|secrets)|^from (?:hmac|secrets)", src, re.MULTILINE) or re.search(
        r"import (?:hmac|secrets)", src
    ), f"{rel}: compare_digest used without its hmac/secrets import"
