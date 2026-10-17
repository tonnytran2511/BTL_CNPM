import { Controller, Get, Inject, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Database, DatabaseModule } from "./database/database.module";
import { AuthGuard, Public } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { HubsModule } from "./hubs/hubs.module";
import { RentalModule } from "./rental/rental.module";
import { config } from "./config";
@Controller()
class AppController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Public() @Get("health") async health() {
    await this.db.query("SELECT 1");
    return { status: "ok" };
  }
  @Public() @Get("config") publicConfig() {
    return { appName: config.appName, pollIntervalMs: config.pollIntervalMs };
  }
}
@Module({
  imports: [DatabaseModule, AuthModule, HubsModule, RentalModule],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
