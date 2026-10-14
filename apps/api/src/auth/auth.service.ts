import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { AuthRepository } from "./auth.repository";
import { hashPassword, hashToken, verifyPassword } from "./password.util";
import { config } from "../config";
@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(randomBytes(32).toString("hex"));
  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
  ) {}
  async login(email: string, password: string) {
    const row = await this.repository.credentials(email.trim().toLowerCase());
    const valid = await verifyPassword(
      password,
      row?.passwordHash ?? (await this.dummyHash),
    );
    if (!row || !valid)
      throw new UnauthorizedException("Email hoặc mật khẩu không đúng.");
    const token = randomBytes(32).toString("base64url");
    await this.repository.createSession(
      hashToken(token),
      row.id,
      config.sessionTtlSeconds,
    );
    const { id, name, role } = row;
    return { token, user: { id, email: row.email, name, role } };
  }
  current(token?: string) {
    return token
      ? this.repository.session(hashToken(token))
      : Promise.resolve(null);
  }
  async logout(token?: string) {
    if (token) await this.repository.revoke(hashToken(token));
  }
}
