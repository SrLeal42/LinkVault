import type * as React from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { parseApiError } from '@/api/errors';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  FolderIcon,
  GlobeIcon,
  KeyIcon,
  LockIcon,
  SpinnerIcon,
  TagIcon,
} from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-context';
import { ROUTES, useAuth } from '@/features/auth/auth-context';
import {
  resolvePublicDemoCollectionPath,
  useBackendWarmup,
  type UseBackendWarmupOptions,
} from '@/features/landing/use-backend-warmup';
import styles from './landing-page.module.css';

export interface LandingPageProps {
  warmupOptions?: UseBackendWarmupOptions;
}

interface SampleLinkItem {
  title: string;
  domain: string;
  description: string;
  tags: readonly string[];
}

const SAMPLE_CURATION: readonly SampleLinkItem[] = [
  {
    title: 'Documentação FastAPI',
    domain: 'fastapi.tiangolo.com',
    description: 'Referência oficial para APIs assíncronas com validação OpenAPI em Python.',
    tags: ['backend', 'python', 'fastapi'],
  },
  {
    title: 'MDN Web Docs — HTTP & Fetch',
    domain: 'developer.mozilla.org',
    description: 'Especificação prática de cabeçalhos, cache, cookies HttpOnly e Fetch API.',
    tags: ['frontend', 'web'],
  },
  {
    title: 'OWASP Cheat Sheet Series',
    domain: 'cheatsheetseries.owasp.org',
    description: 'Boas práticas de proteção contra CSRF, SSRF e gerenciamento de sessão.',
    tags: ['seguranca', 'arquitetura'],
  },
];

function extractErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'userMessage' in error &&
    typeof error.userMessage === 'string' &&
    error.userMessage.trim().length > 0
  ) {
    return error.userMessage;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return parseApiError(error).userMessage;
}

export function LandingPage({ warmupOptions }: LandingPageProps = {}): React.JSX.Element {
  const { user, isAuthenticated, isDemo, isLoading: isAuthLoading, loginDemo } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isColdStartSlow } = useBackendWarmup(warmupOptions);

  const [isStartingDemo, setIsStartingDemo] = useState(false);
  const [demoErrorMessage, setDemoErrorMessage] = useState<string | null>(null);

  const publicPreviewPath = resolvePublicDemoCollectionPath();
  const trimmedName = user?.name?.trim();
  const sessionDisplayName = trimmedName && trimmedName.length > 0 ? trimmedName : user?.email;

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
      await navigate(ROUTES.LIBRARY);
    } catch (error: unknown) {
      const friendlyMessage = extractErrorMessage(error);
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
          <div className={styles.brandMark}>
            <h1 className={styles.brandTitle}>LinkVault</h1>
            <span className={styles.brandTag}>Arquivo Digital</span>
          </div>

          <nav className={styles.topbarNav} aria-label="Navegação principal">
            {isAuthenticated && user ? (
              <>
                <span className={styles.sessionBadge}>
                  {sessionDisplayName}
                  {isDemo ? ' · DEMO 24H' : ''}
                </span>
                <Link to={ROUTES.LIBRARY} className={styles.linkButtonPrimary}>
                  <span>Acessar minha biblioteca</span>
                  <ArrowRightIcon size={16} />
                </Link>
              </>
            ) : (
              <>
                <Link to={ROUTES.LOGIN} className={styles.linkButtonGhost}>
                  Entrar
                </Link>
                <Link to={ROUTES.REGISTER} className={styles.linkButtonPrimary}>
                  Começar agora
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {isColdStartSlow && (
        <div className={styles.coldStartBanner} role="status" aria-live="polite">
          <div className={styles.coldStartInner}>
            <SpinnerIcon size={16} className={styles.coldStartSpinner} />
            <span>
              Estamos iniciando o servidor de demonstração. Em hospedagem gratuita, a primeira
              conexão pode levar até um minuto — você já pode explorar a página enquanto preparamos
              o ambiente.
            </span>
          </div>
        </div>
      )}

      <main className={styles.main}>
        <div className={styles.heroGrid}>
          <section className={styles.heroCopyColumn} aria-labelledby="landing-headline">
            <p className={styles.eyebrow}>CURADORIA PESSOAL · PRIVADO POR PADRÃO</p>
            <h2 id="landing-headline" className={styles.headline}>
              Seu arquivo pessoal de referências técnicas na web.
            </h2>
            <p className={styles.lead}>
              Salve links de estudo e documentação com contexto, organize tudo por coleções e tags
              e publique apenas as listas que decidir compartilhar — sem ruído, sem algoritmo e sem
              expor suas notas privadas.
            </p>

            {isAuthenticated ? (
              <div className={styles.ctaGroup}>
                <Link to={ROUTES.LIBRARY} className={styles.linkButtonPrimary}>
                  <span>Acessar minha biblioteca</span>
                  <ArrowRightIcon size={16} />
                </Link>
                <Link to={ROUTES.COLLECTIONS} className={styles.linkButtonSecondary}>
                  <FolderIcon size={16} />
                  <span>Gerenciar coleções</span>
                </Link>
              </div>
            ) : (
              <div className={styles.ctaGroup}>
                <Link to={ROUTES.REGISTER} className={styles.linkButtonPrimary}>
                  <span>Começar agora</span>
                  <ArrowRightIcon size={16} />
                </Link>
                <Link to={ROUTES.LOGIN} className={styles.linkButtonSecondary}>
                  <KeyIcon size={16} />
                  <span>Entrar</span>
                </Link>
              </div>
            )}

            <section className={styles.demoBox} aria-labelledby="demo-box-title">
              <div className={styles.demoHeader}>
                <h3 id="demo-box-title" className={styles.demoTitle}>
                  Experimente sem cadastro
                </h3>
                <span className={styles.demoMeta}>ISOLADA · EXPIRA EM 24H</span>
              </div>
              <p className={styles.demoDescription}>
                Crie uma conta temporária pré-populada com links reais, tags e coleções para
                testar busca, filtros e compartilhamento público no seu próprio espaço isolado.
              </p>

              <div className={styles.demoActions}>
                <Button
                  variant="secondary"
                  isLoading={isStartingDemo}
                  loadingText="Preparando conta demo..."
                  disabled={isAuthLoading}
                  onClick={() => {
                    void handleStartDemo();
                  }}
                >
                  Entrar como demo
                </Button>
                <Link to={publicPreviewPath} className={styles.linkButtonGhost}>
                  <span>Ver exemplo público</span>
                  <ExternalLinkIcon size={15} />
                </Link>
              </div>

              {demoErrorMessage && (
                <div className={styles.demoError} role="alert">
                  <AlertCircleIcon size={16} className={styles.demoErrorIcon} />
                  <span>{demoErrorMessage}</span>
                </div>
              )}
            </section>
          </section>

          <aside className={styles.previewPanel} aria-labelledby="preview-panel-title">
            <div className={styles.previewHeader}>
              <p className={styles.previewEyebrow}>PRÉVIA DO COMPARTILHAMENTO PÚBLICO</p>
              <h2 id="preview-panel-title" className={styles.previewTitle}>
                Arquitetura &amp; Web Moderna
              </h2>
              <p className={styles.previewSubtitle}>
                Quando você ativa o modo público de uma coleção, ela ganha uma URL dedicada somente
                leitura. O restante da biblioteca permanece privado.
              </p>

              <div className={styles.collectionBadges}>
                <span className={styles.visibilityBadgePublic}>
                  <GlobeIcon size={13} />
                  <span>Pública</span>
                </span>
                <span className={styles.visibilityBadgePrivate}>
                  <LockIcon size={13} />
                  <span>Segurança &amp; Auth · Privada</span>
                </span>
              </div>
            </div>

            <ul className={styles.sampleList}>
              {SAMPLE_CURATION.map((item) => (
                <li key={item.domain} className={styles.sampleItem}>
                  <p className={styles.sampleItemTitle}>{item.title}</p>
                  <span className={styles.sampleItemDomain}>{item.domain}</span>
                  <p className={styles.sampleItemDescription}>{item.description}</p>
                  <div className={styles.sampleTags}>
                    {item.tags.map((tag) => (
                      <span key={tag} className={styles.sampleTag}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            <p className={styles.privacyNote}>
              Notas pessoais privadas e coleções privadas nunca são incluídas nas respostas ou páginas
              públicas.
            </p>

            <div className={styles.previewFooter}>
              <span className={styles.slugReadout}>
                <TagIcon size={12} /> {publicPreviewPath}
              </span>
              <Link to={publicPreviewPath} className={styles.linkButtonSecondary}>
                <span>Abrir coleção pública</span>
                <ArrowRightIcon size={15} />
              </Link>
            </div>
          </aside>
        </div>

        <section className={styles.stepsSection} aria-labelledby="steps-heading">
          <h2 id="steps-heading" className={styles.sectionHeading}>
            Fluxo editorial em três etapas
          </h2>
          <div className={styles.stepsGrid}>
            <article className={styles.stepCard}>
              <span className={styles.stepIndex}>01</span>
              <h3 className={styles.stepTitle}>Salvar referências</h3>
              <p className={styles.stepText}>
                Guarde URLs com título, descrição opcional e notas pessoais privadas visíveis apenas
                na sua conta autenticada.
              </p>
            </article>
            <article className={styles.stepCard}>
              <span className={styles.stepIndex}>02</span>
              <h3 className={styles.stepTitle}>Organizar com precisão</h3>
              <p className={styles.stepText}>
                Combine coleções temáticas e tags normalizadas com busca em português e ordenação
                rápida.
              </p>
            </article>
            <article className={styles.stepCard}>
              <span className={styles.stepIndex}>03</span>
              <h3 className={styles.stepTitle}>Compartilhar sob demanda</h3>
              <p className={styles.stepText}>
                Torne uma coleção pública para gerar um link dedicado e revogue o acesso a qualquer
                momento com um clique.
              </p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}