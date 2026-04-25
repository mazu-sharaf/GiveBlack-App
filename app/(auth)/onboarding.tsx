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
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp, FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useThemeColors , useTheme } from "@/context/ThemeContext";

import { logoBlack, logoWhite, onboardingPeople } from "@/constants/images";

import { markOnboardingComplete } from "@/lib/onboarding-storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const PEOPLE = onboardingPeople;

const CIRCLE_POSITIONS = [
  { top: 30, left: 20, size: 44, opacity: 0.5 },
  { top: 10, left: 140, size: 38, opacity: 0.4 },
  { top: 50, right: 30, size: 52, opacity: 0.7 },
  { top: 140, left: 10, size: 40, opacity: 0.35 },
  { top: 160, right: 50, size: 36, opacity: 0.45 },
  { top: 230, left: 60, size: 42, opacity: 0.5 },
  { top: 210, left: 180, size: 34, opacity: 0.3 },
  { top: 260, right: 20, size: 46, opacity: 0.55 },
];

function PeopleCircles() {
  return (
    <View style={styles.peopleContainer}>
      {PEOPLE.map((src, i) => {
        const pos = CIRCLE_POSITIONS[i];
        const style: any = {
          position: "absolute" as const,
          width: pos.size,
          height: pos.size,
          borderRadius: pos.size / 2,
          top: pos.top,
          overflow: "hidden",
          borderWidth: 2,
          borderColor: Colors.white,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 2,
        };
        if (pos.left !== undefined) style.left = pos.left;
        if (pos.right !== undefined) style.right = pos.right;
        return (
          <Animated.View key={i} entering={FadeIn.delay(200 + i * 100).duration(500)} style={style}>
            <Image source={src} style={{ width: pos.size, height: pos.size }} contentFit="cover" cachePolicy="memory-disk" />
          </Animated.View>
        );
      })}
    </View>
  );
}

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
  const c = useThemeColors();
  const { isDark } = useTheme();
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
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: topPad }]}>
      <View style={styles.skipRow}>
        <View style={{ width: 50 }} />
        <Image source={isDark ? logoWhite : logoBlack} style={styles.headerLogo} contentFit="contain" cachePolicy="memory-disk" />
        <Pressable onPress={skip} testID="onboarding-skip">
          <Text style={[styles.skipText, { color: c.textMuted }]}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {/* Page 1: Welcome */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <View style={styles.illustrationArea}>
            <View style={styles.iconCircleLarge}>
              <Ionicons name="gift-outline" size={64} color={Colors.green} />
            </View>
          </View>
          <View style={styles.textArea}>
            <Text style={[styles.pageTitle, { color: c.text }]}>Welcome to{"\n"}GiveBlack</Text>
            <Text style={[styles.pageSubtitle, { color: c.textMuted }]}>
              The world's go-to app for Black Philanthropy. Give back with purpose.
            </Text>
          </View>
        </View>

        {/* Page 2: Community */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <View style={styles.illustrationArea}>
            <PeopleCircles />
            <View style={styles.heartsCenter}>
              <Ionicons name="heart" size={48} color={Colors.green} />
              <Ionicons name="heart" size={32} color={Colors.green} style={{ position: "absolute", left: -18, top: 10 }} />
            </View>
          </View>
          <View style={styles.textArea}>
            <Text style={[styles.pageTitle, { color: c.text }]}>Endorsed by over{"\n"}10k Philanthropists</Text>
            <Text style={[styles.pageSubtitle, { color: c.textMuted }]}>
              Join a growing community of changemakers supporting Black organizations.
            </Text>
          </View>
        </View>

        {/* Page 3: Donate */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <View style={styles.illustrationArea}>
            <View style={styles.handsIcon}>
              <Ionicons name="heart-outline" size={52} color={Colors.green} style={{ marginBottom: -8 }} />
              <View style={styles.handsRow}>
                <Ionicons name="hand-left-outline" size={44} color={Colors.green} />
                <Ionicons name="hand-right-outline" size={44} color={Colors.green} />
              </View>
            </View>
          </View>
          <View style={styles.textArea}>
            <Text style={[styles.pageTitle, { color: c.text }]}>Donate to charity{"\n"}anytime, anywhere.</Text>
            <Text style={[styles.pageSubtitle, { color: c.textMuted }]}>
              Convenient for activists, advocates, and everyone who believes in giving back.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomArea, { paddingBottom: bottomPad + 20 }]}>
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
    backgroundColor: Colors.cream,
  },
  skipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  headerLogo: {
    width: 120,
    height: 28,
  },
  skipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.textMuted,
    paddingHorizontal: 4,
  },
  scrollView: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  illustrationArea: {
    width: SCREEN_WIDTH,
    height: 320,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconCircleLarge: {
    width: 140,
    height: 140,
    borderRadius: 32,
    backgroundColor: Colors.green + "12",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: Colors.green + "30",
  },
  peopleContainer: {
    width: SCREEN_WIDTH - 40,
    height: 300,
    position: "relative",
  },
  heartsCenter: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -30,
    marginLeft: -20,
  },
  handsIcon: {
    alignItems: "center",
  },
  handsRow: {
    flexDirection: "row",
    gap: 4,
  },
  textArea: {
    paddingHorizontal: 40,
    alignItems: "center",
    marginTop: 20,
  },
  pageTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.primary,
    textAlign: "center",
    lineHeight: 38,
    marginBottom: 12,
  },
  pageSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 24,
  },
  bottomArea: {
    paddingHorizontal: 40,
    alignItems: "center",
    gap: 20,
  },
  indicator: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    height: 10,
    borderRadius: 5,
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.green,
  },
  dotInactive: {
    width: 10,
    backgroundColor: Colors.green + "40",
  },
  nextBtn: {
    backgroundColor: Colors.green,
    borderRadius: 30,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
  },
  nextBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: Colors.white,
  },
});
