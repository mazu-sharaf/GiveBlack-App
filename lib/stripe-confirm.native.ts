export interface PaymentSheetParams {
  clientSecret?: string;
  setupIntentClientSecret?: string;
  customerId: string;
  ephemeralKey: string;
  merchantName?: string;
  returnURL?: string;
  allowsDelayedPaymentMethods?: boolean;
}

export type NativePaymentStatus = "success" | "canceled" | "failed" | "unavailable";
export interface NativePaymentResult {
  status: NativePaymentStatus;
  message?: string;
}

let stripeModule: typeof import("@stripe/stripe-react-native") | null = null;
let stripeLoadAttempted = false;
let stripeAvailable = false;
let initializedPublishableKey: string | null = null;

function getPublishableKeyFromEnv(): string {
  return (
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLISHABLE_KEY ||
    ""
  ).trim();
}

async function loadStripe(): Promise<boolean> {
  if (stripeLoadAttempted) return stripeAvailable;
  stripeLoadAttempted = true;
  try {
    stripeModule = await import("@stripe/stripe-react-native");
    stripeAvailable = true;
  } catch {
    stripeAvailable = false;
  }
  return stripeAvailable;
}

export async function isNativeStripeAvailable(): Promise<boolean> {
  return loadStripe();
}

export async function initNativeStripe(publishableKey: string): Promise<void> {
  const available = await loadStripe();
  if (!available || !stripeModule) return;
  if (!publishableKey || publishableKey === initializedPublishableKey) return;
  try {
    await stripeModule.initStripe({ publishableKey, merchantIdentifier: "merchant.com.giveblack" });
    initializedPublishableKey = publishableKey;
  } catch {
    stripeAvailable = false;
    initializedPublishableKey = null;
  }
}

function isNativeUnavailableMessage(message?: string): boolean {
  if (!message) return false;
  const msg = message.toLowerCase();
  return msg.includes("native module") || msg.includes("development build") || msg.includes("not available");
}

export async function presentNativePaymentSheet(
  params?: PaymentSheetParams
): Promise<NativePaymentResult> {
  const available = await loadStripe();
  if (!available || !stripeModule || !params) {
    return { status: "unavailable", message: "NATIVE_UNAVAILABLE" };
  }

  try {
    // Ensure Stripe native SDK is initialized before interacting with PaymentSheet.
    // Missing publishable key can hard-fail on some Android builds.
    const publishableKey = getPublishableKeyFromEnv();
    if (!publishableKey) {
      return {
        status: "failed",
        message:
          "Stripe is not configured. Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in your app environment.",
      };
    }
    await initNativeStripe(publishableKey);
    if (!initializedPublishableKey) {
      return {
        status: "failed",
        message:
          "Stripe failed to initialize on this build. Rebuild the app after confirming Stripe config.",
      };
    }

    const intentSecret = params.clientSecret || params.setupIntentClientSecret;
    if (!intentSecret) {
      return {
        status: "failed",
        message: "Missing Stripe client secret for checkout.",
      };
    }

    const initResult = await stripeModule.initPaymentSheet({
      paymentIntentClientSecret: params.clientSecret,
      setupIntentClientSecret: params.setupIntentClientSecret,
      customerEphemeralKeySecret: params.ephemeralKey,
      customerId: params.customerId,
      merchantDisplayName: params.merchantName || "GiveBlack",
      returnURL: params.returnURL,
      allowsDelayedPaymentMethods: params.allowsDelayedPaymentMethods ?? false,
    });

    if (initResult.error) {
      if (isNativeUnavailableMessage(initResult.error.message)) {
        return { status: "unavailable", message: "NATIVE_UNAVAILABLE" };
      }
      return { status: "failed", message: initResult.error.message || "Unable to initialize payment sheet." };
    }

    const presentResult = await stripeModule.presentPaymentSheet();

    if (presentResult.error) {
      if (presentResult.error.code === "Canceled") {
        return { status: "canceled", message: "PAYMENT_CANCELED" };
      }
      return { status: "failed", message: presentResult.error.message || "Payment failed. Please try again." };
    }

    return { status: "success" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isNativeUnavailableMessage(msg)) {
      return { status: "unavailable", message: "NATIVE_UNAVAILABLE" };
    }
    return { status: "failed", message: msg };
  }
}

export async function confirmStripePayment(
  _clientSecret: string,
  _paymentMethodType?: string,
  params?: PaymentSheetParams
): Promise<{ error?: { message: string } }> {
  const result = await presentNativePaymentSheet(params);
  if (result.status === "success") return {};
  return { error: { message: result.message || "PAYMENT_FAILED" } };
}
