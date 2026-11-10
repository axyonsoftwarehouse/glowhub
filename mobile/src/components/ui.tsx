import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cardShadow, colors, radius, spacing } from "@/theme";

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={["top", "left", "right"]}>
      {children}
    </SafeAreaView>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Text style={[styles.brand, compact && styles.brandCompact]}>
      Glow<Text style={styles.brandAccent}>Hub</Text>
    </Text>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" ? styles.buttonPrimary : styles.buttonGhost,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.brandForeground : colors.brand}
        />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === "primary"
              ? styles.buttonLabelPrimary
              : styles.buttonLabelGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        style={[styles.input, props.style]}
        placeholderTextColor={colors.muted}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Pill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
}) {
  const toneStyle = {
    brand: { backgroundColor: colors.brandSoft, color: colors.brand },
    success: { backgroundColor: colors.successSoft, color: colors.success },
    warning: { backgroundColor: colors.warningSoft, color: colors.warning },
    danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
    neutral: { backgroundColor: "#F1EEF3", color: colors.muted },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: toneStyle.backgroundColor }]}>
      <Text style={[styles.pillLabel, { color: toneStyle.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  brand: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1.2,
    color: colors.text,
  },
  brandCompact: {
    fontSize: 20,
    letterSpacing: -0.6,
  },
  brandAccent: {
    color: colors.brand,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  button: {
    minHeight: 50,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: {
    backgroundColor: colors.brand,
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  buttonLabelPrimary: {
    color: colors.brandForeground,
  },
  buttonLabelGhost: {
    color: colors.text,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    minHeight: 50,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  fieldError: {
    fontSize: 12,
    color: colors.danger,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});
