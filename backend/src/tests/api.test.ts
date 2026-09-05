import "dotenv/config";
import { describe, test, expect, beforeAll } from "bun:test";

// Ensure JWT secret is available even when not set in .env
if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = "test-secret-for-unit-tests";
}

// These are integration tests: they exercise the real Hono handlers, which read
// from and write to a live PostgreSQL database. When DATABASE_URL is not set
// there is nothing to talk to, so the suites below are skipped explicitly
// rather than reported as failures. Set DATABASE_URL (see backend/.env.example)
// to run them.
const hasDatabase = Boolean(process.env.DATABASE_URL);

if (!hasDatabase) {
  console.warn(
    "[api.test] DATABASE_URL is not set - skipping API integration tests."
  );
}

type TestServer = { fetch: (request: Request) => Response | Promise<Response> };

// index.ts exports { port, fetch }. It is imported lazily so that a missing
// DATABASE_URL does not throw while this module is being loaded.
let server: TestServer;

beforeAll(async () => {
  if (hasDatabase) {
    server = (await import("../../index")).default as TestServer;
  }
});

const BASE = "http://localhost";

function req(path: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(server.fetch(new Request(`${BASE}${path}`, init)));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
describe.skipIf(!hasDatabase)("GET /routes", () => {
  test("returns 200 with routes array", async () => {
    const res = await req("/routes");
    expect(res.status).toBe(200);
    const body = await res.json() as { routes: unknown[] };
    expect(Array.isArray(body.routes)).toBe(true);
  });

  test("returns 404 for a nonexistent route id", async () => {
    const res = await req("/routes/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
describe.skipIf(!hasDatabase)("POST /auth/register", () => {
  test("creates a new user and returns 201", async () => {
    const email = `test_${Date.now()}@test.com`;
    const res = await req("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { message: string };
    expect(body.message).toBeDefined();
  });

  test("returns 400 for invalid email", async () => {
    const res = await req("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "password123" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 409 when email is already registered", async () => {
    const email = `dup_${Date.now()}@test.com`;
    // First registration
    await req("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    });
    // Second registration with the same email
    const res = await req("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    });
    expect(res.status).toBe(409);
  });
});

describe.skipIf(!hasDatabase)("POST /auth/login", () => {
  let testEmail: string;

  beforeAll(async () => {
    testEmail = `login_${Date.now()}@test.com`;
    await req("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "password123" }),
    });
  });

  test("returns 200 with accessToken on valid credentials", async () => {
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "password123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { accessToken: string };
    expect(typeof body.accessToken).toBe("string");
    expect(body.accessToken.length).toBeGreaterThan(0);
  });

  test("returns 401 for wrong password", async () => {
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "wrong_password" }),
    });
    expect(res.status).toBe(401);
  });

  test("returns 401 for non-existent user", async () => {
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@test.com", password: "password123" }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Risk assessments — auth guard
// ---------------------------------------------------------------------------
describe.skipIf(!hasDatabase)("POST /risk-assessments", () => {
  test("returns 401 without auth token", async () => {
    const res = await req("/risk-assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routeId: "00000000-0000-0000-0000-000000000000",
        startDate: "2025-08-01",
        startTime: "09:00",
      }),
    });
    expect(res.status).toBe(401);
  });
});
