export function isApplePrivateRelayEmail(email?: string | null): boolean {
  return /@privaterelay\.appleid\.com$/i.test((email || "").trim());
}

export function getPreferredDisplayName(
  name?: string | null,
  email?: string | null,
  fallback = "User"
): string {
  const trimmedName = (name || "").trim();
  const trimmedEmail = (email || "").trim().toLowerCase();
  const emailLocalPart = trimmedEmail.split("@")[0] || "";

  if (trimmedName) {
    if (isApplePrivateRelayEmail(trimmedEmail) && trimmedName.toLowerCase() === emailLocalPart) {
      return "Apple User";
    }
    return trimmedName;
  }

  if (isApplePrivateRelayEmail(trimmedEmail)) {
    return "Apple User";
  }

  if (emailLocalPart) {
    return emailLocalPart;
  }

  return fallback;
}
