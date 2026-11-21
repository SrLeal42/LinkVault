import { useState } from 'react';
import type * as React from 'react';
import { DropdownMenu } from 'radix-ui';
import { Link, NavLink, Outlet } from 'react-router';
import {
  AlertCircleIcon,
  BookmarkIcon,
  ChevronsUpDownIcon,
  FolderIcon,
  KeyIcon,
  LogOutIcon,
  TagIcon,
} from '@/components/icons/icons';
import { useToast } from '@/components/ui/toast-context';
import { ROUTES, useAuth } from '@/features/auth/auth-context';
import { formatDemoExpiration } from '@/features/auth/auth-forms';
import { ChangePasswordDialog } from '@/features/auth/change-password-dialog';
import styles from './app-shell.module.css';

export interface AppShellProps {
  children?: React.ReactNode;
}

function buildNavLinkClass({ isActive }: { isActive: boolean }): string {
  return [styles.navLink, isActive ? styles.navLinkActive : ''].filter(Boolean).join(' ');
}

function resolveUserInitials(name: string, email: string | undefined): string {
  const cleanedName = name.trim();
  if (cleanedName.length > 0) {
    const parts = cleanedName.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
    const initials = `${first}${last}`.toUpperCase();
    if (initials.length > 0) {
      return initials;
    }
  }
  const emailPrefix = email?.trim().slice(0, 2).toUpperCase();
  return emailPrefix && emailPrefix.length > 0 ? emailPrefix : 'LV';
}

export function AppShell({ children }: AppShellProps = {}): React.JSX.Element {
  const { user, isDemo, logout } = useAuth();
  const { toast } = useToast();
  
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const trimmedName = user?.name?.trim() ?? '';
  const displayName = trimmedName.length > 0 ? trimmedName : 'Conta autenticada';
  const userInitials = resolveUserInitials(trimmedName, user?.email);
  const formattedExpiration = isDemo ? formatDemoExpiration(user?.expires_at) : null;
  
  const handleLogout = async (): Promise<void> => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    try {
      await logout({ redirectTo: ROUTES.HOME });
      toast({
        title: 'Sessão encerrada.',
        description: 'Você saiu da sua conta com segurança.',
        variant: 'default',
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Menu lateral">
        <div className={styles.sidebarTop}>
          <Link to={ROUTES.HOME} className={styles.brandLink}>
            <span className={styles.brandTitle}>LinkVault</span>
            <span className={styles.brandTag}>Arquivo Digital</span>
          </Link>

          <nav className={styles.navSection} aria-label="Navegação da biblioteca">
            <p className={styles.navLabel}>Acervo</p>
            <ul className={styles.navList}>
              <li>
                <NavLink to={ROUTES.LIBRARY} end className={buildNavLinkClass}>
                  <BookmarkIcon size={16} className={styles.navLinkIcon} />
                  <span>Biblioteca</span>
                </NavLink>
              </li>
              <li>
                <NavLink to={ROUTES.COLLECTIONS} className={buildNavLinkClass}>
                  <FolderIcon size={16} className={styles.navLinkIcon} />
                  <span>Coleções</span>
                </NavLink>
              </li>
              <li>
                <NavLink to={ROUTES.TAGS} end className={buildNavLinkClass}>
                  <TagIcon size={16} className={styles.navLinkIcon} />
                  <span>Tags</span>
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>

        <div className={styles.accountPanel}>
          {user && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={styles.accountTrigger}
                  aria-label={`Menu da conta de ${displayName}`}
                  disabled={isLoggingOut}
                >
                  <span className={styles.avatarBadge} aria-hidden="true">
                    {userInitials}
                  </span>
                  <span className={styles.userIdentity}>
                    <span className={styles.userNameRow}>
                      <span className={styles.userName}>{displayName}</span>
                      {isDemo && <span className={styles.demoPill}>DEMO</span>}
                    </span>
                    <span className={styles.userEmail} title={user.email}>
                      {user.email}
                    </span>
                  </span>
                  <ChevronsUpDownIcon size={15} className={styles.triggerChevron} />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className={styles.menuContent}
                  side="top"
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                >
                  <DropdownMenu.Item
                    className={styles.menuItem}
                    disabled={isDemo || isLoggingOut}
                    onSelect={() => {
                      setIsPasswordDialogOpen(true);
                    }}
                  >
                    <KeyIcon size={15} className={styles.menuItemIcon} />
                    <span className={styles.menuItemContent}>
                      <span className={styles.menuItemLabel}>Alterar senha</span>
                      {isDemo && (
                        <span className={styles.menuItemHint}>
                          Indisponível no modo demonstração.
                        </span>
                      )}
                    </span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className={styles.menuSeparator} />

                  <DropdownMenu.Item
                    className={[styles.menuItem, styles.menuItemDanger].join(' ')}
                    disabled={isLoggingOut}
                    onSelect={() => {
                      void handleLogout();
                    }}
                  >
                    <LogOutIcon size={15} className={styles.menuItemIcon} />
                    <span className={styles.menuItemLabel}>
                      {isLoggingOut ? 'Saindo...' : 'Sair'}
                    </span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </aside>

      <div className={styles.workspace}>
        {isDemo && (
          <div className={styles.demoBanner} role="status" aria-live="polite">
            <div className={styles.demoBannerInner}>
              <span className={styles.demoBannerTag}>
                <AlertCircleIcon size={14} />
                <span>
                  CONTA DEMO
                  {formattedExpiration ? ` · EXPIRA EM ${formattedExpiration}` : ''}
                </span>
              </span>
              <p className={styles.demoBannerText}>
                Ambiente temporário de demonstração. Coleções públicas e alteração de senha estão
                desativadas.
              </p>
            </div>
          </div>
        )}

        <main className={styles.mainContent}>{children ?? <Outlet />}</main>
      </div>

      {!isDemo && (
        <ChangePasswordDialog
          open={isPasswordDialogOpen}
          onOpenChange={setIsPasswordDialogOpen}
        />
      )}
    </div>
  );
}