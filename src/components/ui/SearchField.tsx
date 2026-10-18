import React from 'react';
import {type StyleProp, type ViewStyle} from 'react-native';
import {Search, X} from 'lucide-react-native';

import {theme} from '../../theme/tokens';
import {IconButton} from './IconButton';
import {TextField} from './TextField';

export interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export const SearchField = ({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  containerStyle,
}: SearchFieldProps): React.JSX.Element => (
  <TextField
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    accessibilityLabel={accessibilityLabel ?? placeholder}
    autoCapitalize="none"
    autoCorrect={false}
    returnKeyType="search"
    containerStyle={containerStyle}
    leading={<Search size={theme.iconSize.small} color={theme.colors.muted} strokeWidth={2.2} />}
    trailing={value ? (
      <IconButton icon={X} accessibilityLabel="Clear search" onPress={() => onChangeText('')} color={theme.colors.muted} />
    ) : null}
  />
);
