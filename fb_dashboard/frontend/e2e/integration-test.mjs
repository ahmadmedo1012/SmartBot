#!/usr/bin/env node
/**
 * Full-stack integration test for SmartBot.
 * Tests: auth flow, API endpoints, static assets, proxy, sitemap.
 *
 * Usage: node integration-test.mjs [--verbose]
 */
const VERBOSE = process.argv.includes("--verbose");
const FRONTEND = "https://bot.smart-link.ly";
const API = "https://api.bot.smart-link.ly";

let passed = 0,
  failed = 0;
const errors = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; errors.push({ label, detail }); console.log(`  ✗ ${label}`); }
  if (detail && VERBOSE) console.log(`       ${detail}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tryLogin(baseUrl, username, password) {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }),
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const body = await res.json().catch(() => ({}));
  const tokenMatch = setCookie.match(/token=([^;]+)/);
  return { ok: res.status === 200, token: tokenMatch ? tokenMatch[1] : null, body, status: res.status };
}

async function main() {
  console.log("\n=== Full-Stack Integration Test ===\n");

  // ── Step 1: Login ─────────────────────────────────────────────────────
  console.log("1. POST /api/login → auth cookie");
  let token = null;
  for (const creds of [
    ["admin", "admin"],
    ["testadmin", "test123456"],
    ["admin", "smartbot2024"],
  ]) {
    const r = await tryLogin(FRONTEND, creds[0], creds[1]);
    if (r.ok && r.token) { token = r.token; check(`Login as ${creds[0]}`, true); break; }
  }
  if (!token) {
    check("Login with any known credential", false, "No known credentials worked against live deployment");

    // For the remaining authenticated tests, try registering fresh
    console.log("\n   Registering new user for auth tests...");
    const regUser = `test_${Date.now()}`;
    const regRes = await fetch(`${FRONTEND}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: regUser, email: `${regUser}@test.com`, password: "testpass123" }),
    });
    const regBody = await regRes.json();
    const regCookie = regRes.headers.get("set-cookie") || "";
    const regToken = regCookie.match(/token=([^;]+)/);
    if (regToken) {
      token = regToken[1];
      check(`Registered new user ${regUser}`, true);
    } else {
      check("Register new user", false, JSON.stringify(regBody));
    }
  }

  // ── Step 2: GET /api/me ─────────────────────────────────────────────────
  console.log("\n2. GET /api/me → user data");
  if (token) {
    const res = await fetch(`${FRONTEND}/api/me`, { headers: { Cookie: `token=${token}` } });
    const body = await res.json().catch(() => ({}));
    check("Status 200", res.status === 200, `got ${res.status}`);
    check("authenticated flag", body.authenticated === true, JSON.stringify(body));
    check("has role", !!body.role);
    check("has username", !!body.username);
  } else {
    check("GET /api/me", false, "No auth token available");
  }

  // ── Step 3: GET /api/admin/subscriptions ────────────────────────────────
  console.log("\n3. GET /api/admin/subscriptions → paginated list");
  if (token) {
    const res = await fetch(`${FRONTEND}/api/admin/subscriptions?status=all`, {
      headers: { Cookie: `token=${token}` },
    });

    if (res.status === 200) {
      const body = await res.json();
      check("Status 200", true);
      check("Returns array", Array.isArray(body));
    } else if (res.status === 403) {
      const body = await res.json();
      check("Admin required (expected for non-admin)", true, body.detail || "insufficient permissions");
    } else {
      check("Admin subscriptions", false, `Status ${res.status}`);
    }
  } else {
    check("GET /api/admin/subscriptions", false, "No auth token");
  }

  // ── Step 4: POST /api/subscriptions/validate ────────────────────────────
  console.log("\n4. POST /api/subscriptions/validate → valid (unique username)");
  {
    const uniqueUser = `test_validate_${Date.now()}`;
    const res = await fetch(`${FRONTEND}/api/subscriptions/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: uniqueUser }),
    });
    const body = await res.json();
    check("Status 200", res.status === 200, `got ${res.status}`);
    check("valid=true", body.valid === true, JSON.stringify(body));
  }

  // ── Step 4b: Duplicate username returns valid=false ────────────────────
  {
    const res = await fetch(`${FRONTEND}/api/subscriptions/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin" }),
    });
    const body = await res.json();
    check("Duplicate returns valid=false", body.valid === false);
  }

  // ── Step 5: POST /api/payments/topup ────────────────────────────────────
  console.log("\n5. POST /api/payments/topup → payment created");
  if (token) {
    const res = await fetch(`${FRONTEND}/api/payments/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${token}` },
      body: JSON.stringify({ amount: 50, provider: "liyana", phone: "+218912345678" }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 200) {
      check("Status 200", true);
      check("Has payment_id", !!body.payment_id, JSON.stringify(body));
      check("Has instructions", !!body.instructions);
    } else {
      check("Topup", false, `Status ${res.status}: ${JSON.stringify(body)}`);
    }
  } else {
    check("POST /api/payments/topup", false, "No auth token");
  }

  // ── Step 6: GET /api/payments/balance ───────────────────────────────────
  console.log("\n6. GET /api/payments/balance → balance returned");
  if (token) {
    const res = await fetch(`${FRONTEND}/api/payments/balance`, {
      headers: { Cookie: `token=${token}` },
    });
    const body = await res.json().catch(() => ({}));
    check("Status 200", res.status === 200, `got ${res.status}`);
    check("Has balance field", "balance" in body, JSON.stringify(body));
    check("Balance is number", typeof body.balance === "number");
    check("Has LYD currency", body.currency === "LYD");
  } else {
    check("GET /api/payments/balance", false, "No auth token");
  }

  // ── Step 7: API proxy at bot.smart-link.ly/api/plans ────────────────────
  console.log("\n7. GET /api/plans via frontend proxy → plans list");
  {
    const viaProxy = await fetch(`${FRONTEND}/api/plans`);
    const viaDirect = await fetch(`${API}/api/plans`);
    const proxyBody = await viaProxy.json();
    const directBody = await viaDirect.json();

    check("Proxy returns 200", viaProxy.status === 200, `got ${viaProxy.status}`);
    check("Proxy returns array", Array.isArray(proxyBody), `length=${proxyBody.length}`);
    check("Direct API also 200", viaDirect.status === 200);
    check("Proxy matches direct response", JSON.stringify(proxyBody) === JSON.stringify(directBody));
    if (proxyBody.length > 0) {
      check("First plan has name", !!proxyBody[0].name);
      check("First plan has price", "price" in proxyBody[0]);
    }
  }

  // ── Step 8: Static brand-icon.png via frontend ─────────────────────────
  console.log("\n8. GET /static/brand-icon.png → loads");
  {
    const res = await fetch(`${FRONTEND}/static/brand-icon.png`);
    const ct = res.headers.get("content-type") || "";
    check("Status 200", res.status === 200, `got ${res.status}`);
    check("Content-Type is image", ct.startsWith("image/"), ct);

    const size = (await res.clone().arrayBuffer()).byteLength;
    check("Non-empty (>1KB)", size > 1024, `${size} bytes`);
  }

  // ── Step 9: fonts.css ──────────────────────────────────────────────────
  console.log("\n9. GET /fonts/fonts.css → served correctly");
  {
    const res = await fetch(`${FRONTEND}/fonts/fonts.css`);
    const text = await res.text();
    check("Status 200", res.status === 200, `got ${res.status}`);
    check("Content-Type is CSS", (res.headers.get("content-type") || "").includes("css"));
    check("Contains @font-face", text.includes("@font-face"), `length=${text.length}`);
    check("Contains woff2 references", text.includes(".woff2"));
  }

  // ── Step 10: /sitemap.xml ──────────────────────────────────────────────
  console.log("\n10. GET /sitemap.xml → valid XML");
  {
    const res = await fetch(`${FRONTEND}/sitemap.xml`);
    const text = await res.text();
    check("Status 200", res.status === 200, `got ${res.status}`);
    check("Content-Type is XML", (res.headers.get("content-type") || "").includes("xml"));

    const validXml = text.trim().startsWith("<?xml") && text.includes("<urlset") && text.includes("</urlset>");
    check("Valid XML structure", validXml);

    const urlCount = (text.match(/<url>/g) || []).length;
    check("Has URLs", urlCount > 0, `${urlCount} URLs`);
    check("Includes landing page", text.includes("bot.smart-link.ly"));

    // Check lastModified dates are valid ISO
    const dateMatch = text.match(/<lastmod>([^<]+)<\/lastmod>/);
    if (dateMatch) {
      const d = new Date(dateMatch[1]);
      check("lastModified is valid date", !isNaN(d.getTime()));
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (errors.length) {
    console.log(`\nFailures:`);
    for (const e of errors) {
      console.log(`  • ${e.label}${e.detail ? `: ${e.detail}` : ""}`);
    }
  }
  console.log(`\nExit code: ${failed > 0 ? 1 : 0}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Test harness error:", err);
  process.exit(1);
});
