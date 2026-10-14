import {
  Global,
  Module,
  Injectable,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { Pool, PoolClient, QueryResultRow } from "pg";
import { config } from "../config";
@Injectable()
export class Database implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    application_name: config.appName,
  });
  constructor() {
    this.pool.on("error", () => {
      Logger.error(
        "An idle database connection closed; future requests will reconnect.",
        "Database",
      );
    });
  }
  query<T extends QueryResultRow>(sql: string, values?: unknown[]) {
    return this.pool.query<T>(sql, values);
  }
  async readSnapshot<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.runTransaction(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      work,
    );
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.runTransaction("BEGIN", work);
  }
  private async runTransaction<T>(
    begin: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    let failed: Error | undefined;
    try {
      await client.query(begin);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      failed = error instanceof Error ? error : new Error("Transaction failed");
      try {
        await client.query("ROLLBACK");
      } catch {
        Logger.error(
          "Rollback connection unavailable; discarding connection.",
          "Database",
        );
      }
      throw error;
    } finally {
      client.release(failed);
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
