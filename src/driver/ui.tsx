import { useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Link, type LinkProps } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, isApiErrorResponse } from '@/api';
import { ThemedText } from '@/components/themed-text';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError && isApiErrorResponse(error.payload)) {
    return `${error.payload.error.message} (request ${error.payload.error.requestId})`;
  }
  return error instanceof Error
    ? error.message
    : 'Unable to connect. Check the connection and retry.';
}
export function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.screen,
        { paddingBottom: insets.bottom + Spacing.four },
      ]}
    >
      {children}
    </ScrollView>
  );
}
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" accessibilityRole="header">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText>{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        {...props}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.textSecondary },
          props.style,
        ]}
      />
    </View>
  );
}
export function Notice({ text }: { text: string | null }) {
  return text ? (
    <ThemedText accessibilityRole="alert" selectable>
      {text}
    </ThemedText>
  ) : null;
}
export function Action({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: disabled ? theme.backgroundElement : theme.action,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <ThemedText
        style={{
          color: disabled ? theme.textSecondary : theme.actionText,
          textAlign: 'center',
        }}
      >
        {title}
      </ThemedText>
    </Pressable>
  );
}
export function RouteLink({
  href,
  children,
}: {
  href: LinkProps['href'];
  children: string;
}) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  // Router's native Slot merges static styles; a Pressable style callback loses its target size.
  return (
    <Link href={href} asChild style={styles.routeLink}>
      <Pressable
        accessibilityRole="link"
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={{
          backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
        }}
      >
        <ThemedText
          style={{ color: theme.action, textDecorationLine: 'underline' }}
        >
          {children}
        </ThemedText>
      </Pressable>
    </Link>
  );
}
const styles = StyleSheet.create({
  screen: {
    padding: Spacing.three,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  section: { gap: Spacing.three },
  field: { gap: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    minHeight: 48,
    fontSize: 16,
    textAlign: 'auto',
  },
  action: {
    minHeight: 48,
    justifyContent: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  routeLink: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
  },
});
