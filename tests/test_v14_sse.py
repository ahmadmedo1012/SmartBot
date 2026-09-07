"""v14-E6 (D9 gap G4) — SSE payment-stream resilience contract.

test_track_b_sse pins the happy path (approval reaches the waiting browser)
and tenant isolation, but the generator's FAILURE modes (sse.py lines 58-61
+ the lifetime cap + client-side disconnects + concurrency) were never
executed:

  1. a DB exception INSIDE the poll loop → logged, swallowed, the stream
     SURVIVES and still delivers the terminal update (no crash, no leak)
  2. the _SSE_MAX_LIFETIME cap fires with no status change → the stream
     emits exactly one snapshot then ``event: close`` and ends
  3. a client that closes early → every opened session is eventually
     closed (no __aexit__ leak) and the server serves the NEXT stream
     normally (not wedged)
  4. TWO concurrent streams on the SAME payment → both receive the
     verified update and the close event
  5. payment vanished mid-stream → ``event: error`` with the Arabic
     payload, and nothing else leaks out

Technique: routers.payments.sse.AsyncSessionLocal is swapped for a counting
fake session factory (full control of poll outcomes + open/close ledger),
while auth rides the real /api/login cookie on the v10_world app+DB.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from types import SimpleNamespace

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod-0123456789")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DEBUG", "True")

import pytest
from httpx import AsyncClient


# ── the fake AsyncSessionLocal (open/close ledger + mutable snapshot) ──

class _FakeSession:
    def __init__(self, factory: "_FakeSessionFactory"):
        self._f = factory

    async def __aenter__(self):
        self._f.opened += 1
        return self

    async def __aexit__(self, *exc):
        self._f.closed += 1
        return False

    async def get(self, model, payment_id):
        f = self._f
        if f.fail_polls > 0:
            f.fail_polls -= 1
            raise RuntimeError(f"simulated DB failure on payment {payment_id}")
        f.polls += 1
        snap = f.payment
        if snap is None or snap["id"] != payment_id:
            return None
        return SimpleNamespace(**snap)


class _FakeSessionFactory:
    """Drop-in for routers.payments.sse.AsyncSessionLocal.

    - ``payment``  : mutable snapshot dict the stream should serve
    - ``fail_polls``: how many NEXT polls raise (exception-path injection)
    - ``polls``    : total successful get() calls (activity detector)
    - opened/closed: __aenter__/__aexit__ ledger — leak detector
    """

    def __init__(self, payment: dict | None):
        self.payment = payment
        self.fail_polls = 0
        self.polls = 0
        self.opened = 0
        self.closed = 0

    def __call__(self) -> _FakeSession:
        return _FakeSession(self)


@pytest.fixture
def sse_module():
    import routers.payments.sse as sse_mod
    return sse_mod


@pytest.fixture
async def sse_env(v10_seed, monkeypatch, sse_module):
    """One authenticated world + a patched sse session factory + fast poll."""
    seed = v10_seed
    uname, tenant_id, user_id = await seed.tenant_user("sse")

    payment = {
        "id": 4242,
        "user_id": user_id,
        "tenant_id": None,
        "plan_id": 1,
        "plan_name": "برو",
        "status": "pending",
    }
    factory = _FakeSessionFactory(payment)
    monkeypatch.setattr(sse_module, "AsyncSessionLocal", factory)
    monkeypatch.setattr(sse_module, "_SSE_POLL_SECONDS", 0.2)

    await seed.login(uname)
    return SimpleNamespace(
        seed=seed, client=seed.world.client, factory=factory,
        payment=payment, user_id=user_id, sse=sse_module,
    )


async def _read_stream(ac: AsyncClient, payment_id: int, *,
                       max_events: int = 80,
                       timeout_s: float = 15.0):
    """Consume one SSE stream into [('data', obj) | ('event', str)] tuples.

    Stops on the END of the terminal chunk (close/error events are followed
    by a data line and a blank separator in the same chunk — breaking on the
    event line alone would swallow the chunk's data payload).
    """
    events: list[tuple[str, object]] = []
    saw_terminal = False
    async with ac.stream(
        "GET", f"/api/subscriptions/status-stream?payment_id={payment_id}"
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        async for line in resp.aiter_lines():
            if line.startswith("data: "):
                events.append(("data", json.loads(line[6:])))
            elif line.startswith("event: "):
                name = line[7:].strip()
                events.append(("event", name))
                if name in ("close", "error"):
                    saw_terminal = True
            elif line == "" and saw_terminal:
                break  # end of the terminal chunk — the stream is done
            if len(events) >= max_events:
                break
    return events


async def _wait_until(predicate, timeout_s: float = 3.0, interval: float = 0.05) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if predicate():
            return True
        await asyncio.sleep(interval)
    return predicate()


class _RawSSEDriver:
    """Minimal ASGI driver for ONE /status-stream call.

    httpx's ASGITransport (this version) buffers the whole response before
    returning it — a never-ending SSE stream can never be "closed early"
    through it. Driving the app directly with real receive() semantics lets
    the test issue ``http.disconnect`` mid-stream, which is exactly what
    uvicorn does when the browser drops the TCP connection.
    """

    def __init__(self, app, token: str, payment_id: int):
        self._app = app
        self._token = token
        self._pid = payment_id
        self.status: int | None = None
        self.chunks: list[bytes] = []
        self._request_done = False

    async def run(self, disconnect: asyncio.Event) -> None:
        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": "GET",
            "headers": [(b"cookie", f"token={self._token}".encode())],
            "scheme": "http", "path": "/api/subscriptions/status-stream",
            "raw_path": b"/api/subscriptions/status-stream",
            "query_string": f"payment_id={self._pid}".encode(),
            "server": ("test", 80), "client": ("127.0.0.1", 123),
            "root_path": "",
        }

        async def receive():
            if not self._request_done:
                self._request_done = True
                return {"type": "http.request", "body": b"", "more_body": False}
            await disconnect.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.start":
                self.status = message["status"]
            elif message["type"] == "http.response.body":
                self.chunks.append(message.get("body", b""))

        await self._app(scope, receive, send)

    @property
    def text(self) -> str:
        return b"".join(self.chunks).decode("utf-8", "replace")


# ────────────────────────────────────────────────────────────────────
# 1. exception inside the poll loop → survive, deliver, close cleanly
# ────────────────────────────────────────────────────────────────────

async def test_sse_poll_exception_is_swallowed_and_stream_survives(sse_env):
    sse_env.factory.fail_polls = 2  # first two polls raise inside the loop

    async def approve_after_delay():
        await asyncio.sleep(0.45)
        sse_env.payment["status"] = "verified"

    approver = asyncio.create_task(approve_after_delay())
    events = await _read_stream(sse_env.client, sse_env.payment["id"])
    await approver

    statuses = [e[1].get("status") for e in events if e[0] == "data"]
    assert "verified" in statuses, (
        f"the stream must survive DB poll exceptions and still deliver the "
        f"approval — events: {events}"
    )
    # terminal close followed the verified snapshot
    assert ("event", "close") in events
    # first snapshot was still pending (delivered AFTER the two failures)
    assert statuses[0] == "pending"
    # no session leaked: every __aenter__ got its __aexit__
    assert sse_env.factory.opened == sse_env.factory.closed, (
        f"session leak: opened={sse_env.factory.opened} "
        f"closed={sse_env.factory.closed}"
    )


# ────────────────────────────────────────────────────────────────────
# 2. lifetime cap fires without a status change → one snapshot + close
# ────────────────────────────────────────────────────────────────────

async def test_sse_lifetime_cap_closes_the_stream(sse_env, monkeypatch):
    monkeypatch.setattr(sse_env.sse, "_SSE_MAX_LIFETIME", 1)  # 1s cap

    t0 = time.monotonic()
    events = await _read_stream(sse_env.client, sse_env.payment["id"])
    elapsed = time.monotonic() - t0

    data_events = [e for e in events if e[0] == "data" and e[1]]
    # exactly one snapshot (pending — no change ever happened)…
    snapshots = [e[1] for e in data_events if "status" in e[1]]
    assert len(snapshots) == 1, f"expected a single status snapshot, got: {events}"
    assert snapshots[0]["status"] == "pending"
    # …then the cap's terminal close (its data: {} is the close marker, not a
    # snapshot) and the stream ENDED
    assert ("event", "close") in events
    assert events[-1] == ("data", {})
    assert elapsed < 5, f"cap must fire promptly — took {elapsed:.1f}s"
    assert sse_env.factory.opened == sse_env.factory.closed


# ────────────────────────────────────────────────────────────────────
# 3. client closes early → no leaked sessions, server stays healthy
# ────────────────────────────────────────────────────────────────────

async def test_sse_client_disconnects_early_no_leak(sse_env):
    ac = sse_env.client
    pid = sse_env.payment["id"]
    token = sse_env.seed.world.client.cookies.get("token")
    assert token, "the login fixture must leave a session cookie"

    # Open the stream through a RAW ASGI driver (httpx's ASGITransport
    # buffers the whole response — early close is untestable through it).
    # The disconnect below is what uvicorn delivers when the browser drops
    # the connection mid-stream: receive() → {"type": "http.disconnect"}.
    disconnect = asyncio.Event()
    driver = _RawSSEDriver(sse_env.seed.world.app, token, pid)
    app_task = asyncio.create_task(driver.run(disconnect))

    # the initial snapshot must arrive while the stream is still live
    got_first = await _wait_until(
        lambda: driver.status == 200 and "data: " in driver.text, timeout_s=3.0
    )
    assert got_first, f"no initial snapshot — status={driver.status} text={driver.text!r}"
    assert '"status": "pending"' in driver.text

    # drop the connection — Starlette's listen_for_disconnect cancels the
    # response task group, which closes the async generator mid-poll
    disconnect.set()
    await asyncio.wait_for(app_task, timeout=5)

    # the generator unwound at its next await: poll activity STOPPED and
    # every opened session got its __aexit__ (no leak)
    polls_at_disconnect = sse_env.factory.polls
    stopped = await _wait_until(
        lambda: (sse_env.factory.polls == polls_at_disconnect
                 and sse_env.factory.opened == sse_env.factory.closed),
        timeout_s=2.0,
    )
    assert stopped, (
        f"early disconnect leaked the generator: polls "
        f"{polls_at_disconnect}→{sse_env.factory.polls}, "
        f"opened={sse_env.factory.opened} closed={sse_env.factory.closed}"
    )

    # the server is NOT wedged: a fresh stream on the same payment works
    sse_env.payment["status"] = "verified"
    events = await _read_stream(ac, pid)
    statuses = [e[1].get("status") for e in events if e[0] == "data"]
    assert "verified" in statuses
    assert ("event", "close") in events
    assert sse_env.factory.opened == sse_env.factory.closed


# ────────────────────────────────────────────────────────────────────
# 4. two concurrent streams on the SAME payment both get the update
# ────────────────────────────────────────────────────────────────────

async def test_sse_two_concurrent_streams_both_receive_the_update(sse_env):
    async def approve_after_delay():
        await asyncio.sleep(0.4)
        sse_env.payment["status"] = "verified"

    approver = asyncio.create_task(approve_after_delay())
    try:
        results = await asyncio.gather(
            _read_stream(sse_env.client, sse_env.payment["id"]),
            _read_stream(sse_env.client, sse_env.payment["id"]),
        )
    finally:
        await approver

    for i, events in enumerate(results):
        statuses = [e[1].get("status") for e in events if e[0] == "data"]
        assert "verified" in statuses, f"stream {i} missed the update: {events}"
        assert ("event", "close") in events, f"stream {i} never closed: {events}"

    # both streams saw the SAME payment identity in the snapshot payload
    for events in results:
        snapshot = next(e[1] for e in events if e[0] == "data")
        assert snapshot["id"] == sse_env.payment["id"]
        assert snapshot["plan_name"] == "برو"
    assert sse_env.factory.opened == sse_env.factory.closed


# ────────────────────────────────────────────────────────────────────
# 5. payment disappears mid-stream → Arabic error event, nothing leaks
# ────────────────────────────────────────────────────────────────────

async def test_sse_missing_payment_yields_error_event_and_ends(sse_env):
    sse_env.factory.payment = None  # payment row vanishes (deleted)

    events = await _read_stream(sse_env.client, sse_env.payment["id"])

    assert ("event", "error") in events, f"expected the error event: {events}"
    err = next(e[1] for e in events if e[0] == "data")
    assert err == {"error": "الدفعة غير موجودة"}
    # nothing else was emitted on the error path — no snapshot leaked
    assert all(e[0] != "data" or e[1] == {"error": "الدفعة غير موجودة"}
               for e in events)
    assert sse_env.factory.opened == sse_env.factory.closed
