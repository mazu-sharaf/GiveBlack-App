import React from "react";
import { StripeProvider } from "@stripe/stripe-react-native";

export default function StripeProviderWrapper({ children }: { children: React.ReactNode }) {
  const publishableKey =
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLISHABLE_KEY ||
    "";

  if (!publishableKey) {
    return <>{children}</>;
  }

  return (
    <StripeProvider publishableKey={publishableKey} merchantIdentifier="merchant.com.giveblack.app">
      {children}
    </StripeProvider>
  );
}
