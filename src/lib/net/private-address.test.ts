import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress } from "./private-address.ts";

/** Run with: node --test src/lib/net/ */

const BLOCKED = [
  "127.0.0.1", // loopback
  "127.1.2.3",
  "0.0.0.0",
  "10.0.0.1", // private
  "10.255.255.255",
  "172.16.0.1", // private, low edge
  "172.31.255.255", // private, high edge
  "192.168.1.1",
  "169.254.169.254", // cloud instance metadata — the one that matters
  "100.64.0.1", // carrier-grade NAT
  "100.127.255.255",
  "224.0.0.1", // multicast
  "255.255.255.255",
  "::1", // IPv6 loopback
  "::",
  "fc00::1", // unique local
  "fd12:3456::1",
  "fe80::1", // link-local
  "::ffff:127.0.0.1", // IPv4-mapped loopback
  "::ffff:169.254.169.254", // IPv4-mapped metadata
  "not-an-ip",
  "",
];

const ALLOWED = [
  "1.1.1.1",
  "8.8.8.8",
  "93.184.216.34",
  "172.15.255.255", // just below the private block
  "172.32.0.1", // just above it
  "100.63.255.255", // just below CGNAT
  "100.128.0.1", // just above it
  "192.167.1.1", // near but not 192.168
  "169.253.0.1", // near but not link-local
  "223.255.255.255", // just below multicast
  "2606:4700:4700::1111", // Cloudflare v6
  "::ffff:8.8.8.8", // IPv4-mapped public
];

test("blocks private, loopback, link-local and malformed addresses", () => {
  for (const address of BLOCKED) {
    assert.equal(
      isPublicAddress(address),
      false,
      `${address || "(empty)"} should be blocked`,
    );
  }
});

test("allows publicly routable addresses, including range boundaries", () => {
  for (const address of ALLOWED) {
    assert.equal(isPublicAddress(address), true, `${address} should be allowed`);
  }
});
