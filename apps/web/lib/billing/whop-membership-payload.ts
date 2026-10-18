type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value && typeof value === "object" ? value as RecordValue : {};
}

/** Payment IDs must never be stored as subscription IDs. Fetch the membership
 * when payment.succeeded only carries its reference. Let failures reach the
 * webhook handler so Whop can retry instead of acknowledging lost fulfillment. */
export async function resolveWhopMembership(
  data: unknown,
  retrieve: (id: string) => Promise<unknown>,
): Promise<RecordValue> {
  const payment = record(data);
  const nested = record(payment.membership);
  const candidate = typeof nested.id === "string" ? nested : payment;
  const id = [candidate.id, payment.membership_id, payment.membership]
    .find((value): value is string => typeof value === "string" && value.startsWith("mem_"));
  if (!id) throw new Error("whop_membership_id_missing");
  if (candidate.id === id && record(candidate.metadata).stack32_user_id) return candidate;
  const membership = record(await retrieve(id));
  if (membership.id !== id) throw new Error("whop_membership_invalid");
  return {
    ...membership,
    metadata: { ...record(payment.metadata), ...record(membership.metadata) },
  };
}
