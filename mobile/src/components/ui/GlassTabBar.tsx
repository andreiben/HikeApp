import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { BorderRadius, Colors, Spacing, Typography } from '../../theme';

interface TabItemProps {
  route: BottomTabBarProps['state']['routes'][number];
  index: number;
  isFocused: boolean;
  descriptor: BottomTabBarProps['descriptors'][string];
  navigation: BottomTabBarProps['navigation'];
}

function TabItem({ route, index, isFocused, descriptor, navigation }: TabItemProps) {
  const scale = useSharedValue(isFocused ? 1.1 : 1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPress = () => {
    scale.value = withSequence(
      withSpring(0.9, { damping: 18, stiffness: 280 }),
      withSpring(isFocused ? 1.1 : 1, { damping: 16, stiffness: 220 })
    );

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  const onLongPress = () => {
    navigation.emit({
      type: 'tabLongPress',
      target: route.key,
    });
  };

  const { options } = descriptor;
  const label =
    typeof options.tabBarLabel === 'string'
      ? options.tabBarLabel
      : typeof options.title === 'string'
        ? options.title
        : route.name;

  const iconColor = isFocused ? Colors.accent : Colors.textSecondary;
  const icon = options.tabBarIcon
    ? options.tabBarIcon({
        focused: isFocused,
        color: iconColor,
        size: 22,
      })
    : <Text style={[styles.fallbackIcon, { color: iconColor }]}>{label.slice(0, 1)}</Text>;

  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={options.tabBarAccessibilityLabel}
      testID={options.tabBarButtonTestID}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabButton}
    >
      <Animated.View
        style={[
          styles.iconContainer,
          isFocused && styles.iconContainerFocused,
          animatedStyle,
        ]}
      >
        {icon}
      </Animated.View>
      <Text
        style={[
          styles.label,
          { color: isFocused ? Colors.accent : Colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, Spacing.sm) },
      ]}
    >
      <View accessibilityRole="tablist" style={styles.row}>
        {state.routes.map((route, index) => (
          <TabItem
            key={route.key}
            route={route}
            index={index}
            isFocused={state.index === index}
            descriptor={descriptors[route.key]}
            navigation={navigation}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.base,
    backgroundColor: Colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  iconContainer: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
  },
  iconContainerFocused: {
    backgroundColor: Colors.accentMuted,
    borderRadius: BorderRadius.lg,
  },
  label: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },
  fallbackIcon: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
});
