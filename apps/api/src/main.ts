import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { AppModule } from "./app.module";
import { config } from "./config";
import { ErrorFilter } from "./common/error.filter";
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.use(
    (
      req: {
        method: string;
        headers: Record<string, string | undefined>;
        cookies?: Record<string, string>;
      },
      res: { status: (code: number) => { json: (body: unknown) => unknown } },
      next: () => void,
    ) => {
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        ((req.headers.origin && req.headers.origin !== config.webOrigin) ||
          (req.cookies?.session && !req.headers.origin))
      ) {
        res.status(403).json({
          statusCode: 403,
          code: "HTTP_403",
          message: "Nguồn yêu cầu không hợp lệ.",
        });
        return;
      }
      next();
    },
  );
  app.use(
    "/api/auth/login",
    rateLimit({
      windowMs: config.loginWindowMs,
      limit: config.loginMaxAttempts,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        statusCode: 429,
        code: "HTTP_429",
        message: "Quá nhiều lần đăng nhập. Vui lòng thử lại sau.",
      },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  await app.listen(config.apiPort, "127.0.0.1");
}
void bootstrap();
