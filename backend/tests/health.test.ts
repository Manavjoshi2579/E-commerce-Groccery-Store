import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app/app.js";
import { db } from "../lib/db.js";

const app = createApp();

afterAll(async () => {
  await db.$disconnect();
});

describe("database health", () => {
  it("reports app and database health", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body.app).toBe("ok");
    expect(response.body.database).toBe("connected");
    expect(response.body.timestamp).toBeTruthy();
  });

  it("reports database counts", async () => {
    const response = await request(app).get("/api/health/db").expect(200);
    expect(response.body.database).toBe("connected");
    expect(response.body.counts.users).toBeGreaterThanOrEqual(1);
    expect(response.body.counts.admins).toBeGreaterThanOrEqual(1);
    expect(response.body.counts.categories).toBeGreaterThanOrEqual(1);
    expect(response.body.counts.products).toBeGreaterThanOrEqual(1);
    expect(response.body.counts.orders).toBeGreaterThanOrEqual(0);
    expect(response.body.counts.payments).toBeGreaterThanOrEqual(0);
  });
});
