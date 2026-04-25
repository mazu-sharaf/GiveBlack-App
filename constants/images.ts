export const campaignImages: Record<number, any> = {
  0: require("@/assets/images/campaign-1.webp"),
  1: require("@/assets/images/campaign-2.webp"),
  2: require("@/assets/images/campaign-3.webp"),
  3: require("@/assets/images/campaign-4.webp"),
  4: require("@/assets/images/campaign-5.webp"),
  5: require("@/assets/images/campaign-6.webp"),
};

export function getCampaignImage(index: number) {
  return campaignImages[index % 6];
}

export const logoBlack = require("@/assets/images/logo-black.webp");
export const logoWhite = require("@/assets/images/logo-white.webp");
export const splashLogo = require("@/assets/images/splash-logo-main.webp");

export const onboardingSlides = [
  require("@/assets/images/onboarding-slide-1.png"),
  require("@/assets/images/onboarding-slide-2.png"),
  require("@/assets/images/onboarding-slide-3.png"),
];

export const onboardingPeople = [
  require("@/assets/images/onboarding-person-1.webp"),
  require("@/assets/images/onboarding-person-2.webp"),
  require("@/assets/images/onboarding-person-3.webp"),
  require("@/assets/images/onboarding-person-4.webp"),
  require("@/assets/images/onboarding-person-5.webp"),
  require("@/assets/images/onboarding-person-6.webp"),
  require("@/assets/images/onboarding-person-7.webp"),
  require("@/assets/images/onboarding-person-8.webp"),
];
