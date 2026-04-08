export interface PaymentSheetParams {
  clientSecret?: string;
  setupIntentClientSecret?: string;
  customerId: string;
  ephemeralKey: string;
  merchantName?: string;
  returnURL?: string;
  allowsDelayedPaymentMethods?: boolean;
  merchantCountryCode?: string;
  currencyCode?: string;
}

export type NativePaymentStatus = "success" | "canceled" | "failed" | "unavailable";
export interface NativePaymentResult {
  status: NativePaymentStatus;
  message?: string;
}

export async function isNativeStripeAvailable(): Promise<boolean> {
  return false;
}

export async function initNativeStripe(_publishableKey: string): Promise<void> {
}

export async function presentNativePaymentSheet(
  _params?: PaymentSheetParams
): Promise<NativePaymentResult> {
  return { status: "unavailable", message: "NATIVE_UNAVAILABLE" };
}

export async function confirmStripePayment(
  _clientSecret: string,
  _paymentMethodType?: string,
  _params?: PaymentSheetParams
): Promise<{ error?: { message: string } }> {
  return { error: { message: "NATIVE_UNAVAILABLE" } };
}
