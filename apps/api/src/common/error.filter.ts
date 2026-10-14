import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("API");
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body = error instanceof HttpException ? error.getResponse() : null;
    let message = "Không thể xử lý yêu cầu. Vui lòng thử lại.";
    if (typeof body === "string") message = body;
    else if (body && typeof body === "object" && "message" in body) {
      const value = body.message;
      message = Array.isArray(value) ? value.join("; ") : String(value);
    }
    if (status >= 500)
      this.logger.error(
        "Request failed; inspect database availability and application configuration.",
      );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, code: `HTTP_${status}`, message });
  }
}
