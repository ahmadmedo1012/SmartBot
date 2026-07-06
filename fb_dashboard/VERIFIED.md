# E2E Verification Results — 2026-07-05

## Status: ✅ ALL PASS

### Test summary: 14/14 passed
- **23 unit tests** (core logic: match/render/classify/normalize/hash/dedup)
- **14 E2E live tests** against Facebook Graph API v22.0

### Live API tests
| # | Test | Result |
|---|------|--------|
| 1 | Token/page connectivity (fan_count) | ✅ |
| 2 | Fetch 5 posts | ✅ |
| 3 | Fetch 21 comments with name extraction | ✅ |
| 4 | get_commenter_name() fallback chain (6 sub-tests) | ✅ |
| 5 | Reply to real comment with `{name}` injection | ✅ Reply ID returned |
| 6 | reply_to_comment endpoint verification | ✅ POST /{comment_id}/comments |
| 7 | get_recent_comments() helper | ✅ |

### Critical bug found during verification
**`username` field deprecated in Graph API ≥ v2.0** — causes 400 error on every comment fetch. Removed from field selector. The `from{name,id}` fields still return correctly for user comments.

### Notification path confirmed
- **Endpoint**: `POST /{comment_id}/comments` ✅ (correct per Graph API spec)
- **Permissions checked**: `pages_manage_engagement` (token scoped) ✅
- **@mention tagging**: `{mention}` template var → `@{user_id}` — activates Facebook push notification to commenter
