# Next Session Plan — SmartBot SaaS

## Session Date: 2026-07-12
## Branch: design-redesign
## Remote: origin/design-redesign
## URL: https://bot.smart-link.ly

## What's Complete
- Sprint 1: tenant_id on all 32 tables, unique constraints, encryption (_crypto.py)
- Sprint 2: Landing page (landing.jsx), register API, pricing endpoint
- Sprint 3: JWT tenant_id, 36 tenant filters, FB settings UI, registration hardening
- Sprint 4: Complete endpoint isolation, per-tenant BotEngine (cron), tenant deletion
- Sprint 5: publisher/team/WS/broadcast tenant isolation, _track_event tenant_id
- Onboarding wizard (onboarding.jsx), background loop iterates active tenants

## Next Session Priority

### 1. Deploy to Production
- vercel.json is correct (/(.*) → api/index.py)
- Latest build committed
- Vercel must deploy the latest design-redesign commit
- Run `vercel deploy --prod` or trigger via GitHub integration

### 2. Stripe/Payments Integration
- Complete pricing page → actual billing
- Stripe webhooks → plan activation/deactivation
- Plan enforcement middleware

### 3. Email Verification Flow
- SendGrid or similar for transaction emails
- Email verification on signup
- Password reset flow

### 4. Cross-browser Testing
- Test on Chrome, Firefox, Safari
- Mobile responsive check
- Dark mode verification

### 5. Performance Tuning
- Composite indexes: (tenant_id, created_at) on high-volume tables
- BotState caching
- Analytics rollup table for dashboard speed

## Key Files
| File | Purpose |
|------|---------|
| fb_dashboard/runner.py | Main API server (~3400 lines) |
| fb_dashboard/models.py | DB models with tenant_id |
| fb_dashboard/bot.py | Bot engine with per-tenant support |
| fb_dashboard/frontend/src/App.jsx | SPA routing |
| fb_dashboard/frontend/src/pages/settings.jsx | FB settings UI |
| fb_dashboard/frontend/src/pages/onboarding.jsx | New user wizard |
| fb_dashboard/frontend/src/pages/landing.jsx | Marketing page |
| fb_dashboard/frontend/src/pages/login.jsx | Auth with register toggle |
| fb_dashboard/_crypto.py | Fernet encryption |
| fb_dashboard/_utils.py | utcnow() helper |
| vercel.json | Deployment config |

## Database
- Neon: postgresql://neondb_owner:...@ep-dark-unit-atj8qob4-pooler.c-9.us-east-1.aws.neon.tech/neondb
- 29 tables, 87 replies, 17 rules
- Migration files in fb_dashboard/migrations/
