import { IsUUID } from "class-validator";

export class CreateReservationDto {
  @IsUUID() vehicleId!: string;
}
