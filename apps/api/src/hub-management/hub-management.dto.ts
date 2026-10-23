import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
export class CreateHubDto {
  @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/) code!: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  location!: string;
}
export class UpdateHubDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  location?: string;
  @IsOptional() @IsIn(["active", "inactive"]) status?: "active" | "inactive";
}
export class ParkingCapacityDto {
  @Type(() => Number) @IsInt() @Min(0) capacity!: number;
}
export class CreateChargingPointDto {
  @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/) code!: string;
}
