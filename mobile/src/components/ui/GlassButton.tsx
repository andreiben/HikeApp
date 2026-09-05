import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { BorderRadius, Colors, Spacing, Typography } from "../../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface GlassButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
}

export function GlassButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  style,
  labelStyle,
  icon,
}: GlassButtonProps) {
  const scale = useSharedValue(1);
  const triggerHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.5 : 1,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 20, stiffness: 300 });
    triggerHaptic();
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
  };

  const variantStyle = {
    primary: {
      bg: "#1B4332",
      text: "#FFFFFF",
      border: "transparent",
    },
    secondary: {
      bg: "#F5F0E8",
      text: "#1B4332",
      border: "#E0D9D0",
    },
    danger: {
      bg: "#C62828",
      text: "#FFFFFF",
      border: "transparent",
    },
    ghost: {
      bg: "transparent",
      text: "#1B4332",
      border: "#1B4332",
    },
  }[variant];

  const sizeStyle = {
    sm: {
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: Spacing.md,
      fontSize: Typography.size.sm,
    },
    md: {
      minHeight: 44,
      paddingVertical: 12,
      paddingHorizontal: Spacing.lg,
      fontSize: Typography.size.md,
    },
    lg: {
      minHeight: 44,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      fontSize: Typography.size.lg,
    },
  }[size];

  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.base,
        {
          backgroundColor: variantStyle.bg,
          borderColor: variantStyle.border,
          minHeight: sizeStyle.minHeight,
          paddingVertical: sizeStyle.paddingVertical,
          paddingHorizontal: sizeStyle.paddingHorizontal,
        },
        animStyle,
        style,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.label,
          { color: variantStyle.text, fontSize: sizeStyle.fontSize },
          labelStyle,
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    overflow: "hidden",
  },
  label: {
    fontWeight: Typography.weight.semibold,
    letterSpacing: 0.3,
  },
});
