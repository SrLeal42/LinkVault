import { useState } from 'react';
import type * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseApiError } from '@/api/errors';
import { AlertCircleIcon, FolderIcon, PlusIcon } from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirmdialog';
import { EmptyState } from '@/components/ui/emptystate';
import { useToast } from '@/components/ui/toast-context';
import { CollectionCard } from '@/features/collections/collection-card';
import { CollectionFormDialog } from '@/features/collections/collection-form-dialog';
import {
  COLLECTIONS_LIST_QUERY_KEY,
  COLLECTIONS_QUERY_KEY_PREFIX,
  deleteCollection,
  fetchUserCollections,
  type CollectionResponse,
} from '@/features/collections/collections-api';
import { LINKS_QUERY_KEY_PREFIX } from '@/features/links/links-api';
import styles from './collections-page.module.css';

export function CollectionsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionResponse | null>(null);
  const [deletingCollection, setDeletingCollection] = useState<CollectionResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const collectionsQuery = useQuery({
    queryKey: COLLECTIONS_LIST_QUERY_KEY,
    queryFn: ({ signal }) => fetchUserCollections(signal),
  });

  const collections = collectionsQuery.data ?? [];

  const invalidateCollectionsAndLinks = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY_PREFIX }),
      queryClient.invalidateQueries({ queryKey: LINKS_QUERY_KEY_PREFIX }),
    ]);
  };

  const handleCollectionSaved = (
    _savedCollection: CollectionResponse,
    mode: 'create' | 'update',
  ): void => {
    void invalidateCollectionsAndLinks();
    toast({
      title:
        mode === 'create'
          ? 'Coleção criada com sucesso.'
          : 'Coleção atualizada com sucesso.',
      variant: 'success',
    });
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deletingCollection || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteCollection(deletingCollection.id);
      setDeletingCollection(null);
      await invalidateCollectionsAndLinks();
      toast({
        title: 'Coleção excluída.',
        description: 'Os links antes vinculados permanecem salvos na sua biblioteca.',
        variant: 'default',
      });
    } catch (error: unknown) {
      toast({
        title: 'Não foi possível excluir a coleção.',
        description: parseApiError(error).userMessage,
        variant: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const errorMessage = collectionsQuery.isError
    ? parseApiError(collectionsQuery.error).userMessage
    : null;
  const totalCountLabel =
    collections.length === 1
      ? '01 COLEÇÃO'
      : `${String(collections.length).padStart(2, '0')} COLEÇÕES`;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>ACERVO ORGANIZADO</p>
          <h2 className={styles.pageTitle}>Minhas Coleções</h2>
          <p className={styles.pageSubtitle}>
            Agrupe suas referências por tema ou projeto. Novas coleções nascem privadas por padrão.
          </p>
        </div>

        <Button
          type="button"
          variant="primary"
          leftIcon={<PlusIcon size={16} />}
          onClick={() => {
            setIsCreateDialogOpen(true);
          }}
        >
          Nova coleção
        </Button>
      </header>

      {collectionsQuery.isPending ? (
        <div
          className={styles.skeletonGrid}
          aria-busy="true"
          aria-label="Carregando coleções"
        >
          <p className={styles.skeletonStatusText}>Carregando coleções...</p>
          <div className={styles.skeletonCards}>
            {[0, 1, 2].map((index) => (
              <div key={index} className={styles.skeletonCard} aria-hidden="true">
                <div className={styles.skeletonLineShort} />
                <div className={styles.skeletonLineTitle} />
                <div className={styles.skeletonLineBody} />
              </div>
            ))}
          </div>
        </div>
      ) : collectionsQuery.isError ? (
        <div className={styles.errorBox} role="alert">
          <div className={styles.errorHeader}>
            <AlertCircleIcon size={16} className={styles.errorIcon} />
            <span>{errorMessage ?? 'Não foi possível carregar as coleções.'}</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void collectionsQuery.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : collections.length === 0 ? (
        <EmptyState
          eyebrow="COLEÇÕES"
          title="Você ainda não criou nenhuma coleção."
          description="Agrupe links por tema, tecnologia ou projeto para consultá-los em um catálogo organizado."
          icon={<FolderIcon size={18} />}
          action={
            <Button
              type="button"
              variant="primary"
              leftIcon={<PlusIcon size={16} />}
              onClick={() => {
                setIsCreateDialogOpen(true);
              }}
            >
              Criar coleção
            </Button>
          }
        />
      ) : (
        <>
          <ul className={styles.collectionsGrid}>
            {collections.map((collection) => (
              <li key={collection.id} className={styles.collectionItem}>
                <CollectionCard
                  collection={collection}
                  onEdit={(target) => {
                    setEditingCollection(target);
                  }}
                  onDelete={(target) => {
                    setDeletingCollection(target);
                  }}
                />
              </li>
            ))}
          </ul>

          <footer className={styles.listFooter}>
            <p className={styles.countReadout}>TOTAL DE {totalCountLabel}</p>
          </footer>
        </>
      )}

      <CollectionFormDialog
        open={isCreateDialogOpen || editingCollection !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsCreateDialogOpen(false);
            setEditingCollection(null);
          }
        }}
        collection={editingCollection}
        onSuccess={handleCollectionSaved}
      />

      <ConfirmDialog
        open={deletingCollection !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeletingCollection(null);
          }
        }}
        title="Excluir coleção?"
        description={
          deletingCollection
            ? `Tem certeza de que deseja excluir a coleção "${deletingCollection.name}"?`
            : 'Tem certeza de que deseja excluir esta coleção?'
        }
        consequence="Os links associados não serão apagados; eles permanecerão salvos na sua biblioteca como itens sem coleção."
        confirmLabel="Excluir coleção"
        tone="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}