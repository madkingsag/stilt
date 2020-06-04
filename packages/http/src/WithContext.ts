import ContextProvider, { IContextProvider } from './ContextProvider';
import { makeControllerInjector } from './controllerInjectors';

export const WithContext = makeControllerInjector({
  dependencies: [IContextProvider],
  run(_config, [contextProvider]: [ContextProvider]) {
    return { context: contextProvider.getCurrentContext() };
  },
});

export { WithContext as withContext };
