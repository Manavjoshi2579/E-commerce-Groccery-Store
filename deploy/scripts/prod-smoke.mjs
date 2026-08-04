#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const apiBase = process.env.SMOKE_API_BASE || "https://api.eaglesclub.in";
const webBase = process.env.SMOKE_WEB_BASE || "https://eaglesclub.in";
const origin = new URL(webBase).origin;

const cookieJar = new Map();

function rememberCookies(response) {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  for (const cookie of setCookies) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    if (index > 0) cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader() {
  return Array.from(cookieJar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(label, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Origin")) headers.set("Origin", origin);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  const cookies = cookieHeader();
  if (cookies) headers.set("Cookie", cookies);

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
    redirect: "manual",
  });
  rememberCookies(response);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { label, response, body };
}

function assertOk(result, predicate, detail = "unexpected response") {
  if (!predicate(result)) {
    console.error(`FAIL ${result.label}: ${result.response.status} ${result.response.statusText}`);
    console.error(typeof result.body === "string" ? result.body.slice(0, 500) : JSON.stringify(result.body, null, 2));
    throw new Error(detail);
  }
  console.log(`OK   ${result.label}: ${result.response.status}`);
}

async function checkFrontend() {
  const response = await fetch(webBase, { redirect: "manual" });
  if (!response.ok) throw new Error(`Frontend failed: ${response.status} ${response.statusText}`);
  console.log(`OK   frontend: ${response.status}`);
}

async function checkLogin(label, emailEnv, passwordEnv, scope) {
  const email = process.env[emailEnv];
  const password = process.env[passwordEnv];
  if (!email || !password) {
    console.log(`SKIP ${label}: set ${emailEnv} and ${passwordEnv} to test login`);
    return;
  }
  cookieJar.clear();
  const loginHeaders = scope ? { "X-Admin-Session-Scope": scope } : {};
  const login = await request(label, "/api/admin/auth/login", {
    method: "POST",
    headers: loginHeaders,
    body: JSON.stringify({ email, password }),
  });
  assertOk(login, (result) => result.response.status === 200 && result.body?.ok === true, `${label} login failed`);

  const me = await request(`${label} session`, "/api/admin/auth/me", {
    headers: loginHeaders,
  });
  assertOk(me, (result) => result.response.status === 200 && result.body?.ok === true, `${label} session failed`);
}

async function main() {
  await checkFrontend();

  const health = await request("api health", "/api/health");
  assertOk(health, (result) => result.response.status === 200 && result.body?.database === "connected", "API/database health failed");

  const catalog = await request("catalog home", "/api/catalog/home");
  assertOk(catalog, (result) => result.response.status === 200 && result.body?.ok === true && Array.isArray(result.body.data?.sections), "Catalog failed");

  const authConfig = await request("auth config", "/api/auth/config");
  assertOk(authConfig, (result) => result.response.status === 200 && result.body?.ok === true, "Customer auth config failed");

  if (writeMode) {
    const stamp = Date.now().toString().slice(-8);
    const signup = await request("customer signup OTP write", "/api/auth/signup/request-otp", {
      method: "POST",
      body: JSON.stringify({
        name: "Smoke Test",
        email: `smoke+${stamp}@eaglesclub.in`,
        phone: `98${stamp}`,
        password: "Smoke@Test12345",
        confirmPassword: "Smoke@Test12345",
        terms: true,
        channel: "email",
      }),
    });
    assertOk(signup, (result) => result.response.status === 201 && result.body?.ok === true, "Customer signup write failed");
  } else {
    console.log("SKIP customer signup OTP write: pass --write to test DB writes");
  }

  await checkLogin("admin login", "SMOKE_ADMIN_EMAIL", "SMOKE_ADMIN_PASSWORD");
  await checkLogin("delivery login", "SMOKE_DELIVERY_EMAIL", "SMOKE_DELIVERY_PASSWORD", "delivery");

  console.log("Production smoke test completed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
