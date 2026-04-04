/** Charity/donor list: never show "Anonymous" unless the donor opted in. */
export function donorDisplayName(d: {
  donor_name?: string | null;
  donor_email?: string | null;
  is_anonymous?: boolean | null;
}): string {
  if (d.is_anonymous) return "Anonymous";
  const name = (d.donor_name ?? "").trim();
  if (name) return name;
  const em = (d.donor_email ?? "").trim();
  if (em) {
    const local = em.split("@")[0];
    if (local) return local;
  }
  return "Donor";
}

export function donorInitial(d: {
  donor_name?: string | null;
  donor_email?: string | null;
  is_anonymous?: boolean | null;
}): string {
  const label = donorDisplayName(d);
  if (label === "Anonymous") return "A";
  const ch = label.charAt(0);
  return ch && /[a-zA-Z0-9]/.test(ch) ? ch.toUpperCase() : "?";
}
