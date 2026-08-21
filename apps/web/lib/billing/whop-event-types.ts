/**
 * Whop registers some webhook events with `_` in the dashboard while payloads
 * often use `.` — normalize both shapes before branching.
 */
export function normalizeWhopEventType(raw: string): string {
  return raw.trim().toLowerCase();
}

export function whopEventKey(raw: string): string {
  return normalizeWhopEventType(raw).replace(/[_.]/g, "");
}

export function isWhopActivateEvent(raw: string): boolean {
  const key = whopEventKey(raw);
  return key === "membershipactivated" || key === "membershipwentvalid";
}

export function isWhopDeactivateEvent(raw: string): boolean {
  const key = whopEventKey(raw);
  return key === "membershipdeactivated" || key === "membershipwentinvalid";
}

export function isWhopPaymentSucceeded(raw: string): boolean {
  return whopEventKey(raw) === "paymentsucceeded";
}

export function isWhopPaymentFailed(raw: string): boolean {
  return whopEventKey(raw) === "paymentfailed";
}

export function isWhopRefundCreated(raw: string): boolean {
  return whopEventKey(raw) === "refundcreated";
}

export function isWhopCancelAtPeriodEndChanged(raw: string): boolean {
  const key = whopEventKey(raw);
  return (
    key === "membershipcancelatperiodendchanged" ||
    key === "membershipcancelatperiodend"
  );
}
