// @flow

import ContextProvider, { IContextProvider } from './ContextProvider';
import { makeControllerInjector } from './controllerInjectors';

export const WithContext = makeControllerInjector({
  dependencies: { contextProvider: IContextProvider },
  run(ignore, { contextProvider }: { contextProvider: ContextProvider }) {
    return { context: contextProvider.getCurrentContext() };
  },
});

export { WithContext as withContext };
