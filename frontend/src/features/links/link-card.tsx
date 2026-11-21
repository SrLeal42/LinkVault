import type * as React from 'react';
import {
  EditIcon,
  ExternalLinkIcon,
  FolderIcon,
  LockIcon,
  TrashIcon,
} from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import {
  extractUrlHostname,
  formatEditorialDate,
  type LinkResponse,
  type LinkSortOption,
} from './links-api';
import styles from './link-card.module.css';

export interface LinkCardProps {
  link: LinkResponse;
  collectionName?: string | null;
  activeTag?: string;
  activeCollectionId?: string;
  sort?: LinkSortOption;
  onSelectTag?: (tagName: string) => void;
  onSelectCollection?: (collectionId: string) => void;
  onEdit?: (link: LinkResponse) => void;
  onDelete?: (link: LinkResponse) => void;
}

export function LinkCard({
  link,
  collectionName,
  activeTag = '',
  activeCollectionId = '',
  sort = 'created_desc',
  onSelectTag,
  onSelectCollection,
  onEdit,
  onDelete,
}: LinkCardProps): React.JSX.Element {
  const hostname = extractUrlHostname(link.url);
  const isUpdatedSort = sort === 'updated_desc';
  const relevantTimestamp = isUpdatedSort ? link.updated_at : link.created_at;
  const formattedDate = formatEditorialDate(relevantTimestamp);
  const datePrefix = isUpdatedSort ? 'ATUALIZADO ' : '';
  
  const hasCollection = Boolean(link.collection_id && collectionName);
  const hasTaxonomy = hasCollection || link.tags.length > 0;

  const isCollectionActive = Boolean(
    link.collection_id && activeCollectionId && activeCollectionId === link.collection_id,
  );
  const normalizedActiveTag = activeTag.trim().toLowerCase();

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <div className={styles.metaRow}>
            <span className={styles.domain}>{hostname}</span>
            {formattedDate && (
              <>
                <span className={styles.metaSeparator} aria-hidden="true">
                  ·
                </span>
                <time dateTime={relevantTimestamp} className={styles.date}>
                  {datePrefix}
                  {formattedDate}
                </time>
              </>
            )}
          </div>

          <h3 className={styles.title}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.titleLink}
            >
              <span>{link.title}</span>
              <ExternalLinkIcon size={14} className={styles.externalIcon} />
            </a>
          </h3>
        </div>

        <div className={styles.actions}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<EditIcon size={14} />}
            aria-label={`Editar ${link.title}`}
            onClick={() => {
              onEdit?.(link);
            }}
          >
            Editar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<TrashIcon size={14} />}
            aria-label={`Excluir ${link.title}`}
            onClick={() => {
              onDelete?.(link);
            }}
          >
            Excluir
          </Button>
        </div>
      </div>

      {link.description && <p className={styles.description}>{link.description}</p>}

      {link.notes && (
        <div className={styles.privateNote}>
          <span className={styles.privateNoteLabel}>
            <LockIcon size={12} />
            <span>Nota privada</span>
          </span>
          <p className={styles.privateNoteText}>{link.notes}</p>
        </div>
      )}

      {hasTaxonomy && (
        <div className={styles.taxonomyRow}>
          {hasCollection && link.collection_id && collectionName && (
            <button
              type="button"
              className={[
                styles.collectionBadge,
                isCollectionActive ? styles.collectionBadgeActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={isCollectionActive}
              onClick={() => {
                onSelectCollection?.(link.collection_id ?? '');
              }}
            >
              <FolderIcon size={13} />
              <span>{collectionName}</span>
            </button>
          )}

          {link.tags.length > 0 && (
            <div className={styles.tagsList}>
              {link.tags.map((tag) => {
                const isTagActive =
                  normalizedActiveTag.length > 0 &&
                  normalizedActiveTag === tag.name.trim().toLowerCase();
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={[styles.tagPill, isTagActive ? styles.tagPillActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={isTagActive}
                    onClick={() => {
                      onSelectTag?.(tag.name);
                    }}
                  >
                    #{tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </article>
  );
}