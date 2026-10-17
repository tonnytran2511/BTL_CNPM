import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { VEHICLE_TYPES, type VehicleType } from "./rental.rules";

export class VehicleSearchDto {
  @IsOptional() @IsUUID() hubId?: string;
  @IsOptional() @IsIn(VEHICLE_TYPES) type?: VehicleType;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minBatteryPercent?: number;
}
