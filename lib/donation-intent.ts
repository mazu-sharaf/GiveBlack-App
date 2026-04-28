import AsyncStorage from "@react-native-async-storage/async-storage";

const INTENT_KEY = "@gb_donation_intent";
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface DonationIntent {
  orgId: string;
  campaignId?: string;
  amount?: number;
}

export async function saveDonationIntent(intent: DonationIntent): Promise<void> {
  try {
    await AsyncStorage.setItem(
      INTENT_KEY,
      JSON.stringify({ ...intent, savedAt: Date.now() }),
    );
  } catch {
    // non-critical: ignore
  }
}

export async function loadDonationIntent(): Promise<DonationIntent | null> {
  try {
    const raw = await AsyncStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (Date.now() - savedAt > EXPIRY_MS) {
      await AsyncStorage.removeItem(INTENT_KEY);
      return null;
    }

    if (typeof parsed.orgId !== "string" || !parsed.orgId) return null;
    const amount =
      parsed.amount != null
        ? typeof parsed.amount === "number" && isFinite(parsed.amount) && parsed.amount > 0
          ? parsed.amount
          : null
        : undefined;
    if (amount === null) return null;
    const campaignId =
      typeof parsed.campaignId === "string" && parsed.campaignId ? parsed.campaignId : undefined;
    return { orgId: parsed.orgId, campaignId, amount } as DonationIntent;
  } catch {
    return null;
  }
}

export async function clearDonationIntent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(INTENT_KEY);
  } catch {
    // non-critical: ignore
  }
}
