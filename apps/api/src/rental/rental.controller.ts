import { Controller, Get, Inject, Query } from "@nestjs/common";
import { RentalService } from "./rental.service";
import { VehicleSearchDto } from "./rental.dto";

@Controller()
export class RentalController {
  constructor(@Inject(RentalService) private readonly rental: RentalService) {}
  // Any signed-in user; the global AuthGuard rejects anonymous requests with 401.
  @Get("vehicles") search(@Query() query: VehicleSearchDto) {
    return this.rental.search(query);
  }
}
