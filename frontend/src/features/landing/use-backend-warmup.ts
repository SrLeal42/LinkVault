import { useEffect, useState } from 'react';
import { apiClient } from '@/api/client';

export type WarmupStatus = 'warming' | 'ready' | 'retrying';

export interface UseBackendWarmupOptions {
  /** Tempo em ms antes de exibir o aviso de cold start (default: 3000) */
  coldStartThresholdMs?: number;
  /** Intervalo base em ms entre retentativas em segundo plano (default: 4000) */
  retryIntervalMs?: number;
  /** Número máximo de retentativas em segundo plano (default: 15) */
  maxRetries?: number;
}

export interface UseBackendWarmupResult {
  status: WarmupStatus;
  isReady: boolean;
  /** true quando o health check ainda não concluiu após coldStartThresholdMs */
  isColdStartSlow: boolean;
}

const rawEnvSlug = import.meta.env.VITE_DEMO_PUBLIC_SLUG?.trim() ?? '';

export const DEFAULT_PUBLIC_DEMO_SLUG =
  rawEnvSlug.length > 0 ? rawEnvSlug : 'arquitetura-web';

export function resolvePublicDemoCollectionPath(
  slug: string = DEFAULT_PUBLIC_DEMO_SLUG,
): string {
  return `/c/${encodeURIComponent(slug)}`;
}

export function useBackendWarmup(options: UseBackendWarmupOptions = {}): UseBackendWarmupResult {
  const {
    coldStartThresholdMs = 3000,
    retryIntervalMs = 4000,
    maxRetries = 15,
  } = options;

  const [status, setStatus] = useState<WarmupStatus>('warming');
  const [isColdStartSlow, setIsColdStartSlow] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    let retryTimerId: ReturnType<typeof setTimeout> | undefined;
    let currentController: AbortController | null = null;

    const slowTimerId = setTimeout(() => {
      if (isMounted) {
        setIsColdStartSlow(true);
      }
    }, coldStartThresholdMs);

    const pingHealth = async () => {
      const controller = new AbortController();
      currentController = controller;

      try {
        const { data, response } = await apiClient.GET('/api/health', {
          signal: controller.signal,
        });

        if (!isMounted) return;

        if (response.ok && data?.status === 'ok') {
          clearTimeout(slowTimerId);
          setStatus('ready');
          setIsColdStartSlow(false);
          return;
        }
      } catch {
        if (!isMounted || controller.signal.aborted) {
          return;
        }
      }

      if (retryCount < maxRetries) {
        retryCount += 1;
        setStatus('retrying');
        retryTimerId = setTimeout(() => {
          void pingHealth();
        }, retryIntervalMs);
      }
    };

    void pingHealth();

    return () => {
      isMounted = false;
      clearTimeout(slowTimerId);
      if (retryTimerId !== undefined) {
        clearTimeout(retryTimerId);
      }
      currentController?.abort();
    };
  }, [coldStartThresholdMs, maxRetries, retryIntervalMs]);

  return {
    status,
    isReady: status === 'ready',
    isColdStartSlow,
  };
}