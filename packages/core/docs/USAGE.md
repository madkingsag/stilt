# @stilt/core

*Stilt Framework Conductor*

## Installing Stilt Core

`@stilt/core` on its own does not do much. You need to attach plugins to it.

The simplest way to use Stilt core is to instantiate it directly, and apply plugins to it using `.use`

```javascript
// bootstrap.js
import { App } from '@stilt/core';
import { StiltHttp } from '@stilt/http';
import { StiltRest } from '@stilt/rest';

async function bootstrap() {
    const app = new App({ logLevel: 'info' });

    // install all necessary plugins here.

    // enable HTTP server
    app.use(StiltHttp.configure({ port: 8080 }));

    // enable REST endpoints on server
    app.use(StiltRest.configure({}));

    await app.start();

    return app;
}

bootstrap();
```

## Using dependency injection

If you wish to use dependency injection to access a given module (eg. config module) while you are still bootstrapping your App,
you can use the built-in dependency injection mechanism:

```javascript
// App.js

// @flow

import Stilt, { Inject } from '@stilt/core';
import StiltHttp from '@stilt/http';
import StiltRest from '@stilt/rest';

@Inject({
    config: Config,
    stiltApp: Stilt,
})
export default class App {

    constructor({ stiltApp, config }) {
        this.config = config;
        this.stiltApp = stiltApp;

        // enable HTTP server
        stiltApp.use(new StiltHttp({ port: config.port }));

        // enable REST endpoints on server
        stiltApp.use(new StiltRest());
    }

    start() {
        return this.stiltApp.start();
    }
}

async function bootstrap() {
    // pass bootstrapping module to createApp:
    // note: in this case `app` is an instance of App, not Stilt!
    // if you need to access the stilt instance, create a getter on your App class.
    const app: App = await Stilt.createApp(App, { logLevel: 'info' });
    await app.start();

    return app;
}

bootstrap();
```
