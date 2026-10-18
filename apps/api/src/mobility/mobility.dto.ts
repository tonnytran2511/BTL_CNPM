import { Type } from "class-transformer";
import {
  IsIn,
  IsDefined,
  IsObject,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
  Matches,
} from "class-validator";
export class RegisterVehicleDto {
  @IsString() @Length(1, 40) @Matches(/\S/) code!: string;
  @IsIn(["electric_bicycle", "electric_motorcycle"]) type!:
    "electric_bicycle" | "electric_motorcycle";
  @IsInt() @Min(0) @Max(100) batteryPercent!: number;
}
export class ParkingWindowDto {
  @IsUUID() hubId!: string;
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt!: string;
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  endsAt!: string;
}
export class ReserveParkingDto extends ParkingWindowDto {
  @IsUUID() privateVehicleId!: string;
}
class ChargingVehicleDto {
  @IsIn(["rental", "private"]) kind!: "rental" | "private";
  @IsUUID() id!: string;
}
export class CreateChargingDto {
  @IsUUID() hubId!: string;
  @ValidateNested()
  @IsDefined()
  @IsObject()
  @Type(() => ChargingVehicleDto)
  vehicle!: ChargingVehicleDto;
  @IsInt() @Min(1) @Max(100) targetBatteryPercent!: number;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  requiredBy?: string;
}
