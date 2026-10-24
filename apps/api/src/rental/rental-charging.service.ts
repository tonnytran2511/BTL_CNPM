import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import { RentalRepository } from "./rental.repository";

/** Rental owns all writes to fleet state; caller supplies the charging transaction. */
@Injectable()
export class RentalChargingService {
  constructor(
    @Inject(RentalRepository) private readonly repo: RentalRepository,
  ) {}
  candidates(c: PoolClient) {
    return this.repo.chargingCandidates(c);
  }
  async lock(c: PoolClient, id: string) {
    const v = await this.repo.lockChargingVehicle(c, id);
    if (!v) throw new NotFoundException("Không tìm thấy xe thuê.");
    return v;
  }
  async ready(c: PoolClient, id: string, hub: string) {
    const v = await this.lock(c, id);
    if (
      v.hub_id !== hub ||
      v.hub_status !== "active" ||
      v.status !== "available" ||
      !v.parked ||
      v.busy
    )
      throw new ConflictException("Xe thuê không còn sẵn sàng tại Hub để sạc.");
    return v;
  }
  async allocated(c: PoolClient, id: string, hub: string) {
    const v = await this.lock(c, id);
    if (v.hub_id !== hub || v.status !== "charging" || !v.parked || v.busy)
      throw new ConflictException("Trạng thái xe thuê không khớp phiên sạc.");
    return v;
  }
  async claim(c: PoolClient, id: string, hub: string) {
    await this.ready(c, id, hub);
    if (!(await this.repo.claimChargingVehicle(c, id, hub)))
      throw new ConflictException("Xe vừa bị giữ bởi thao tác khác.");
  }
  async release(c: PoolClient, id: string, hub: string, battery?: number) {
    await this.allocated(c, id, hub);
    if (!(await this.repo.releaseChargingVehicle(c, id, hub, battery)))
      throw new ConflictException("Không thể giải phóng xe thuê.");
  }
}
