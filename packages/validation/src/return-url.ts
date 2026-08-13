/**
 * Same-origin relative-path guard for post-login redirects (E01-S003).
 * Rejects absolute/protocol-relative/backslash-trick URLs so an
 * attacker-crafted `?returnUrl=` can't send a freshly authenticated user
 * off-site (open redirect) — an allow-list check, not a denylist of known
 * bad prefixes, since new bypass tricks are cheaper to invent than to
 * enumerate.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const isC0Control = code <= 31;
    const isDelete = code === 127;
    if (isC0Control || isDelete) return true;
  }
  return false;
}

export function sanitizeReturnUrl(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (hasControlCharacter(raw)) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (raw.includes("://")) return fallback;
  return raw;
}
