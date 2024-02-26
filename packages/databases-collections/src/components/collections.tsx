import React, { useCallback } from 'react';
import { connect } from 'react-redux';
import { CollectionsList } from '@mongodb-js/databases-collections-list';
import {
  Banner,
  BannerVariant,
  css,
  spacing,
} from '@mongodb-js/compass-components';
import { useTrackOnChange } from '@mongodb-js/compass-logging/provider';
import {
  refreshCollections,
  type CollectionsState,
  deleteCollection,
  createNewCollection,
} from '../modules/collections';
import type Collection from 'mongodb-collection-model';
import toNS from 'mongodb-ns';
import { useOpenWorkspace } from '@mongodb-js/compass-workspaces/provider';

const ERROR_WARNING = 'An error occurred while loading collections';

const collectionsErrorStyles = css({
  padding: spacing[3],
});

type CollectionsListProps = {
  namespace: string;
  collections: ReturnType<Collection['toJSON']>[];
  collectionsLoadingStatus: string;
  collectionsLoadingError?: string | null;
  isEditable: boolean;
  onDeleteCollectionClick(ns: string): void;
  onCreateCollectionClick(dbName: string): void;
  onRefreshClick(): void;
};

const Collections: React.FunctionComponent<CollectionsListProps> = ({
  namespace,
  collections,
  collectionsLoadingStatus,
  collectionsLoadingError,
  isEditable,
  onDeleteCollectionClick,
  onCreateCollectionClick: _onCreateCollectionClick,
  onRefreshClick,
}) => {
  const { openCollectionWorkspace } = useOpenWorkspace();

  useTrackOnChange(
    'COMPASS-COLLECTIONS-UI',
    (track) => {
      track('Screen', { name: 'collections' });
    },
    []
  );

  const onCreateCollectionClick = useCallback(() => {
    _onCreateCollectionClick(toNS(namespace).database);
  }, [namespace, _onCreateCollectionClick]);

  const onCollectionClick = useCallback(
    (id: string) => {
      const sourceName = collections.find((c) => c._id === id)?.source?._id;
      openCollectionWorkspace(id, { sourceName });
    },
    [collections, openCollectionWorkspace]
  );

  if (collectionsLoadingStatus === 'error') {
    return (
      <div className={collectionsErrorStyles}>
        <Banner variant={BannerVariant.Danger}>
          {collectionsLoadingError
            ? `${ERROR_WARNING}: ${collectionsLoadingError}`
            : ERROR_WARNING}
        </Banner>
      </div>
    );
  }

  const actions = Object.assign(
    { onCollectionClick, onRefreshClick },
    isEditable ? { onDeleteCollectionClick, onCreateCollectionClick } : {}
  );

  return <CollectionsList collections={collections} {...actions} />;
};

const ConnectedCollections = connect(
  (state: CollectionsState, { namespace }: { namespace: string }) => {
    const isEditable = state.instance.isWritable && !state.instance.isDataLake;
    return {
      namespace,
      collections: state.collections,
      collectionsLoadingStatus: state.collectionsLoadingStatus.status,
      collectionsLoadingError: state.collectionsLoadingStatus.error,
      isEditable,
    };
  },
  {
    onRefreshClick: refreshCollections,
    onDeleteCollectionClick: deleteCollection,
    onCreateCollectionClick: createNewCollection,
  }
)(Collections);

export default ConnectedCollections;
export { Collections };
