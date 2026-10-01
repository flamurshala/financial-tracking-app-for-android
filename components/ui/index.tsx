import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
export function Screen({ children }: PropsWithChildren) {
  const colors = useTheme();
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 24, flexGrow: 1 }}>{children}</ScrollView></SafeAreaView>;
}
export function Card({ children }: PropsWithChildren) {
  const colors = useTheme();
  return <View style={{ backgroundColor: colors.surface, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border, gap: 12 }}>{children}</View>;
}
export function SectionTitle({ children }: PropsWithChildren) {
  const colors = useTheme(); return <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>{children}</Text>;
}
export function Body({ children }: PropsWithChildren) {
  const colors = useTheme(); return <Text style={{ color: colors.muted, fontSize: 16, lineHeight: 24 }}>{children}</Text>;
}
export function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  const colors = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ backgroundColor: colors.primary, opacity: disabled ? 0.5 : pressed ? 0.8 : 1, padding: 16, borderRadius: 12, minHeight: 48 })}><Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{title}</Text></Pressable>;
}
export function Input({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const colors = useTheme();
  return <View style={{ gap: 8 }}><Text style={{ color: colors.text }}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={[{ color: colors.text, borderColor: colors.border, borderWidth: 1, padding: 14, borderRadius: 12, fontSize: 16 }, props.style]} />{error ? <Text accessibilityRole="alert" style={{ color: colors.text }}>{error}</Text> : null}</View>;
}
export function EmptyState({ title, description }: { title: string; description: string }) {
  return <Card><SectionTitle>{title}</SectionTitle><Body>{description}</Body></Card>;
}
