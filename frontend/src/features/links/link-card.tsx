import type * as React from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  CheckIcon,
  ChevronsUpDownIcon,
  EditIcon,
  ExternalLinkIcon,
  FolderIcon,
  LockIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import {
  extractUrlHostname,
  formatEditorialDate,
  type CollectionResponse,
  type LinkResponse,
  type LinkSortOption,
} from './links-api';
import styles from './link-card.module.css';

export interface LinkCardProps {
  link: LinkResponse;
  collectionName?: string | null;
  collections?: readonly CollectionResponse[];
  isUpdatingCollection?: boolean;
  activeTag?: string;
  activeCollectionId?: string;
  sort?: LinkSortOption;
  onSelectTag?: (tagName: string) => void;
  onSelectCollection?: (collectionId: string) => void;
  onChangeCollection?: (link: LinkResponse, collectionId: string | null) => void;
  onEdit?: (link: LinkResponse) => void;
  onDelete?: (link: LinkResponse) => void;
}

export function LinkCard({
  link,
  collectionName,
  collections = [],
  isUpdatingCollection = false,
  activeTag = '',
  activeCollectionId = '',
  sort = 'created_desc',
  onSelectTag,
  onSelectCollection,
  onChangeCollection,
  onEdit,
  onDelete,
}: LinkCardProps): React.JSX.Element {
  const hostname = extractUrlHostname(link.url);
  const isUpdatedSort = sort === 'updated_desc';
  const relevantTimestamp = isUpdatedSort ? link.updated_at : link.created_at;
  const formattedDate = formatEditorialDate(relevantTimestamp);
  const datePrefix = isUpdatedSort ? 'ATUALIZADO ' : '';
  
  const hasCollection = Boolean(link.collection_id && collectionName);
  const hasTaxonomy = hasCollection || Boolean(onChangeCollection) || link.tags.length > 0;

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
          {(hasCollection || onChangeCollection) && (
            <div className={styles.collectionControlGroup}>
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

              {onChangeCollection && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className={
                        hasCollection
                          ? styles.collectionSwitchTrigger
                          : styles.collectionAssignTrigger
                      }
                      aria-label={`Alterar coleção de ${link.title}`}
                      disabled={isUpdatingCollection}
                    >
                      {hasCollection ? (
                        <ChevronsUpDownIcon size={13} />
                      ) : (
                        <>
                          <PlusIcon size={12} />
                          <FolderIcon size={13} />
                          <span>Coleção</span>
                        </>
                      )}
                    </button>
                  </DropdownMenu.Trigger>

                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className={styles.collectionMenuContent}
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      collisionPadding={12}
                    >
                      <DropdownMenu.Label className={styles.collectionMenuLabel}>
                        Coleção da referência
                      </DropdownMenu.Label>

                      <DropdownMenu.Item
                        className={styles.collectionMenuItem}
                        disabled={link.collection_id === null}
                        onSelect={() => {
                          if (link.collection_id !== null) {
                            onChangeCollection(link, null);
                          }
                        }}
                      >
                        <span className={styles.collectionMenuItemText}>Sem coleção</span>
                        {link.collection_id === null && <CheckIcon size={14} />}
                      </DropdownMenu.Item>

                      <DropdownMenu.Separator className={styles.collectionMenuSeparator} />

                      {collections.length === 0 ? (
                        <div className={styles.collectionMenuEmpty}>Nenhuma coleção criada</div>
                      ) : (
                        collections.map((col) => {
                          const isCurrent = col.id === link.collection_id;
                          return (
                            <DropdownMenu.Item
                              key={col.id}
                              className={styles.collectionMenuItem}
                              onSelect={() => {
                                if (!isCurrent) {
                                  onChangeCollection(link, col.id);
                                }
                              }}
                            >
                              <span className={styles.collectionMenuItemMain}>
                                <FolderIcon size={13} />
                                <span className={styles.collectionMenuItemText}>{col.name}</span>
                              </span>
                              {isCurrent && <CheckIcon size={14} />}
                            </DropdownMenu.Item>
                          );
                        })
                      )}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </div>
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