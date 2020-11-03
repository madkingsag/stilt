import { makeControllerInjector } from './controllerInjectors';
import { StiltHttp } from './stilt-http';

const WithContext = makeControllerInjector({
  dependencies: [StiltHttp],
  run(_config, [stiltHttp]: [StiltHttp]) {
    return { context: stiltHttp.getCurrentContext() };
  },
});

export { WithContext };
