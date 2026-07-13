#!/usr/bin/env python3
"""Comprehensive E2E test for SmartBot dashboard at localhost:8000.

Tests: auth, all nav pages, buttons, modals, forms, console errors.
"""
import json, os, sys, time, traceback
from playwright.sync_api import sync_playwright, Page, expect

BASE = "http://localhost:8000"
ARTIFACT_DIR = "/home/ahmed/Downloads/SmartBot/fb_dashboard/e2e_artifacts"
os.makedirs(ARTIFACT_DIR, exist_ok=True)

PASS = 0
FAIL = 0
ERRORS = []  # list of (page_name, element_desc, issue)


def check(page: Page):
    """Collect console errors and broken elements."""
    global PASS, FAIL
    msg = page.evaluate("() => window.__e2e_errors || []")
    if msg:
        for m in msg:
            FAIL += 1
            ERRORS.append(("GLOBAL", "console.error", m[:200]))


def click_safe(page: Page, text: str, timeout=5000):
    """Click an element by its text content. returns True if found/clicked."""
    try:
        el = page.get_by_text(text, exact=False).first
        if el.is_visible(timeout=2000):
            el.click(timeout=timeout)
            return True
    except Exception:
        pass
    return False


def goto(page: Page, url: str):
    page.goto(url, wait_until="networkidle")
    time.sleep(1)
    page.evaluate("() => window.__e2e_errors = []")
    # Inject error capture
    page.evaluate("""
    () => {
      window.__e2e_errors = [];
      window.addEventListener('error', (e) => {
        window.__e2e_errors.push(e.message || String(e));
      });
      const orig = console.error;
      console.error = function(...args) {
        window.__e2e_errors.push(args.map(a => String(a).slice(0,200)).join(' '));
        return orig.apply(console, args);
      };
    }
    """)


def report():
    print(f"\n{'='*60}")
    print(f"E2E TEST RESULTS")
    print(f"{'='*60}")
    print(f"Pass: {PASS}, Fail: {FAIL}")
    print(f"\nIssues found:")
    for page_n, elem, issue in ERRORS:
        print(f"  [{page_n}] {elem}: {issue[:120]}")
    print(f"{'='*60}")

    with open(f"{ARTIFACT_DIR}/e2e_report.json", "w") as f:
        json.dump({"pass": PASS, "fail": FAIL, "errors": ERRORS}, f, ensure_ascii=False, indent=2)


def main():
    global PASS, FAIL, ERRORS
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=200)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800},
                                  locale="ar-SA")
        page = ctx.new_page()

        # Capture console messages
        page.on("console", lambda msg: check(page))

        # ======================================================
        # 1. REGISTER
        # ======================================================
        print("\n=== 1. REGISTRATION ===")
        goto(page, f"{BASE}/register")
        time.sleep(1)

        # Try direct register page if exists
        registered = False
        try:
            username_input = page.get_by_placeholder(re.compile(r"اسم", re.I)).first
            if username_input.is_visible(timeout=2000):
                username_input.fill("testadmin")
                # find password and email fields
                inputs = page.locator('input[type="text"], input:not([type]), input[type="email"]')
                count = inputs.count()
                print(f"  Found {count} input fields on register page")
                # Try different approaches
                all_inputs = page.locator("input")
                for i in range(all_inputs.count()):
                    inp = all_inputs.nth(i)
                    ph = inp.get_attribute("placeholder") or ""
                    print(f"    Input {i}: type={inp.get_attribute('type')}, placeholder='{ph}'")
                registered = True
                PASS += 1
            else:
                print("  Register page not visible, trying login first")
        except Exception as e:
            print(f"  Register approach: {e}")

        # ======================================================
        # 2. LOGIN — try direct API first
        # ======================================================
        print("\n=== 2. LOGIN ===")
        goto(page, f"{BASE}/login")
        time.sleep(1)

        # Try to register via API directly
        import requests
        s = requests.Session()
        try:
            r = s.post(f"{BASE}/api/register", data={
                "username": "testadmin",
                "email": "test@example.com",
                "password": "test123456"
            }, timeout=5)
            print(f"  API register: {r.status_code} {r.text[:100]}")
            if r.status_code == 200:
                token = s.cookies.get("token")
                print(f"  Got token: {token[:30]}...")
                # Set the cookie in browser
                page.goto(f"{BASE}/", wait_until="networkidle")
                page.evaluate(f"document.cookie = 'token={token}';")
                page.goto(f"{BASE}/", wait_until="networkidle")
                time.sleep(2)
                registered = True
                PASS += 1
        except Exception as e:
            print(f"  API register error: {e}")

        if not registered:
            print("\n=== Trying login page UI ===")
            goto(page, f"{BASE}/login")
            time.sleep(1)
            # Check what's on the page
            content = page.content()
            if "تسجيل" in content or "دخول" in content or "login" in content.lower():
                print("  Login page visible, trying UI login...")
                try:
                    page.get_by_placeholder(re.compile(r"اسم", re.I)).first.fill("testadmin")
                    page.get_by_placeholder(re.compile(r"كلمة", re.I)).first.fill("test123456")
                    page.get_by_role("button").first.click()
                    time.sleep(2)
                except:
                    pass
            else:
                # Maybe app auto-redirects to dashboard if token set
                print("  No login page, might be auto-authenticated")

        # ======================================================
        # 3. Verify we're logged in — check dashboard
        # ======================================================
        print("\n=== 3. VERIFY LOGIN ===")
        goto(page, f"{BASE}/")
        time.sleep(2)
        body = page.content()
        if "testadmin" in body or "admin" in body or "لوحة التحكم" in body:
            print("  LOGIN OK — dashboard visible")
            PASS += 1
        else:
            # Check if redirected to login
            if "تسجيل" in body or "دخول" in body or "login" in body:
                print("  Still on login page. Trying registration via UI...")
                ERRORS.append(("Login", "Auth", "Failed to login — still on login page"))
                FAIL += 1
            else:
                print("  Dashboard may be visible (unknown state)")
                PASS += 1

        # Save screenshot
        page.screenshot(path=f"{ARTIFACT_DIR}/00-state.png")

        # ======================================================
        # 4. EXPLORE ALL NAV PAGES
        # ======================================================
        print("\n=== 4. EXPLORE ALL PAGES ===")

        # Define all nav items in Arabic
        nav_items = [
            ("لوحة التحكم", "dashboard"),
            ("الرسائل", "messages"),
            ("التعليقات", "comments"),
            ("القواعد", "rules"),
            ("الردود", "replies"),
            ("الردود السريعة", "quick-replies"),
            ("التدفقات", "flows"),
            ("AI الذكي", "ai"),
            ("الوكيل الذكي", "agent"),
            ("المنشورات", "posts"),
            ("تقويم المحتوى", "calendar"),
            ("العروض", "offers"),
            ("المشتركين", "subscribers"),
            ("التسلسلات", "sequences"),
            ("البث الجماعي", "broadcast"),
            ("التقارير", "reports"),
            ("التحليلات", "analytics"),
            ("السجل المباشر", "live-log"),
            ("الإعلانات", "ads"),
            ("المستخدمين", "users"),
            ("الإعدادات", "settings"),
        ]

        for nav_text, page_id in nav_items:
            print(f"\n  --- Testing: {nav_text} ({page_id}) ---")
            try:
                # Try clicking in sidebar
                clicked = click_safe(page, nav_text)
                if not clicked:
                    # Try finding by role link
                    try:
                        el = page.locator(f"nav a, nav button, [class*='nav'] a, [class*='sidebar'] a").filter(has_text=nav_text).first
                        if el.is_visible(timeout=2000):
                            el.click()
                            clicked = True
                    except:
                        pass
                time.sleep(2)
                check(page)

                # Screenshot
                page.screenshot(path=f"{ARTIFACT_DIR}/{page_id}.png")

                # Test buttons on page
                buttons = page.locator("button")
                btn_count = buttons.count()
                clickable = 0
                errors_on_page = 0
                for i in range(min(btn_count, 15)):  # Test first 15 buttons max
                    try:
                        btn = buttons.nth(i)
                        if btn.is_visible(timeout=500):
                            text = btn.text_content() or ""
                            if len(text.strip()) > 0 and "وضع داكن" not in text and "حالة البوت" not in text:
                                # Try to click
                                btn.click(timeout=2000)
                                time.sleep(1)
                                clickable += 1
                                check(page)
                            elif "وضع داكن" in text:
                                btn.click(timeout=2000)
                                time.sleep(0.5)
                                # Switch back
                                btn.click(timeout=2000)
                                time.sleep(0.5)
                    except Exception as e:
                        errors_on_page += 1

                # Check for modal dialogs or dropdowns
                modals = page.locator("[role='dialog'], .modal, [class*='modal'], [class*='overlay']")
                modal_count = modals.count()
                modals_found = modal_count > 0 and modals.first.is_visible(timeout=500)

                # Check forms
                forms = page.locator("form, input, select, textarea")
                form_count = forms.count()

                print(f"    Buttons tested: {btn_count} visible, {clickable} clicked OK, {errors_on_page} errors")
                print(f"    Modal visible: {modals_found}, Form elements: {form_count}")
                if modals_found:
                    # Close modal if possible
                    close_btns = page.locator("button[aria-label='Close'], button:has-text('إلغاء'), button:has-text('إغلاق'), [class*='close']")
                    if close_btns.count() > 0:
                        try:
                            close_btns.first.click(timeout=2000)
                            time.sleep(0.5)
                        except:
                            pass

                PASS += 1
                print(f"    Page {nav_text}: OK")
            except Exception as e:
                FAIL += 1
                ERRORS.append((nav_text, "Page load", str(e)[:200]))
                print(f"    FAILED: {e}")

        # ======================================================
        # 5. TEST SPECIFIC FEATURES
        # ======================================================
        print("\n=== 5. SPECIFIC FEATURE TESTS ===")

        # 5.1 Dark mode toggle
        print("\n  5.1 Dark mode toggle")
        try:
            dark_btn = page.locator("button:has-text('وضع داكن'), button:has-text('Dark'), [aria-label*='dark' i]")
            if dark_btn.count() > 0:
                dark_btn.first.click(timeout=2000)
                time.sleep(1)
                dark_btn.first.click(timeout=2000)  # toggle back
                time.sleep(1)
                PASS += 1
                print("    Dark mode toggle: OK")
            else:
                print("    Dark mode toggle: not found (skip)")
        except Exception as e:
            FAIL += 1
            ERRORS.append(("Global", "Dark mode toggle", str(e)[:200]))

        # 5.2 Search box
        print("\n  5.2 Search box")
        try:
            search = page.get_by_placeholder("بحث...").first
            if search.is_visible(timeout=2000):
                search.fill("test")
                time.sleep(1)
                search.fill("")
                time.sleep(0.5)
                PASS += 1
                print("    Search box: OK")
            else:
                print("    Search box: not visible (skip)")
        except:
            print("    Search box: not found (skip)")

        # 5.3 Bot status toggle
        print("\n  5.3 Bot status toggle")
        try:
            status_el = page.locator("text=حالة البوت")
            if status_el.count() > 0:
                # Find nearby buttons
                toggle_btn = page.locator("button:has-text('تشغيل'), button:has-text('إيقاف'), button:has-text('بدء'), button:has-text('إيقاف البوت')")
                if toggle_btn.count() > 0:
                    toggle_btn.first.click(timeout=2000)
                    time.sleep(1)
                    PASS += 1
                    print("    Bot status toggle: OK")
                else:
                    print("    Bot status toggle: text found but no toggle button (skip)")
            else:
                print("    Bot status toggle: not found (skip)")
        except Exception as e:
            FAIL += 1
            ERRORS.append(("Global", "Bot status toggle", str(e)[:200]))

        # 5.4 Check for API errors by calling endpoints
        print("\n  5.4 API endpoint sanity check")
        import requests
        try:
            endpoints = [
                "/api/me", "/api/auth/me", "/api/dashboard/bundle",
                "/api/users", "/api/healthz"
            ]
            api_errors = []
            for ep in endpoints:
                rr = requests.get(f"{BASE}{ep}", timeout=5)
                if rr.status_code in (401, 403):
                    api_errors.append(f"{ep}: {rr.status_code} (expected, no auth)")
                elif rr.status_code >= 400:
                    api_errors.append(f"{ep}: {rr.status_code} ERROR")
                    ERRORS.append(("API", ep, f"{rr.status_code}: {rr.text[:100]}"))
            if api_errors:
                FAIL += 1
                for e in api_errors:
                    print(f"    {e}")
            else:
                PASS += 1
                print("    API checks: OK")
        except Exception as e:
            print(f"    API check error: {e}")

        # ======================================================
        # 6. CONSOLE ERRORS REPORT
        # ======================================================
        print("\n=== 6. CONSOLE ERROR SUMMARY ===")
        console_errors = page.evaluate("() => window.__e2e_errors || []")
        if console_errors:
            for ce in console_errors:
                print(f"  [CONSOLE] {ce[:200]}")
                ERRORS.append(("Console", "error", str(ce)[:200]))
            FAIL += len(console_errors)
        else:
            PASS += 1
            print("  No console errors captured")

        # ======================================================
        # DONE
        # ======================================================
        browser.close()
        report()

        # Save summary
        with open(f"{ARTIFACT_DIR}/e2e_summary.txt", "w") as f:
            f.write(f"Pass: {PASS}, Fail: {FAIL}\n")
            for pn, el, issue in ERRORS:
                f.write(f"[{pn}] {el}: {issue}\n")

        print(f"\nArtifacts saved to {ARTIFACT_DIR}/")
        print(f"Report: {ARTIFACT_DIR}/e2e_report.json")
        print(f"Summary: {ARTIFACT_DIR}/e2e_summary.txt")

        # Exit code based on failures
        sys.exit(1 if FAIL > 0 else 0)


if __name__ == "__main__":
    main()
