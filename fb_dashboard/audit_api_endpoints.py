from __future__ import annotations
"""
Automated API endpoint audit: compare frontend API calls vs backend routes.
"""
import sys
import os
import re

os.chdir('/home/ahmed/Downloads/SmartBot')

# ── Step 1: Extract frontend API calls ────────────────────────────────────────
print("=" * 60)
print("Step 1: Extracting frontend API calls...")
print("=" * 60)

frontend_dir = "fb_dashboard/frontend/src/app/dashboard"

frontend_calls = []
for root, dirs, files in os.walk(frontend_dir):
    for file in files:
        if file.endswith('.ts') or file.endswith('.tsx'):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Match apiFetch("/api/...")
                    matches = re.findall(r'apiFetch\(["\'](/api/[^"\']+)["\']', content)
                    frontend_calls.extend(matches)
            except Exception as e:
                pass

frontend_calls = sorted(set(frontend_calls))
print(f"\nFound {len(frontend_calls)} unique frontend API calls:")
for call in frontend_calls:
    print(f"  {call}")

# ── Step 2: Extract backend routes ────────────────────────────────────────────
print("\n" + "=" * 60)
print("Step 2: Extracting backend routes...")
print("=" * 60)

routers_dir = "fb_dashboard/routers"

backend_routes = []
for root, dirs, files in os.walk(routers_dir):
    for file in files:
        if file.endswith('.py'):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Match @router.get("/api/...") or @router.post("/api/...")
                    matches = re.findall(r'@router\.(get|post|put|delete|patch)\(["\'](/api/[^"\']+)["\']', content)
                    for method, route in matches:
                        backend_routes.append((method.upper(), route))
            except Exception as e:
                pass

backend_routes = sorted(set(backend_routes))
print(f"\nFound {len(backend_routes)} unique backend routes:")
for method, route in backend_routes:
    print(f"  [{method}] {route}")

# ── Step 3: Compare and find mismatches ──────────────────────────────────────
print("\n" + "=" * 60)
print("Step 3: Comparing frontend calls vs backend routes...")
print("=" * 60)

# Normalize routes (remove trailing / and query params)
frontend_paths = set()
for call in frontend_calls:
    path = call.split('?')[0].rstrip('/')
    if path:
        frontend_paths.add(path)

backend_paths = set()
for method, route in backend_routes:
    path = route.split('?')[0].rstrip('/')
    if path:
        backend_paths.add(path)

missing_from_backend = frontend_paths - backend_paths
extra_in_backend = backend_paths - frontend_paths

print("\n--- Frontend calls NOT found in backend (CRITICAL) ---")
if missing_from_backend:
    for path in sorted(missing_from_backend):
        print(f"  ❌ {path}")
else:
    print("  ✅ All frontend API calls exist in backend")

print("\n--- Backend routes NOT used by frontend (INFO) ---")
if extra_in_backend:
    for path in sorted(extra_in_backend):
        print(f"  ℹ️  {path}")
else:
    print("  ℹ️  No extra routes")

# ── Final verdict ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
if missing_from_backend:
    print("❌ AUDIT FAILED: Found frontend API calls missing from backend!")
    print("   These must be fixed immediately.")
    sys.exit(1)
else:
    print("✅ AUDIT PASSED: All frontend API calls exist in backend!")
    sys.exit(0)
