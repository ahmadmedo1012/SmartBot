from __future__ import annotations

"""v22 §0.3 — /api/version deployment verification gate.

The endpoint powers the post-deploy acceptance gate (plan v22 §0):
after every production deploy, curl /api/version and compare
``commit_sha`` to local ``git rev-parse HEAD``. These tests pin the
contract:

  1. PUBLIC — no auth cookie needed (the gate runs as a bare curl).
  2. ok() envelope {success: True, data: {...}} (Strict Rule #5).
  3. commit_sha reflects VERCEL_GIT_COMMIT_SHA when present (runtime
     source), falls back to the build-baked fb_dashboard/COMMIT_SHA file,
     and answers ``unknown`` when neither exists (local dev / tests) —
     never a fabricated value.
  4. version matches the canonical fb_dashboard/VERSION string
     (single source, _utils.app_version).
  5. No caching: the middleware's cacheable-prefix list must NOT contain
     /api/version (a CDN-cached previous deployment's answer would defeat
     the gate right after an alias switch — the 403-incident class).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
os.environ.setdefault("CRON_SECRET", "test-cron-secret")

import pytest


@pytest.fixture
def clean_version_env(monkeypatch):
    """Strip all Vercel git env vars so the fallback path is deterministic."""
    for var in (
        "VERCEL_GIT_COMMIT_SHA",
        "VERCEL_GIT_COMMIT_REF",
        "VERCEL_ENV",
        "VERCEL_REGION",
    ):
        monkeypatch.delenv(var, raising=False)
    return monkeypatch


async def test_version_public_ok_envelope(v10_world, clean_version_env):
    """No auth → 200 with the strict ok() envelope; bare-curl compatible."""
    r = await v10_world.client.get("/api/version")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert "error" not in body
    data = body["data"]
    assert set(data.keys()) == {
        "version",
        "commit_sha",
        "commit_sha_short",
        "git_ref",
        "deployment_env",
        "region",
        "timestamp",
    }


async def test_version_reports_runtime_commit_sha(v10_world, monkeypatch):
    """Runtime source wins: VERCEL_GIT_COMMIT_SHA is echoed verbatim."""
    sha = "a" * 40
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", sha)
    monkeypatch.setenv("VERCEL_GIT_COMMIT_REF", "main")
    monkeypatch.setenv("VERCEL_ENV", "production")
    r = await v10_world.client.get("/api/version")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["commit_sha"] == sha
    assert data["commit_sha_short"] == sha[:8]
    assert data["git_ref"] == "main"
    assert data["deployment_env"] == "production"


async def test_version_fallback_baked_file(v10_world, clean_version_env, tmp_path):
    """No runtime env var → reads the build-baked fb_dashboard/COMMIT_SHA."""
    import routers.plans_config as pc

    baked = tmp_path / "COMMIT_SHA"
    baked.write_text("b" * 40, encoding="utf-8")
    orig_base = pc.BASE_DIR
    pc.BASE_DIR = baked.parent
    try:
        r = await v10_world.client.get("/api/version")
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["commit_sha"] == "b" * 40
        assert data["commit_sha_short"] == "b" * 8
    finally:
        pc.BASE_DIR = orig_base


async def test_version_unknown_when_no_source(v10_world, clean_version_env, tmp_path):
    """Neither runtime var nor baked file → literal ``unknown`` (never fake)."""
    import routers.plans_config as pc

    baked = tmp_path / "COMMIT_SHA"  # does NOT exist — same dir, no file
    orig_base = pc.BASE_DIR
    pc.BASE_DIR = baked.parent
    try:
        r = await v10_world.client.get("/api/version")
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["commit_sha"] == "unknown"
        assert data["commit_sha_short"] == "unknown"
    finally:
        pc.BASE_DIR = orig_base


async def test_version_matches_canonical_version_file(v10_world, clean_version_env):
    """version string == _utils.app_version() (single source fb_dashboard/VERSION)."""
    from _utils import app_version

    r = await v10_world.client.get("/api/version")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["version"] == app_version()


def test_version_not_cacheable_prefix():
    """/api/version must NOT be in the middleware cacheable prefixes —
    a CDN-cached stale answer defeats the post-deploy gate."""
    import app.middleware as mw

    prefixes = getattr(mw, "_CACHEABLE_API_PREFIXES", ()) or ()
    for p in prefixes:
        assert not "/api/version".startswith(p), (
            f"/api/version caught by cacheable prefix {p!r} — a stale CDN answer "
            "would defeat the post-deploy gate (the 403-incident class)"
        )
