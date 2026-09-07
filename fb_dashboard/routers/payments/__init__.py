"""Payment & subscription routes package (v13-L4: decomposed from the former
594-line routers/payments.py monolith — bodies moved VERBATIM into domain
modules; this __init__ only aggregates so `payments.router` keeps working)."""
from fastapi import APIRouter

from routers.payments.approvals import router as _approvals_router
from routers.payments.bank import router as _bank_router
from routers.payments.plans import router as _plans_router
from routers.payments.sse import router as _sse_router
from routers.payments.wallet import router as _wallet_router

router = APIRouter()  # NO tags: sub-routers carry tags=["payments"]; a tagged
                      # parent would double every tag (fastapi add_api_route
                      # appends self.tags to included routes).
router.include_router(_bank_router)       # POST /api/upload
router.include_router(_wallet_router)     # /api/payments/{topup,confirm,balance,history}
router.include_router(_plans_router)      # /api/subscriptions{,/status,/upgrade}
router.include_router(_sse_router)        # /api/subscriptions/status-stream
router.include_router(_approvals_router)  # /api/admin/subscriptions
