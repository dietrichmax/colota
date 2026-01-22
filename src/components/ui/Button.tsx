/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";

type Props = {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  activeOpacity?: number;
  color?: string;
};

/**
 * Custom button component with theme support and disabled state.
 *
 * Features:
 * - Automatic theme color application
 * - Disabled state with visual feedback
 * - Customizable styling
 * - Touch feedback with opacity
 *
 * @example
 * ```tsx
 * <Button
 *   title="Submit"
 *   onPress={handleSubmit}
 *   disabled={isLoading}
 * />
 * ```
 */
export function Button({
  title,
  onPress,
  disabled = false,
  style,
  activeOpacity,
  color,
}: Props) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: disabled ? colors.textDisabled : colors.primary,
          borderRadius: colors.borderRadius,
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={activeOpacity ? activeOpacity : 0.7}
    >
      <Text style={[styles.text, { color: color }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    marginVertical: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
});
