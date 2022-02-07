// source: https://github.com/kadirahq/graphql-errors/blob/master/lib/index.js
// because module is unmaintained :(
// TODO: replace once https://github.com/kadirahq/graphql-errors/pull/18/files is merged

// Mark field/type/schema
// export const Processed = Symbol('Processed');

// Used to identify UserErrors
export const IsDevError = Symbol('IsDevError');

// UserErrors will be sent to the user
export class DevError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DevError';
  }

  [IsDevError] = true;
}

// Modifies errors before sending to the user
// export function defaultErrorHandler(err, errorId = null) {
//   if (err[IsDevError]) {
//     return err;
//   }
//
//   errorId = errorId || nanoid();
//   err.message = `${err.message}: ${errorId}`;
//   console.error(err && err.stack || err);
//
//   // return newError to hide source stacktrace
//   const newError = new Error(`Internal Error [errId: ${errorId}_api]`);
//   newError.stack = null;
//
//   return newError;
// }

// // Masks graphql schemas, types or individual fields
// export function maskErrors(thing, errorHandler = defaultErrorHandler) {
//   if (thing instanceof GraphQLSchema) {
//     maskSchema(thing, errorHandler);
//   } else if (thing instanceof GraphQLObjectType) {
//     maskType(thing, errorHandler);
//   } else {
//     maskField(thing, errorHandler);
//   }
// }
//
// function maskField(field, errorHandler) {
//   const wrappedResolve = field.resolve;
//   if (field[Processed] || !wrappedResolve) {
//     return;
//   }
//
//   field[Processed] = true;
//   field.resolve = function wrapperResolve(...args) {
//
//     // we need to return the exact same type the wrappedResolver would return
//     // (async vs sync) so don't wrap everything in a promise.
//     try {
//       const out = wrappedResolve.call(this, ...args);
//       if (out instanceof Error) {
//         throw out;
//       }
//
//       if (out == null || typeof out.then !== 'function') {
//         return out;
//       }
//
//       // process asynchronous error
//       return out.then(a => {
//         // FIXME: we shouldn't be receiving Errors as a resolve value but as a rejection.
//         // Need to look into why this is the case.
//         // Possibility: nest 6 unified error handling and we need to move this error handler a level higher instead of graphql-specific?
//         if (a instanceof Error) {
//           throw errorHandler(a);
//         }
//
//         return a;
//       }, err => {
//         throw errorHandler(err, args);
//       });
//     } catch (e) {
//       // process synchronous error
//       throw errorHandler(e, args);
//     }
//   };
//
//   // save the original resolve function
//   field.resolve._resolveFn = wrappedResolve;
// }
//
// function maskType(type, errorHandler) {
//   if (type[Processed] || !type.getFields) {
//     return;
//   }
//
//   const fields = type.getFields();
//   for (const fieldName in fields) {
//     if (!Object.hasOwnProperty.call(fields, fieldName)) {
//       continue;
//     }
//
//     maskField(fields[fieldName], errorHandler);
//   }
// }
//
// function maskSchema(schema, errorHandler) {
//   const types = schema.getTypeMap();
//   for (const typeName in types) {
//     if (!Object.hasOwnProperty.call(types, typeName)) {
//       continue;
//     }
//
//     maskType(types[typeName], errorHandler);
//   }
// }
