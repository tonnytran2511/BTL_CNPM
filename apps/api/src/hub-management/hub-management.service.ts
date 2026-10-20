import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CreateHubRequest, UpdateHubRequest } from "@emobility/contracts";
import type { PoolClient } from "pg";
import { HubManagementRepository } from "./hub-management.repository";
@Injectable()
export class HubManagementService {
  constructor(
    @Inject(HubManagementRepository)
    private readonly repo: HubManagementRepository,
  ) {}
  private withHub<T>(id: string, work: (client: PoolClient) => Promise<T>) {
    return this.repo.transaction(async (client) => {
      if (!(await this.repo.lockHub(client, id)))
        throw new NotFoundException("Không tìm thấy Hub.");
      return work(client);
    });
  }
  async create(input: CreateHubRequest) {
    try {
      return await this.repo.transaction((client) =>
        this.repo.create(client, input),
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException("Mã Hub đã tồn tại.");
      throw error;
    }
  }
  update(id: string, input: UpdateHubRequest) {
    return this.withHub(
      id,
      async (client) => (await this.repo.update(client, id, input))!,
    );
  }
  async delete(id: string) {
    return this.withHub(id, async (client) => {
      if (await this.repo.hasOpenIncident(client, id))
        throw new ConflictException(
          "Không thể xóa Hub đang có sự cố chưa xử lý.",
        );
      try {
        if (!(await this.repo.delete(client, id)))
          throw new NotFoundException("Không tìm thấy Hub.");
        return { success: true };
      } catch (error) {
        if ((error as { code?: string }).code === "23503")
          throw new ConflictException(
            "Không thể xóa Hub đang có dữ liệu hoặc tài nguyên liên quan.",
          );
        throw error;
      }
    });
  }
  async setCapacity(id: string, capacity: number) {
    return this.withHub(id, async (client) => {
      const maximum = await this.repo.maximumCapacity(client);
      if (capacity > maximum)
        throw new ConflictException(
          `Sức chứa tối đa cấu hình cho Hub là ${maximum}.`,
        );
      const current = await this.repo.capacity(client, id);
      if (capacity < current.protected)
        throw new ConflictException(
          "Sức chứa không thể thấp hơn số chỗ đang có xe hoặc được giữ.",
        );
      if (capacity < current.total) {
        const remove = await this.repo.removableSpaces(
          client,
          id,
          current.total - capacity,
        );
        if (remove.length !== current.total - capacity)
          throw new ConflictException(
            "Không thể giảm sức chứa vì các chỗ còn lại có booking hoặc đang được sử dụng.",
          );
        await this.repo.deleteSpaces(
          client,
          remove.map((s) => s.id),
        );
      } else if (capacity > current.total) {
        const used = new Set(await this.repo.spaceCodes(client, id));
        let n = 1;
        for (let i = current.total; i < capacity; i++) {
          while (used.has(`P${n}`)) n++;
          const code = `P${n++}`;
          used.add(code);
          await this.repo.addSpace(client, id, code);
        }
      }
      return { hubId: id, capacity };
    });
  }
  async addChargingPoint(id: string, code: string) {
    try {
      return await this.withHub(id, (client) =>
        this.repo.addChargingPoint(client, id, code),
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException("Mã cổng sạc đã tồn tại tại Hub này.");
      throw error;
    }
  }
  async removeChargingPoint(id: string, pointId: string) {
    return this.withHub(id, async (client) => {
      if (await this.repo.hasOpenChargingIncident(client, pointId))
        throw new ConflictException(
          "Không thể xóa cổng sạc đang có sự cố chưa xử lý.",
        );
      if (!(await this.repo.deleteChargingPoint(client, id, pointId)))
        throw new ConflictException(
          "Không thể xóa cổng sạc đang được sử dụng hoặc không tồn tại.",
        );
      return { success: true };
    });
  }
}
