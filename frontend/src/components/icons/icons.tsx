import type * as React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  title?: string;
}

interface BaseSvgIconProps extends IconProps {
  children: React.ReactNode;
}

function SvgIcon({
  size = 18,
  title,
  children,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-hidden': ariaHidden,
  role,
  ...rest
}: BaseSvgIconProps): React.JSX.Element {
  const hasAccessibleName =
    Boolean(title) || Boolean(ariaLabel) || Boolean(ariaLabelledBy);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-hidden={ariaHidden ?? (hasAccessibleName ? undefined : true)}
      role={role ?? (hasAccessibleName ? 'img' : undefined)}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function ExternalLinkIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </SvgIcon>
  );
}

export function ArrowRightIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </SvgIcon>
  );
}

export function PlusIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

export function EditIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M12 20h9" />
      <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
    </SvgIcon>
  );
}

export function TrashIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </SvgIcon>
  );
}

export function SearchIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </SvgIcon>
  );
}

export function CloseIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </SvgIcon>
  );
}

export function GlobeIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </SvgIcon>
  );
}

export function LockIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </SvgIcon>
  );
}

export function CopyIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </SvgIcon>
  );
}

export function CheckIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </SvgIcon>
  );
}

export function AlertCircleIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </SvgIcon>
  );
}

export function FolderIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </SvgIcon>
  );
}

export function TagIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </SvgIcon>
  );
}

export function LogOutIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </SvgIcon>
  );
}

export function KeyIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
      <path d="m21 2-9.6 9.6" />
      <circle cx="7.5" cy="15.5" r="5.5" />
    </SvgIcon>
  );
}

export function SpinnerIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon data-lv-spinner="true" {...props}>
      <circle cx="12" cy="12" r="9" opacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </SvgIcon>
  );
}