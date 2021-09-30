import { makeControllerInjector } from './controllerInjectors.js';
import { StiltHttp } from './stilt-http.js';

const WithContext = makeControllerInjector({
  dependencies: [StiltHttp],
  run(_config, [stiltHttp]: [StiltHttp]) {
    return { context: stiltHttp.getCurrentContext() };
  },
});

export { WithContext };
