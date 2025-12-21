/**
 * Types Barrel Export
 * ===================
 *
 * Re-export all types from a single entry point.
 * This simplifies imports throughout the app:
 *
 * Instead of:
 *   import { SmartAccount } from '../types/account'
 *   import { Transaction } from '../types/transaction'
 *
 * You can do:
 *   import { SmartAccount, Transaction } from '../types'
 */

export * from "./account";
export * from "./transaction";
export * from "./ui";
