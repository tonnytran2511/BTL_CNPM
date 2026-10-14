import { Inject, Injectable } from "@nestjs/common";
import type { User } from "@emobility/contracts";
import { Database } from "../database/database.module";
@Injectable()
export class AuthRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  async credentials(email: string) {
    const result = await this.db.query<User & { passwordHash: string }>(
      'SELECT id,email,name,role,password_hash AS "passwordHash" FROM users WHERE email=$1 AND active=true',
      [email],
    );
    return result.rows[0] ?? null;
  }
  async createSession(tokenHash: string, userId: string, ttlSeconds: number) {
    await this.db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+$3*interval '1 second')",
      [tokenHash, userId, ttlSeconds],
    );
  }
  async session(tokenHash: string): Promise<User | null> {
    const result = await this.db.query<User>(
      "SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true",
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }
  async revoke(tokenHash: string) {
    await this.db.query("DELETE FROM sessions WHERE token_hash=$1", [
      tokenHash,
    ]);
  }
}
