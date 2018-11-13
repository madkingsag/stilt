# ROADMAP

- Dependency injection
    - `@module('moduleName')`
    - ```javascript
      @inject({
        moduleName: MODULE_CLASS,
      }, moduleName, [moduleName, etc])
      ```
    - Allow controller decorator on instances
        - An instance if then created, using @inject to find the necessary modules
        - With `moduleName`, the system has time to initialize
        - Can inject `config` module
        - CLI can request some modules at will. If it requests a Model module or something that depends on a Model, init the database.
    - CLI should be part of core
