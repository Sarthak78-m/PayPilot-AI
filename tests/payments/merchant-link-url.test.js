import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getAppBaseUrl, isPermittedHost } from "@/lib/payments/payment-link-service";

describe("Payment Link Base URL Resolution (Origin Security Tests)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    delete process.env.ALLOWED_HOSTS;
    delete process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = "test";
  });

  it("prioritizes NEXT_PUBLIC_SITE_URL when set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://paypilot.ai/";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.paypilot.ai/";
    process.env.VERCEL_URL = "preview.vercel.app";

    const url = getAppBaseUrl();
    assert.equal(url, "https://paypilot.ai");
  });

  it("falls back to NEXT_PUBLIC_APP_URL when SITE_URL is not set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://billing.example.com/";
    process.env.VERCEL_URL = "preview.vercel.app";

    const url = getAppBaseUrl();
    assert.equal(url, "https://billing.example.com");
  });

  it("falls back to VERCEL_URL with https:// when public env vars are absent", () => {
    process.env.VERCEL_URL = "paypilot-git-branch.vercel.app";

    const url = getAppBaseUrl();
    assert.equal(url, "https://paypilot-git-branch.vercel.app");
  });

  it("extracts permitted forwarded host header from request when no env url is present", () => {
    const mockRequest = {
      headers: new Headers({
        "x-forwarded-host": "staging.paypilot.com",
        "x-forwarded-proto": "https",
      }),
    };

    const url = getAppBaseUrl(mockRequest);
    assert.equal(url, "https://staging.paypilot.com");
  });

  it("permits Vercel preview deployment hostnames from x-forwarded-host", () => {
    const mockRequest = {
      headers: new Headers({
        "x-forwarded-host": "paypilot-pr-42-preview.vercel.app",
        "x-forwarded-proto": "https",
      }),
    };

    const url = getAppBaseUrl(mockRequest);
    assert.equal(url, "https://paypilot-pr-42-preview.vercel.app");
  });

  it("rejects spoofed external hostnames (e.g. evil.com) and falls back safely", () => {
    const mockRequest = {
      headers: new Headers({
        "x-forwarded-host": "evil.com",
        "x-forwarded-proto": "https",
      }),
    };

    // In dev/test, falls back to localhost instead of evil.com
    const url = getAppBaseUrl(mockRequest);
    assert.equal(url, "http://localhost:3000");
    assert.equal(isPermittedHost("evil.com"), false);
  });

  it("rejects malformed forwarded-host with credentials, path, or control characters", () => {
    const malformedHosts = [
      "attacker.com@paypilot.ai",
      "evil.com/path",
      "evil.com\\path",
      "evil.com:bad-port",
      "evil.com<script>",
      "evil.com paypilot.ai",
    ];

    malformedHosts.forEach((host) => {
      assert.equal(isPermittedHost(host), false, `Host should be rejected: ${host}`);
    });
  });

  it("rejects invalid non-HTTP protocols (e.g. javascript:, ftp:)", () => {
    const mockRequest = {
      headers: new Headers({
        "x-forwarded-host": "paypilot.ai",
        "x-forwarded-proto": "ftp",
      }),
    };

    // Protocol 'ftp' is rejected, falls back to dev default
    const url = getAppBaseUrl(mockRequest);
    assert.equal(url, "http://localhost:3000");
  });

  it("prevents accidentally generating localhost payment links in production", () => {
    process.env.NODE_ENV = "production";

    assert.throws(
      () => {
        getAppBaseUrl();
      },
      /Localhost payment links cannot be generated in production/
    );

    const mockRequestLocal = {
      headers: new Headers({
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-proto": "http",
      }),
    };

    assert.throws(
      () => {
        getAppBaseUrl(mockRequestLocal);
      },
      /Localhost payment links cannot be generated in production/
    );
  });

  it("preserves correct localhost behavior during local development", () => {
    process.env.NODE_ENV = "development";
    const url = getAppBaseUrl();
    assert.equal(url, "http://localhost:3000");
  });

  it("supports explicitly configured ALLOWED_HOSTS for custom enterprise domains", () => {
    process.env.ALLOWED_HOSTS = "custom-domain.com, api.partner.org";

    assert.equal(isPermittedHost("custom-domain.com"), true);
    assert.equal(isPermittedHost("api.partner.org"), true);
    assert.equal(isPermittedHost("unauthorized.com"), false);

    const mockRequest = {
      headers: new Headers({
        "x-forwarded-host": "custom-domain.com",
        "x-forwarded-proto": "https",
      }),
    };

    const url = getAppBaseUrl(mockRequest);
    assert.equal(url, "https://custom-domain.com");
  });
});
