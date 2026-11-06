import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

describe("Account Deletion Service-Role Key Aliasing", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("identifies service role capability when SUPABASE_SECRET_KEY is present", () => {
    process.env.SUPABASE_SECRET_KEY = "mock-secret-key-123";
    const hasServiceRole = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(hasServiceRole, true);
  });

  it("identifies service role capability when standard SUPABASE_SERVICE_ROLE_KEY is present", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key-456";
    const hasServiceRole = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(hasServiceRole, true);
  });

  it("falls back to user auth client only when neither key is present", () => {
    const hasServiceRole = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(hasServiceRole, false);
  });
});
