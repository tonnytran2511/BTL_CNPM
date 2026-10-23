import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { RentalRepository } from "./rental.repository";
import { ReservationService } from "./reservation.service";

/**
 * Scheduler nội bộ giải phóng reservation hết hạn (BR-01, docs/use-cases.md).
 * Chu kỳ lấy từ settings (reservationExpirySweepSeconds). Đây chỉ là lớp dọn nền:
 * luồng đặt/hủy/nhận xe vẫn tự kiểm tra expires_at nên đúng ngay cả khi scheduler chưa chạy.
 */
@Injectable()
export class ReservationExpiryScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ReservationExpiryScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(RentalRepository) private readonly repository: RentalRepository,
    @Inject(ReservationService)
    private readonly reservations: ReservationService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const seconds = await this.repository.reservationExpirySweepSeconds();
      this.timer = setInterval(() => void this.tick(), seconds * 1000);
      this.timer.unref(); // không giữ process sống chỉ vì scheduler
    } catch (error) {
      // Không chặn API khởi động; các request vẫn tự nhả xe hết hạn khi được gọi.
      this.logger.error(
        `Không khởi động được scheduler hết hạn đặt xe: ${error instanceof Error ? error.message : "lỗi không rõ"}`,
      );
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Không chạy chồng hai lượt quét trong cùng một process. */
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reservations.expireDue();
    } finally {
      this.running = false;
    }
  }
}
