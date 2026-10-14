import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

type Parameter = string | number | null;

// Only the Expo boundary is adapted: application functions execute real SQLite SQL.
export function createTestDatabase(path = ':memory:') {
  const connection = new DatabaseSync(path);
  const adapter = {
    async execAsync(sql: string) { connection.exec(sql); },
    async runAsync(sql: string, ...parameters: Parameter[]) {
      const result = connection.prepare(sql).run(...parameters);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getFirstAsync<T>(sql: string, ...parameters: Parameter[]): Promise<T | null> {
      return (connection.prepare(sql).get(...parameters) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...parameters: Parameter[]): Promise<T[]> {
      return connection.prepare(sql).all(...parameters) as T[];
    },
    async withTransactionAsync(operation: () => Promise<void>) {
      connection.exec('BEGIN');
      try {
        await operation();
        connection.exec('COMMIT');
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db: adapter as unknown as SQLiteDatabase, adapter, connection, close: () => connection.close() };
}
