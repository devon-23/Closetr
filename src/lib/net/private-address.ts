import { isIP } from "node:net";

/**
 * Is this IP address publicly routable?
 *
 * The guard in front of `/api/fetch-image`, which fetches a URL chosen by
 * whoever is signed in. Without this, that route would happily retrieve
 * `http://169.254.169.254/` (cloud instance metadata) or anything else
 * inside the deployment's own network and hand back the bytes.
 *
 * Lives on its own, with no framework imports, so it can be exercised
 * directly — see `private-address.test.ts`.
 */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false; // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a >= 224) return false; // multicast and reserved
    return true;
  }

  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return false;
    // An IPv4-mapped address is only as safe as the address it wraps.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPublicAddress(mapped[1]);
    if (/^f[cd]/.test(lower)) return false; // unique local, fc00::/7
    if (/^fe[89ab]/.test(lower)) return false; // link-local, fe80::/10
    return true;
  }

  // Not an IP address at all — a hostname reaches here only by mistake.
  return false;
}
