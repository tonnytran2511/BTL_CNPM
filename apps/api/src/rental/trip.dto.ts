import { IsUUID } from "class-validator";

export class ReturnTripDto {
  @IsUUID() targetHubId!: string;
}
