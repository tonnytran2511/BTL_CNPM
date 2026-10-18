import { IsInt, IsNumber, IsUUID, Max, Min } from "class-validator";
import type { DemandSimulationRequest } from "@emobility/contracts";

export class DemandSimulationDto implements DemandSimulationRequest {
  @IsUUID() hubId!: string;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) horizonMinutes!: number;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) stepMinutes!: number;
  @IsInt() @Min(0) @Max(4294967295) seed!: number;
  @IsNumber() @Min(0) baselineArrivalsPerStep!: number;
  @IsNumber() @Min(0) scenarioArrivalsPerStep!: number;
}
