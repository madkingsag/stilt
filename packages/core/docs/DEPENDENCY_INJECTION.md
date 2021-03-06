# @stilt/core

*Stilt Framework Conductor*

## Dependency Injection

Stilt Core comes with built-in dependency injection. Most plugins will provide injectables modules
which you can then inject in your controllers.

Modules will only be injected if the class requesting them is created by the Stilt Core dependency injection mechanism.
Classes that are loaded by one of Stilt's plugins, or are injected will be created using this mechanism.

### Injecting modules

In the following example, we're injecting a module provided by `@stilt/jwt-sessions` inside a `@stilt/rest` controller.

`UserRestController` will be loaded and instantiated by `@stilt/rest` automatically if that plugin is loaded.

```javascript
// user.rest.js

import { Inject } from '@stilt/core';
import { GET } from '@stilt/rest';
import UserModel from './user.model';

@Inject({
    // Access @stilt/jwt-sessions's session manager.
    sessionManager: 'jwt-sessions:session-manager',
})
export default class UserRestController {

    constructor({ sessionManager }) {
        this.sessionManager = sessionManager;
    }

    @GET('/me')
    getLoggedUser() {
        const session = this.sessionManager.getCurrentSession();

        return UserModel.findOne({
            where: { id: session.userId },
        });
    }
}
```

### Creating injectable modules

You can declare your own injectable modules by creating "Injectable Module declaration" files (by default any file ending with `.injectables.js`).
That file should export a default function that returns an Object where the keys are the name of the injectable modules, and the values are the modules themselves.

As an example, let's decouple the API part from the business logic.

```javascript
// user.service.js

import { Inject } from '@stilt/core';
import UserModel from './user.model';

@Inject({
    // Access @stilt/jwt-sessions's session manager.
    sessionManager: 'jwt-sessions:session-manager',
})
export default class UserService {

    constructor({ sessionManager }) {
        this.sessionManager = sessionManager;
    }

    getLoggedUser() {
        const session = this.sessionManager.getCurrentSession();

        return UserModel.findOne({
            where: { id: session.userId },
        });
    }
}
```

```javascript
// user.injectables.js

import UserService from './user.service';

export default function declareInjectables() {

    return {
        'user-service': UserService,
    };
}
```

```javascript
// user.rest.js

@Inject({
    // inject and instantiate user.service.js.
    userService: 'user-service',
})
export default class UserRestController {

    constructor({ userService }) {
        this.userService = userService;
    }

    @GET('/me')
    getLoggedUser() {
        return this.userService.getLoggedUser();
    }
}
```

Note: You can bypass `user.injectables.js` by injecting Classes directly:

```javascript
// user.rest.js

import UserService from './user.service';

@Inject({
    // inject and instantiate user.service.js.
    userService: UserService,
})
export default class UserRestController {

    constructor({ userService }) {
        this.userService = userService;
    }

    @GET('/me')
    getLoggedUser() {
        return this.userService.getLoggedUser();
    }
}
```

### Async Initialization of injectables

There are two ways to initialize injectables asynchronously:

1. Returning a promise resolving to the module, instead of the module:
    ```javascript
    // user.injectables.js

    import UserService from './user.service';

    export default function declareInjectables() {

        return {
            get 'user-service'() {
                return makeSomeAsyncOperation().then(() => UserService);
            },
        };
    }
    ```

2. Tagging a static method of the injectable class with `@AsyncModuleInit`, in which case that method will be called instead of `constructor`:
    ```javascript
    // user.service.js

    import { Inject, AsyncModuleInit } from '@stilt/core';
    import UserModel from './user.model';

    @Inject({
        // Access @stilt/jwt-sessions's session manager.
        sessionManager: 'jwt-sessions:session-manager',
    })
    export default class UserService {

        constructor({ sessionManager }) {
            this.sessionManager = sessionManager;
        }

        @AsyncModuleInit
        static async asyncInit({ sessionManager }) {

            await makeSomeAsyncOperation();

            // delegate to the constructor.
            return new this({ sessionManager });
        }

        getLoggedUser() {
            const session = this.sessionManager.getCurrentSession();

            return UserModel.findOne({
                where: { id: session.userId },
            });
        }
    }
    ```

### Configurable Injectables & Factories

If you need to configure an injectable, or want to create a reusable injectable that can be configured, you need to use factories.

A caveat of factories is that you need to declare them to your app module before they can be injected.

If we take the reusable module StiltSequelize, we cannot inject this module as-is as it needs to be configured 
to specify the Database URI before it can be instantiated.

We do this by calling `StiltSequelize.configure` which will return a factory.

```javascript
import { App } from '@stilt/core';
import { StiltSequelize } from '@stilt/sequelize';

async function bootstrap() {
    const app = new App({ logLevel: 'info' });

    // install all necessary plugins here.

    // provide a configured sequelize module
    app.use(StiltSequelize.configure({ databaseUri }));

    return app.start();
}
```

Note: in the case of this module, you can also pass a `runnable` to `.configure` to access other modules, such as a configuration module:

```javascript
import { App, runnable } from '@stilt/core';
import { StiltSequelize } from '@stilt/sequelize';
import ConfigService from '../config.service';

async function bootstrap() {
    // ...

    app.use(StiltSequelize.configure(runnable({
      run(configService) {
        return {
          databaseUri: configService.get('database.uri'),
        }
      },
      dependencies: [ConfigService],
    })));

    // ...
}
```

```javascript
@Inject({
    // requesting StiltSequelize will now provide a properly configured instance of it
    stiltSequelize: StiltSequelize,
    // similarly for extra modules provided by StiltSequelize
    sequelize: Sequelize,
})
export default class UserService {}
```

If you need to create a factory yourself, they're also pretty straightforward. 
Continuing with the example of StiltSequelize, let's replace `.configure` with our own factory function

```javascript
import { App, runnable, factory } from '@stilt/core';
import { StiltSequelize } from '@stilt/sequelize';
import ConfigService from '../config.service';

async function bootstrap() {
    // ...
    
    // configure version:
    // app.use(StiltSequelize.configure(/* ... */));
    
    // our own factory version:
    app.use(factory({
      // This is a list of IDs that can be used in @Inject to access the instance provided by this factory.
      ids: [StiltSequelize],
      // build is a runnable, it can be async, and it must return the instance to use for StiltSequelize.
      build: runnable({
        run(configService) {
          // note: normally asyncModuleInit is a private method
          // that will init sequelize & resolve the StiltSequelize instance once finished
          return StiltSequelize.asyncInit({ 
            databaseUri: configService,
          })    
        },
        dependencies: [ConfigService], 
      })
    }));
    
    // ...
}
```
