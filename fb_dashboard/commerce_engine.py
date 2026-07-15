from __future__ import annotations
"""Commerce Engine — E-commerce integration for Shopify.
Connects store data to SmartBot flows for abandoned cart recovery,
order confirmations, product recommendations.
"""
import json
import logging
import hmac
import hashlib
from datetime import datetime
from _utils import utcnow
from typing import Any
from fastapi import Request, HTTPException

log = logging.getLogger("fb-commerce")

class ShopifyIntegration:
    """Shopify webhook integration for e-commerce flows."""

    def __init__(self, store_domain: str = "", access_token: str = "", webhook_secret: str = ""):
        self.store_domain = store_domain
        self.access_token = access_token
        self.webhook_secret = webhook_secret
        self._base_url = f"https://{store_domain}" if store_domain else ""

    def is_configured(self) -> bool:
        return bool(self.store_domain and self.access_token)

    def get_config_status(self) -> dict:
        return {
            "configured": self.is_configured(),
            "store": self.store_domain,
            "missing": ["ربط متجر Shopify من الإعدادات"] if not self.is_configured() else [],
        }

    async def verify_webhook(self, request: Request) -> bool:
        """Verify Shopify webhook HMAC signature."""
        body = await request.body()
        signature = request.headers.get("x-shopify-hmac-sha256", "")
        if not self.webhook_secret or not signature:
            return False
        digest = hmac.new(
            self.webhook_secret.encode(), body, hashlib.sha256
        ).digest()
        import base64
        expected = base64.b64encode(digest).decode()
        return hmac.compare_digest(signature, expected)

    async def handle_webhook(self, topic: str, payload: dict) -> dict:
        """Process Shopify webhook and return flow context."""
        ctx = {"platform": "shopify", "event": topic, "timestamp": utcnow().isoformat()}

        if topic == "orders/create":
            customer = payload.get("customer", {})
            ctx.update({
                "trigger_type": "shopify_order_created",
                "from_name": customer.get("firstName", "") + " " + customer.get("lastName", ""),
                "from_id": str(customer.get("id", "")),
                "email": customer.get("email", ""),
                "order_id": str(payload.get("id", "")),
                "order_number": payload.get("orderNumber", ""),
                "total_price": payload.get("totalPrice", ""),
                "line_items": [item.get("title", "") for item in payload.get("lineItems", [])],
                "text": f"طلب جديد #{payload.get('orderNumber', '')} بقيمة {payload.get('totalPrice', '')}",
            })

        elif topic == "carts/update":
            ctx.update({
                "trigger_type": "shopify_abandoned_cart",
                "from_id": str(payload.get("email", "")),
                "cart_id": str(payload.get("id", "")),
                "item_count": len(payload.get("lineItems", [])),
                "total_price": payload.get("totalPrice", ""),
                "text": f"سلة مهملة بقيمة {payload.get('totalPrice', '')} ({len(payload.get('lineItems', []))} منتج)",
            })

        elif topic == "orders/updated":
            fulfillment = payload.get("fulfillments", [])
            status = "تم الشحن" if fulfillment else "تم التحديث"
            ctx.update({
                "trigger_type": "shopify_order_updated",
                "order_id": str(payload.get("id", "")),
                "fulfillment_status": status,
                "text": f"الطلب #{payload.get('orderNumber', '')}: {status}",
            })

        return ctx

    async def get_products(self, limit: int = 10) -> list[dict]:
        """Fetch products from Shopify store (for flow builder product picker)."""
        if not self.is_configured():
            return []
        try:
            import httpx
            headers = {
                "X-Shopify-Access-Token": self.access_token,
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self._base_url}/admin/api/2024-01/products.json",
                    headers=headers,
                    params={"limit": limit, "fields": "id,title,images,variants"}
                )
                if r.status_code == 200:
                    products = r.json().get("products", [])
                    return [{
                        "id": p["id"],
                        "title": p["title"],
                        "image": p["images"][0]["src"] if p.get("images") else "",
                        "price": p["variants"][0]["price"] if p.get("variants") else "",
                    } for p in products]
        except Exception as e:
            log.error(f"Shopify products fetch error: {e}")
        return []

    async def get_orders(self, limit: int = 10, status: str = "any") -> list[dict]:
        """Fetch recent orders."""
        if not self.is_configured():
            return []
        try:
            import httpx
            headers = {"X-Shopify-Access-Token": self.access_token}
            params = {"limit": limit, "status": status} if status != "any" else {"limit": limit}
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self._base_url}/admin/api/2024-01/orders.json",
                    headers=headers, params=params
                )
                if r.status_code == 200:
                    return r.json().get("orders", [])
        except Exception as e:
            log.error(f"Shopify orders fetch error: {e}")
        return []

class CommerceEngine:
    """Main commerce engine routing to integrations."""

    def __init__(self):
        self.shopify = ShopifyIntegration()

    def get_status(self) -> dict:
        return {
            "shopify": self.shopify.get_config_status(),
        }
