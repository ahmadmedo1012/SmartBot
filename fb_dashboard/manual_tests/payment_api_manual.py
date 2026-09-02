from __future__ import annotations
"""Integration test: payment API endpoints via TestClient."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
os.environ["DEBUG"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["CRON_SECRET"] = "test-cron-secret"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///test_payment.db"
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["TELEGRAM_ADMIN_IDS"] = ""
import asyncio
from httpx import AsyncClient, ASGITransport

errors = []

def check(desc, ok):
    if not ok:
        errors.append(f"FAIL: {desc}")
        print(f"  ✗ {desc}")
    else:
        print(f"  ✓ {desc}")

async def main():
    from runner import app
    from database import engine, AsyncSessionLocal
    from models import Base, PaymentRequest, BotState, User, Tenant
    from sqlalchemy import select

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed: create tenant + user
    async with AsyncSessionLocal() as db:
        db.add(Tenant(id=1, name="test", plan="free", is_active=True))
        db.add(User(id=1, tenant_id=1, username="testuser",
                    password_hash="x", role="admin"))
        db.add(BotState(tenant_id=1, key="balance", value="100"))
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Set auth cookie (JWT for testuser)
        import jwt
        from config import settings
        token = jwt.encode({"sub": "testuser", "tid": 1}, settings.SECRET_KEY, algorithm="HS256")
        cookies = {"token": token}

        # --- POST /api/payments/topup ---
        print("=== Payment Topup ===")
        r = await ac.post("/api/payments/topup", json={"amount": 50, "provider": "liyana", "phone": "0912345678"}, cookies=cookies)
        check("topup returns 200", r.status_code == 200)
        data = r.json()
        check("topup returns payment_id", "payment_id" in data)
        check("topup returns instructions", "instructions" in data)
        pid1 = data["payment_id"]

        # Verify DB has it
        async with AsyncSessionLocal() as db:
            pr = await db.get(PaymentRequest, pid1)
        check("payment saved in DB", pr is not None)
        check("payment amount = 50", pr and pr.amount == 50)
        check("payment provider = liyana", pr and pr.provider == "liyana")
        check("payment status = pending", pr and pr.status == "pending")

        # --- Topup with invalid amount ---
        r2 = await ac.post("/api/payments/topup", json={"amount": 0, "provider": "liyana", "phone": "0912345678"}, cookies=cookies)
        check("topup invalid amount rejected", r2.status_code == 400)

        # --- Topup with invalid provider ---
        r3 = await ac.post("/api/payments/topup", json={"amount": 50, "provider": "stripe", "phone": "0912345678"}, cookies=cookies)
        check("topup invalid provider rejected", r3.status_code == 400)

        # --- POST /api/payments/confirm ---
        print("\n=== Payment Confirm ===")
        r4 = await ac.post("/api/payments/confirm", json={"payment_id": pid1, "reference": "REF123"}, cookies=cookies)
        check("confirm returns 200", r4.status_code == 200)
        data4 = r4.json()
        check("confirm returns ok", data4.get("ok"))

        # Verify DB updated
        async with AsyncSessionLocal() as db:
            pr2 = await db.get(PaymentRequest, pid1)
        check("payment reference saved", pr2 and pr2.reference == "REF123")

        # --- GET /api/payments/balance ---
        print("\n=== Payment Balance ===")
        r5 = await ac.get("/api/payments/balance", cookies=cookies)
        check("balance returns 200", r5.status_code == 200)
        data5 = r5.json()
        check("balance has balance key", "balance" in data5)
        check("balance is int", isinstance(data5["balance"], int))

        # --- GET /api/payments/history ---
        print("\n=== Payment History ===")
        r6 = await ac.get("/api/payments/history", cookies=cookies)
        check("history returns 200", r6.status_code == 200)
        data6 = r6.json()
        check("history is list", isinstance(data6, list))
        check("history has 1 item", len(data6) == 1)
        if data6:
            check("history item has payment_id", "payment_id" in data6[0])
            check("history item has amount", "amount" in data6[0])
            check("history item has status", "status" in data6[0])

        # --- GET /api/cron/bot-cycle with token ---
        print("\n=== Cron bot-cycle ===")
        r7 = await ac.get("/api/cron/bot-cycle?token=test-cron-secret")
        check("cron returns 200", r7.status_code == 200)
        data7 = r7.json()
        check("cron returns ok", data7.get("ok") is not False)  # may be True or have tenants

        # Wrong token
        r8 = await ac.get("/api/cron/bot-cycle?token=wrong")
        check("cron wrong token 403", r8.status_code == 403)

        # Wrong header
        r9 = await ac.get("/api/cron/bot-cycle", headers={"authorization": "Bearer wrong"})
        check("cron wrong header 403", r9.status_code == 403)

    # Cleanup: remove test DB
    await engine.dispose()
    try:
        os.remove("test_payment.db")
    except FileNotFoundError:
        pass

    print()
    if errors:
        print(f"❌ {len(errors)} API test(s) FAILED:")
        for e in errors:
            print(f"   {e}")
        sys.exit(1)
    else:
        print(f"✅ All API integration tests passed")

if __name__ == "__main__":
    asyncio.run(main())
