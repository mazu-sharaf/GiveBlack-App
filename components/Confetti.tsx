import React, { useEffect, useRef } from "react";
import { View, Animated, Dimensions, StyleSheet } from "react-native";

const CONFETTI_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
  "#BB8FCE", "#85C1E9", "#F0B27A", "#82E0AA",
  "#F1948A", "#AED6F1", "#A3E4D7", "#FAD7A0",
];

const SHAPES = ["square", "rectangle", "circle"] as const;

interface ConfettiPiece {
  x: Animated.Value;
  y: Animated.Value;
  rotate: Animated.Value;
  opacity: Animated.Value;
  color: string;
  shape: typeof SHAPES[number];
  size: number;
  startX: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const NUM_PIECES = 50;

export default function Confetti({ duration = 3000 }: { duration?: number }) {
  const pieces = useRef<ConfettiPiece[]>([]);

  if (pieces.current.length === 0) {
    for (let i = 0; i < NUM_PIECES; i++) {
      const startX = Math.random() * SCREEN_WIDTH;
      pieces.current.push({
        x: new Animated.Value(0),
        y: new Animated.Value(-20),
        rotate: new Animated.Value(0),
        opacity: new Animated.Value(1),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        size: 6 + Math.random() * 8,
        startX,
      });
    }
  }

  useEffect(() => {
    const animations = pieces.current.map((piece, i) => {
      const delay = Math.random() * 800;
      const fallDuration = duration + Math.random() * 1500;
      const drift = (Math.random() - 0.5) * 120;

      return Animated.parallel([
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(piece.y, {
            toValue: SCREEN_HEIGHT + 40,
            duration: fallDuration,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(piece.x, {
            toValue: drift,
            duration: fallDuration,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(piece.rotate, {
            toValue: 4 + Math.random() * 6,
            duration: fallDuration,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(delay + fallDuration * 0.7),
          Animated.timing(piece.opacity, {
            toValue: 0,
            duration: fallDuration * 0.3,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });

    Animated.parallel(animations).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.current.map((piece, i) => {
        const spin = piece.rotate.interpolate({
          inputRange: [0, 10],
          outputRange: ["0deg", "3600deg"],
        });

        const borderRadius =
          piece.shape === "circle" ? piece.size / 2 : piece.shape === "square" ? 2 : 1;

        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: piece.startX,
              top: 0,
              width: piece.shape === "rectangle" ? piece.size * 0.5 : piece.size,
              height: piece.shape === "rectangle" ? piece.size * 1.4 : piece.size,
              backgroundColor: piece.color,
              borderRadius,
              opacity: piece.opacity,
              transform: [
                { translateX: piece.x },
                { translateY: piece.y },
                { rotate: spin },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
