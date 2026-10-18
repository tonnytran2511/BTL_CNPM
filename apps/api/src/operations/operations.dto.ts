import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  MinLength,
} from "class-validator";
import type {
  CreateIncidentRequest,
  IncidentResourceType,
  RedistributionRequest,
} from "@emobility/contracts";

export class IncidentDto implements CreateIncidentRequest {
  @IsIn(["vehicle", "charging_point", "hub"])
  resourceType!: IncidentResourceType;
  @IsUUID() resourceId!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  description!: string;
}
export class RedistributionDto implements RedistributionRequest {
  @IsUUID() sourceHubId!: string;
  @IsUUID() targetHubId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  vehicleIds!: string[];
}
