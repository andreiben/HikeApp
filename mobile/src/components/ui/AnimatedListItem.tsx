import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  withDelay,
  withSpring,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotion } from '../../hooks/useReduceMotion';

interface AnimatedListItemProps {
  children: React.ReactNode;
  index?: number;
  style?: ViewStyle;
}

export function AnimatedListItem({ children, index = 0, style }: AnimatedListItemProps) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }

    const delay = Math.min(index * 60, 300);
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 20, stiffness: 200 }));
  }, [index, opacity, reduceMotion, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animStyle, style]}>
      {children}
    </Animated.View>
  );
}
