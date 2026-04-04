/** Normalize Stripe expand fields (string id vs { id }) for PaymentIntent, Session, etc. */
export function stripeId(ref: string | { id?: string } | null | undefined): string | null {
  if (ref == null) return null;
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && "id" in ref && typeof (ref as { id: unknown }).id === "string") {
    return (ref as { id: string }).id;
  }
  return null;
}
