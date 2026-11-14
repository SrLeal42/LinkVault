import { createContext, useContext, useMemo } from 'react';
import type * as React from 'react';

import { AlertCircleIcon } from '@/components/icons/icons';

import styles from './formfield.module.css';

interface FormFieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

export interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optionalLabel?: string;
  children: React.ReactNode;
  className?: string;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
  ref?: React.Ref<HTMLTextAreaElement>;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
  ref?: React.Ref<HTMLSelectElement>;
}

function mergeDescribedBy(
  contextDescribedBy: string | undefined,
  propDescribedBy: string | undefined,
): string | undefined {
  const tokens = [contextDescribedBy, propDescribedBy]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.trim().split(/\s+/))
    .filter(Boolean);
  if (tokens.length === 0) {
    return undefined;
  }
  return Array.from(new Set(tokens)).join(' ');
}

function resolveAriaInvalid(
  hasError: boolean | undefined,
  propAriaInvalid: React.AriaAttributes['aria-invalid'],
  fieldInvalid: boolean | undefined,
): { isInvalid: boolean; ariaInvalid: React.AriaAttributes['aria-invalid'] } {
  const isInvalid =
    hasError ??
    (propAriaInvalid !== undefined
      ? propAriaInvalid === true || propAriaInvalid === 'true'
      : Boolean(fieldInvalid));
  return {
    isInvalid,
    ariaInvalid: propAriaInvalid ?? (isInvalid ? true : undefined),
  };
}

export function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  optionalLabel,
  children,
  className,
}: FormFieldProps): React.JSX.Element {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const describedBy = useMemo(() => {
    const joined = [hintId, errorId].filter((part): part is string => Boolean(part)).join(' ');
    return joined !== '' ? joined : undefined;
  }, [hintId, errorId]);

  const contextValue = useMemo<FormFieldContextValue>(
    () => ({
      id,
      describedBy,
      invalid: Boolean(error),
    }),
    [id, describedBy, error],
  );

  return (
    <FormFieldContext.Provider value={contextValue}>
      <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
        <div className={styles.labelRow}>
          <label htmlFor={id} className={styles.label}>
            {label}
            {required && (
              <span className={styles.requiredMark} aria-hidden="true">
                {' '}
                *
              </span>
            )}
          </label>
          {!required && optionalLabel && <span className={styles.optionalTag}>{optionalLabel}</span>}
        </div>

        {hint && (
          <p id={hintId} className={styles.hint}>
            {hint}
          </p>
        )}

        {children}

        {error && (
          <p id={errorId} className={styles.errorText} role="alert">
            <AlertCircleIcon size={14} className={styles.errorIcon} />
            <span>{error}</span>
          </p>
        )}
      </div>
    </FormFieldContext.Provider>
  );
}

export function Input({
  id,
  hasError,
  className,
  'aria-invalid': propAriaInvalid,
  'aria-describedby': propDescribedBy,
  ref,
  ...rest
}: InputProps): React.JSX.Element {
  const fieldContext = useContext(FormFieldContext);
  const { isInvalid, ariaInvalid } = resolveAriaInvalid(
    hasError,
    propAriaInvalid,
    fieldContext?.invalid,
  );
  const classes = [styles.control, isInvalid ? styles.controlError : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <input
      ref={ref}
      id={id ?? fieldContext?.id}
      className={classes}
      aria-invalid={ariaInvalid}
      aria-describedby={mergeDescribedBy(fieldContext?.describedBy, propDescribedBy)}
      {...rest}
    />
  );
}

export function Textarea({
  id,
  hasError,
  className,
  'aria-invalid': propAriaInvalid,
  'aria-describedby': propDescribedBy,
  ref,
  ...rest
}: TextareaProps): React.JSX.Element {
  const fieldContext = useContext(FormFieldContext);
  const { isInvalid, ariaInvalid } = resolveAriaInvalid(
    hasError,
    propAriaInvalid,
    fieldContext?.invalid,
  );
  const classes = [
    styles.control,
    styles.textarea,
    isInvalid ? styles.controlError : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <textarea
      ref={ref}
      id={id ?? fieldContext?.id}
      className={classes}
      aria-invalid={ariaInvalid}
      aria-describedby={mergeDescribedBy(fieldContext?.describedBy, propDescribedBy)}
      {...rest}
    />
  );
}

export function Select({
  id,
  hasError,
  className,
  'aria-invalid': propAriaInvalid,
  'aria-describedby': propDescribedBy,
  children,
  ref,
  ...rest
}: SelectProps): React.JSX.Element {
  const fieldContext = useContext(FormFieldContext);
  const { isInvalid, ariaInvalid } = resolveAriaInvalid(
    hasError,
    propAriaInvalid,
    fieldContext?.invalid,
  );
  const classes = [
    styles.control,
    styles.select,
    isInvalid ? styles.controlError : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <select
      ref={ref}
      id={id ?? fieldContext?.id}
      className={classes}
      aria-invalid={ariaInvalid}
      aria-describedby={mergeDescribedBy(fieldContext?.describedBy, propDescribedBy)}
      {...rest}
    >
      {children}
    </select>
  );
}