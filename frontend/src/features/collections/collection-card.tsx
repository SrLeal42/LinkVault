import type * as React from 'react';
import { Link } from 'react-router';
import {
  ArrowRightIcon,
  EditIcon,
  GlobeIcon,
  LockIcon,
  TrashIcon,
} from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { formatEditorialDate } from '@/features/links/links-api';
import {
  buildCollectionDetailPath,
  formatCollectionLinkCount,
  type CollectionResponse,
} from './collections-api';
import styles from './collection-card.module.css';

export interface CollectionCardProps {
  collection: CollectionResponse;
  onEdit?: (collection: CollectionResponse) => void;
  onDelete?: (collection: CollectionResponse) => void;
}

export function CollectionCard({
  collection,
  onEdit,
  onDelete,
}: CollectionCardProps): React.JSX.Element {
  const detailPath = buildCollectionDetailPath(collection.id);
  const isPublic = collection.visibility === 'public';
  const formattedCount = formatCollectionLinkCount(collection.link_count);
  const formattedUpdated = formatEditorialDate(collection.updated_at);

  return (
    <article className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.metaGroup}>
          <span
            className={isPublic ? styles.visibilityBadgePublic : styles.visibilityBadgePrivate}
          >
            {isPublic ? <GlobeIcon size={13} /> : <LockIcon size={13} />}
            <span>{isPublic ? 'Pública' : 'Privada'}</span>
          </span>
          <span className={styles.metaSeparator} aria-hidden="true">
            ·
          </span>
          <span className={styles.linkCount}>{formattedCount}</span>
          {formattedUpdated && (
            <>
              <span className={styles.metaSeparator} aria-hidden="true">
                ·
              </span>
              <time dateTime={collection.updated_at} className={styles.date}>
                ATUALIZADA {formattedUpdated}
              </time>
            </>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>
          <Link to={detailPath} className={styles.titleLink}>
            {collection.name}
          </Link>
        </h3>
        {collection.description ? (
          <p className={styles.description}>{collection.description}</p>
        ) : (
          <p className={styles.descriptionMuted}>Sem descrição cadastrada.</p>
        )}
      </div>

      <div className={styles.footer}>
        <Link
          to={detailPath}
          className={styles.openAffordance}
          aria-label={`Abrir coleção ${collection.name}`}
        >
          <span>Abrir coleção</span>
          <ArrowRightIcon size={15} className={styles.openIcon} />
        </Link>

        <div className={styles.adminActions}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<EditIcon size={14} />}
            aria-label={`Editar coleção ${collection.name}`}
            onClick={() => {
              onEdit?.(collection);
            }}
          >
            Editar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<TrashIcon size={14} />}
            aria-label={`Excluir coleção ${collection.name}`}
            onClick={() => {
              onDelete?.(collection);
            }}
          >
            Excluir
          </Button>
        </div>
      </div>
    </article>
  );
}