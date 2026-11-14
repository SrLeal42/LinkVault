import type * as React from 'react';

import { SpinnerIcon } from '@/components/icons/icons';

import styles from './button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: styles.buttonPrimary ?? '',
  secondary: styles.buttonSecondary ?? '',
  ghost: styles.buttonGhost ?? '',
  danger: styles.buttonDanger ?? '',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: styles.buttonSm ?? '',
  md: styles.buttonMd ?? '',
  lg: styles.buttonLg ?? '',
};

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  isLoading = false,
  loadingText,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className,
  children,
  ref,
  ...rest
}: ButtonProps): React.JSX.Element {
  const isDisabled = Boolean(disabled) || isLoading;
  const classes = [
    styles.button,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? styles.buttonFullWidth : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-busy={isLoading ? true : undefined}
      data-loading={isLoading ? 'true' : undefined}
      {...rest}
    >
      {isLoading ? (
        <span className={styles.icon}>
          <SpinnerIcon size={size === 'sm' ? 14 : 16} />
        </span>
      ) : (
        leftIcon && <span className={styles.icon}>{leftIcon}</span>
      )}
      <span className={styles.label}>{isLoading ? (loadingText ?? children) : children}</span>
      {!isLoading && rightIcon && <span className={styles.icon}>{rightIcon}</span>}
    </button>
  );
}