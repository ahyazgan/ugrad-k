import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, radii, type } from "./theme";

export { colors, font, fontFamilies, radii, shadow, type } from "./theme";

export function Screen({
  children,
  scroll = true,
  padded = true,
  safeTop = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Başlıksız ekranlarda üst güvenli alanı da boşalt */
  safeTop?: boolean;
}) {
  const inner = <View style={[padded && styles.padded, { gap: 14 }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={safeTop ? ["top", "bottom", "left", "right"] : ["bottom", "left", "right"]}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  testID,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** primary: limon zemin + mürekkep yazı · dark: siyah hap · secondary: çerçeveli hap · danger: kırmızı */
  variant?: "primary" | "secondary" | "danger" | "dark";
  testID?: string;
}) {
  const off = disabled || loading;
  const fg = variant === "danger" || variant === "dark" ? "#fff" : colors.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        variant === "dark" && styles.buttonDark,
        off && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label.toLocaleUpperCase("tr")}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? { borderColor: colors.danger } : null]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable style={styles.toggleRow} onPress={() => onChange(!value)} accessibilityRole="switch">
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.muted}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.ink, false: colors.border }}
        thumbColor={value ? colors.lime : "#fff"}
        {...({ activeThumbColor: colors.lime } as object)}
      />
    </Pressable>
  );
}

/** Tek seçimli düğme grubu (ör. hizmet seviyesi) */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  label?: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  testIDPrefix?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.toggleLabel}>{label}</Text> : null}
      <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                flex: 1,
                borderWidth: 2,
                borderColor: on ? colors.ink : colors.border,
                backgroundColor: on ? colors.lime : colors.surface,
                borderRadius: radii.tile,
                paddingVertical: 10,
                paddingHorizontal: 6,
                alignItems: "center",
                gap: 2,
              }}
            >
              <Text style={{ ...font("black"), fontSize: 15, letterSpacing: -0.3, color: colors.ink }}>{o.label}</Text>
              {o.hint ? <Text style={{ ...font("semibold"), fontSize: 11, color: on ? colors.mutedDark : colors.muted, textAlign: "center" }}>{o.hint}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Pressable style={styles.checkRow} onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>{checked ? <Text style={styles.check}>✓</Text> : null}</View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export function ErrorBox({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={{ ...font("bold"), color: colors.danger }}>{message}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { padding: 14 },
  title: { ...type.h2 },
  muted: { ...font("semibold"), color: colors.muted, fontSize: 14, lineHeight: 20 },
  body: { ...font("semibold"), color: colors.text, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 18,
    gap: 12,
  },
  button: {
    backgroundColor: colors.lime,
    paddingHorizontal: 22,
    borderRadius: radii.pill,
    alignItems: "center",
    minHeight: 56,
    justifyContent: "center",
  },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: 2, borderColor: colors.ink, minHeight: 52 },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDark: { backgroundColor: colors.ink },
  buttonText: { ...font("black"), color: colors.ink, fontSize: 17, letterSpacing: -0.2 },
  label: { ...type.label },
  input: {
    ...font("bold"),
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: radii.field,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
  },
  error: { ...font("bold"), color: colors.danger, fontSize: 13 },
  errorBox: { backgroundColor: colors.dangerLight, borderRadius: radii.field, padding: 14 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  toggleLabel: { ...font("extrabold"), fontSize: 15, color: colors.text },
  checkRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.lime },
  check: { ...font("black"), color: colors.ink },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { ...font("semibold"), color: colors.mutedDark, flex: 1, fontSize: 14 },
  rowValue: { ...font("bold"), color: colors.text, fontSize: 14 },
  bold: { ...font("black"), color: colors.ink, fontSize: 17, letterSpacing: -0.3 },
});
