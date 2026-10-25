import {
  IsInt,
  IsNumber,
  IsUUID,
  Max,
  Min,
  IsIn,
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
} from "class-validator";
import type {
  ScenarioSimulationRequest,
  ScenarioKind,
} from "@emobility/contracts";
import type { DemandSimulationRequest } from "@emobility/contracts";

export class DemandSimulationDto implements DemandSimulationRequest {
  @IsUUID() hubId!: string;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) horizonMinutes!: number;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) stepMinutes!: number;
  @IsInt() @Min(0) @Max(4294967295) seed!: number;
  @IsNumber() @Min(0) baselineArrivalsPerStep!: number;
  @IsNumber() @Min(0) scenarioArrivalsPerStep!: number;
}
export class ScenarioSimulationDto
  extends DemandSimulationDto
  implements ScenarioSimulationRequest
{
  @IsIn(["demand_surge", "parking_full", "charging_failure"])
  kind!: ScenarioKind;
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  additionalOccupiedSpaces!: number;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsUUID(undefined, { each: true })
  failedChargingPointIds!: string[];
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  chargingServiceMinutes!: number;
}
