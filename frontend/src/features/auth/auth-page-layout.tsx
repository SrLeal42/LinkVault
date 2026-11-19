import { useId, useState } from 'react';
import type * as React from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { AlertCircleIcon } from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-context';
import {
  ROUTES,
  resolveSafeRedirectPath,
  useAuth,
  type RedirectLocationState,
} from './auth-context';
import { toParsedAuthError } from './auth-forms';
import styles from './auth-page-layout.module.css';

function extractForwardedRedirectState(locationState: unknown): RedirectLocationState | undefined {
  if (typeof locationState === 'object' && locationState !== null && 'from' in locationState) {
    const candidate = (locationState as { from?: unknown }).from;
    const safePath = resolveSafeRedirectPath(candidate, '');
    if (safePath !== '') {
      return { from: safePath };
    }
  }
  return undefined;
}

export interface AuthPageLayoutProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  bannerError?: string | null;
  alternatePrompt: string;
  alternateLabel: string;
  alternateTo: string;
  children: React.ReactNode;
}

export function AuthPageLayout({
  eyebrow,
  title,
  subtitle,
  bannerError,
  alternatePrompt,
  alternateLabel,
  alternateTo,
  children,
}: AuthPageLayoutProps): React.JSX.Element {
  const { isLoading: isAuthLoading, loginDemo } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const headingId = useId();
  const forwardedState = extractForwardedRedirectState(location.state);

  const [isStartingDemo, setIsStartingDemo] = useState(false);
  const [demoErrorMessage, setDemoErrorMessage] = useState<string | null>(null);

  const handleStartDemo = async (): Promise<void> => {
    if (isStartingDemo || isAuthLoading) {
      return;
    }

    setIsStartingDemo(true);
    setDemoErrorMessage(null);

    try {
      await loginDemo();
      toast({
        title: 'Sessão de demonstração iniciada.',
        description: 'Explore a biblioteca pré-populada com links, tags e coleções.',
        variant: 'success',
      });
      await navigate(ROUTES.LIBRARY, { replace: true });
    } catch (error: unknown) {
      const friendlyMessage = toParsedAuthError(error).userMessage;
      setDemoErrorMessage(friendlyMessage);
      toast({
        title: 'Não foi possível iniciar a demonstração',
        description: friendlyMessage,
        variant: 'error',
      });
    } finally {
      setIsStartingDemo(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link to={ROUTES.HOME} className={styles.brandLink}>
            <span className={styles.brandTitle}>LinkVault</span>
            <span className={styles.brandTag}>Arquivo Digital</span>
          </Link>

          <nav aria-label="Navegação auxiliar">
            <Link to={ROUTES.HOME} className={styles.backLink}>
              Voltar ao início
            </Link>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.card} aria-labelledby={headingId}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 id={headingId} className={styles.title}>
              {title}
            </h1>
            <p className={styles.subtitle}>{subtitle}</p>
          </header>

          {bannerError && (
            <div className={styles.errorBanner} role="alert">
              <AlertCircleIcon size={16} className={styles.errorBannerIcon} />
              <span>{bannerError}</span>
            </div>
          )}

          <div className={styles.body}>{children}</div>

          <footer className={styles.footer}>
            <p className={styles.alternateRow}>
              {alternatePrompt}{' '}
              <Link to={alternateTo} state={forwardedState} className={styles.alternateLink}>
                {alternateLabel}
              </Link>
            </p>

            <div className={styles.demoSection}>
              <div className={styles.demoHeader}>
                <span className={styles.demoLabel}>Acesso rápido sem cadastro</span>
                <span className={styles.demoTag}>DEMO · 24H</span>
              </div>
              <p className={styles.demoHint}>
                Inicie uma conta temporária isolada com links, tags e coleções de exemplo.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                fullWidth
                isLoading={isStartingDemo}
                loadingText="Preparando conta demo..."
                disabled={isAuthLoading}
                onClick={() => {
                  void handleStartDemo();
                }}
              >
                Entrar como demo
              </Button>

              {demoErrorMessage && (
                <div className={styles.errorBanner} role="alert">
                  <AlertCircleIcon size={16} className={styles.errorBannerIcon} />
                  <span>{demoErrorMessage}</span>
                </div>
              )}
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
