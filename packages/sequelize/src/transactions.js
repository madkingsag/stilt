// @flow

import { AsyncHookMap } from 'async-hooks-map';
import type { Sequelize, Transaction } from 'sequelize';

// TODO: NODE > 10.x.x
//  use native version once available https://github.com/nodejs/node/pull/32318
const ASYNC_MAP = new AsyncHookMap();

const TRANSACTION_KEY = 'tr';

/**
 * This works like {@link Sequelize#transaction}, but if this is called inside an active transaction,
 * the active transaction will be returned.
 *
 * Note: You should use this as a replacement for {@link Sequelize#transaction},
 *  otherwise {@link getCurrentTransaction} will break.
 *
 * Note: SAVEPOINT functionality has not been implemented, if a sub-transaction fail,
 *  you should let the whole transaction fail or you'll end-up with inconsistent state.
 *  If SAVEPOINT is needed, ping @ephys
 *
 * @param {!Sequelize} sequelize The sequelize instance on which the transaction will run
 * @param {!Function} callback The callback to call with the transaction.
 *
 * @returns {any} The returned value of {callback}
 */
export function withTransaction<T>(sequelize: Sequelize, callback: (t: Transaction) => T) {
  const transaction = getCurrentTransaction();

  if (transaction) {
    return callback(transaction);
  }

  return sequelize.transaction(async newTransaction => {
    ASYNC_MAP.set(TRANSACTION_KEY, newTransaction);

    try {
      return await callback(newTransaction);
    } finally {
      ASYNC_MAP.delete(TRANSACTION_KEY);
    }
  });
}

/**
 * Returns the transaction of the current {@link withTransaction} block, if any.
 *
 * This method does not create a new transaction if none is active.
 *
 * @returns {Transaction | null} The transaction
 */
export function getCurrentTransaction(): Transaction | null {
  // ASYNC_MAP.get will throw otherwise
  if (!ASYNC_MAP.current()) {
    return null;
  }

  return ASYNC_MAP.get(TRANSACTION_KEY) ?? null;
}
