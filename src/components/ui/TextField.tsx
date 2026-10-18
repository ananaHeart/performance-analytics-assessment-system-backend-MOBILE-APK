import React, {forwardRef, useState} from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {Eye, EyeOff} from 'lucide-react-native';

import {theme} from '../../theme/tokens';
import {IconButton} from './IconButton';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label?: string;
  error?: string | null;
  /** Hides the text and adds a show/hide eye button. */
  password?: boolean;
  /** Rendered inside the field, before the text (e.g. a search icon). */
  leading?: React.ReactNode;
  /** Rendered inside the field, after the text (e.g. a clear button). */
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(({
  label,
  error,
  password = false,
  leading,
  trailing,
  containerStyle,
  onFocus,
  onBlur,
  editable = true,
  accessibilityLabel,
  ...inputProps
}, ref) => {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
          !editable && styles.fieldDisabled,
          leading ? styles.withLeading : null,
          password || trailing ? styles.withTrailing : null,
        ]}
      >
        {leading}
        <TextInput
          ref={ref}
          {...inputProps}
          editable={editable}
          accessibilityLabel={accessibilityLabel ?? label}
          secureTextEntry={password ? !revealed : inputProps.secureTextEntry}
          placeholderTextColor={theme.colors.placeholder}
          style={[styles.input, !editable && styles.inputDisabled]}
          onFocus={event => { setFocused(true); onFocus?.(event); }}
          onBlur={event => { setFocused(false); onBlur?.(event); }}
        />
        {password ? (
          <IconButton
            icon={revealed ? EyeOff : Eye}
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed(value => !value)}
            color={theme.colors.muted}
          />
        ) : null}
        {trailing}
      </View>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
});

TextField.displayName = 'TextField';

const styles = StyleSheet.create({
  label: {...theme.type.label, color: theme.colors.textSecondary, marginBottom: 6},
  field: {
    minHeight: theme.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.spacing.md,
  },
  // 2px focus ring; the padding shrinks by the same 1px so text doesn't move.
  fieldFocused: {borderWidth: 2, borderColor: theme.colors.primary, paddingHorizontal: theme.spacing.md - 1},
  fieldError: {borderColor: theme.status.danger.text},
  fieldDisabled: {backgroundColor: theme.colors.surfaceSunken},
  withLeading: {gap: theme.spacing.sm},
  withTrailing: {paddingRight: 0},
  input: {
    flex: 1,
    minHeight: theme.touchTarget - 2,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: 0,
    fontSize: theme.type.body.fontSize,
    color: theme.colors.text,
  },
  inputDisabled: {color: theme.colors.muted},
  error: {...theme.type.caption, color: theme.status.danger.text, marginTop: theme.spacing.xs},
});
