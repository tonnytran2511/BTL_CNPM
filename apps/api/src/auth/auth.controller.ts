import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { AuthRequest, Public } from "./auth.guard";
import { config } from "../config";
class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(256) password!: string;
}
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: config.cookieSecure,
  path: "/api",
};
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Public()
  @Post("login")
  async login(
    @Body() body: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body.email, body.password);
    await this.auth.logout(req.cookies?.session);
    response.cookie("session", result.token, {
      ...cookieOptions,
      maxAge: config.sessionTtlSeconds * 1000,
    });
    return result.user;
  }
  @Get("me") me(@Req() req: AuthRequest) {
    return req.user;
  }
  @Public()
  @Post("logout")
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(req.cookies?.session);
    response.clearCookie("session", cookieOptions);
    return { success: true };
  }
}
