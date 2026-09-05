import React from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

interface PressableFeedbackProps {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  scaleTo?: number;
}

export function PressableFeedback({
  children,
  onPress,
  style,
  haptic = true,
  scaleTo = 0.97,
}: PressableFeedbackProps) {
  const scale = useSharedValue(1);
  const triggerHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const tap = Gesture.Tap()
    .onBegin(() => {
      scale.value = withSpring(scaleTo, { damping: 20, stiffness: 400 });
      if (haptic) {
        runOnJS(triggerHaptic)();
      }
    })
    .onFinalize((_event, success) => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      if (success) {
        runOnJS(onPress)();
      }
    });

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[{ minHeight: 44 }, animStyle, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}
