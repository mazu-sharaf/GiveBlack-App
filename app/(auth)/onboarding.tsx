import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import Colors from "@/constants/colors";

import { logoWhite, onboardingSlides } from "@/constants/images";

import { markOnboardingComplete } from "@/lib/onboarding-storage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const SLIDES = [
  {
    image: onboardingSlides[0],
    title: "Give Back\nWith Purpose",
    subtitle: "The world's go-to platform for Black philanthropy. Make your giving count.",
  },
  {
    image: onboardingSlides[1],
    title: "Endorsed by\n10k+ Philanthropists",
    subtitle: "Join a growing community of changemakers supporting Black organizations worldwide.",
  },
  {
    image: onboardingSlides[2],
    title: "Donate Anytime,\nAnywhere",
    subtitle: "Convenient for activists, advocates, and everyone who believes in giving back.",
  },
];

function PageIndicator({ count, active }: { count: number; active: number }) {
  return (
    <View style={styles.indicator}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === active ? styles.dotActive : styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeInsets();
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = insets.bottom;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);
  };

  const goToWelcome = async () => {
    await markOnboardingComplete();
    router.replace("/(auth)/welcome");
  };

  const goNext = () => {
    if (currentPage < 2) {
      scrollRef.current?.scrollTo({ x: (currentPage + 1) * SCREEN_WIDTH, animated: true });
      setCurrentPage(currentPage + 1);
    } else {
      goToWelcome();
    }
  };

  const skip = () => {
    goToWelcome();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {SLIDES.map((slide, index) => (
          <View key={index} style={[styles.page, { width: SCREEN_WIDTH }]}>
            <Image
              source={slide.image}
              style={styles.bgImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
            />

            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.93)"]}
              locations={[0.25, 0.58, 1]}
              style={styles.gradient}
            />

            <Animated.View
              entering={FadeInUp.delay(100).duration(450)}
              style={[styles.textArea, { paddingBottom: bottomPad + 168 }]}
            >
              <Text style={styles.slideTitle}>{slide.title}</Text>
              <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>
            </Animated.View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={{ width: 50 }} />
        <Animated.View entering={FadeIn.duration(600)}>
          <Image source={logoWhite} style={styles.headerLogo} contentFit="contain" cachePolicy="memory-disk" />
        </Animated.View>
        <Pressable onPress={skip} testID="onboarding-skip" style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <View style={[styles.bottomArea, { paddingBottom: bottomPad + 36 }]}>
        <PageIndicator count={3} active={currentPage} />
        <Pressable style={styles.nextBtn} onPress={goNext} testID="onboarding-next">
          <Text style={styles.nextBtnText}>
            {currentPage === 2 ? "Get Started" : "Next"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  scrollView: {
    flex: 1,
  },
  page: {
    height: SCREEN_HEIGHT,
    position: "relative",
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  textArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 32,
    gap: 12,
  },
  slideTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 36,
    color: "#FFFFFF",
    lineHeight: 46,
    letterSpacing: -0.5,
  },
  slideSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 16,
    color: "rgba(255,255,255,0.78)",
    lineHeight: 26,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 10,
    zIndex: 10,
  },
  headerLogo: {
    width: 120,
    height: 28,
  },
  skipBtn: {
    width: 50,
    alignItems: "flex-end",
  },
  skipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
  },
  bottomArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 32,
    alignItems: "center",
    gap: 20,
    zIndex: 10,
  },
  indicator: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.green,
  },
  dotInactive: {
    width: 8,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  nextBtn: {
    backgroundColor: Colors.green,
    borderRadius: 30,
    paddingVertical: 17,
    width: "100%",
    alignItems: "center",
  },
  nextBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 17,
    color: Colors.white,
  },
});
