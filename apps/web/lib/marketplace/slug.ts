/** URL-safe slug from a display name (mirrors private.slugify intent). */
export function slugifyAgentName(input: string): string {
  const raw = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return raw || "agent";
}

/** Prefer a human slug from the agent name when the current one is empty/placeholder. */
export function preferredAgentSlug(name: string, currentSlug?: string | null): string {
  const current = (currentSlug || "").trim();
  if (!current || /^untitled-agent(-[0-9]+)?$/i.test(current)) {
    return slugifyAgentName(name);
  }
  return slugifyAgentName(current);
}

/** Pick the first free slug: base, then base-2, base-3, … */
export async function nextAvailableSlug(
  desired: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifyAgentName(desired);
  let candidate = base;
  let suffix = 2;
  for (;;) {
    if (!(await isTaken(candidate))) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
    if (suffix > 50) return `${base}-${Date.now().toString(36)}`;
  }
}

export type ListingBillingInterval = "one_time" | "weekly" | "monthly" | "yearly";

export const LISTING_BILLING_INTERVALS: ListingBillingInterval[] = [
  "one_time",
  "weekly",
  "monthly",
  "yearly",
];

export function isListingBillingInterval(value: string): value is ListingBillingInterval {
  return (LISTING_BILLING_INTERVALS as readonly string[]).includes(value);
}
