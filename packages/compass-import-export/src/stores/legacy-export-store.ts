import type AppRegistry from 'hadron-app-registry';
import { createStore, applyMiddleware } from 'redux';
import type { Store, AnyAction } from 'redux';
import thunk from 'redux-thunk';
import type { DataService } from 'mongodb-data-service';

import reducer from '../modules';
import {
  dataServiceConnected,
  globalAppRegistryActivated,
} from '../modules/compass';
import { openExport } from '../modules/legacy-export';

const _store = createStore(reducer, applyMiddleware(thunk));

type StoreActions<T> = T extends Store<unknown, infer A> ? A : never;

type StoreState<T> = T extends Store<infer S, AnyAction> ? S : never;

export type RootExportActions = StoreActions<typeof _store>;

export type RootExportState = StoreState<typeof _store>;

const store = Object.assign(_store, {
  onActivated(globalAppRegistry: AppRegistry) {
    store.dispatch(globalAppRegistryActivated(globalAppRegistry));

    globalAppRegistry.on(
      'data-service-connected',
      (err: Error | undefined, dataService: DataService) => {
        store.dispatch(dataServiceConnected(err, dataService));
      }
    );

    globalAppRegistry.on(
      'open-export',
      ({ namespace, query, count, aggregation }) => {
        // TODO: Once we update our redux usage to use `configureStore` from `@reduxjs/toolkit`
        // we should be able to remove this type cast as the thunk action will
        // be properly accepted in the store dispatch typing.
        store.dispatch(
          openExport({
            namespace,
            query,
            count,
            aggregation,
          }) as unknown as AnyAction
        );
      }
    );
  },
});

export default store;
