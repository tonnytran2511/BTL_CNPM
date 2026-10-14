import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Role, User } from "@emobility/contracts";
import { AuthService } from "./auth.service";
export const Public = () => SetMetadata("public", true);
export const Roles = (...roles: Role[]) => SetMetadata("roles", roles);
export interface AuthRequest extends Request {
  user: User;
  cookies: Record<string, string | undefined>;
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>("public", targets))
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = await this.auth.current(request.cookies?.session);
    if (!user) throw new UnauthorizedException("Vui lòng đăng nhập.");
    request.user = user;
    const roles = this.reflector.getAllAndOverride<Role[]>("roles", targets);
    if (roles && !roles.includes(user.role))
      throw new ForbiddenException(
        "Bạn không có quyền thực hiện thao tác này.",
      );
    return true;
  }
}
