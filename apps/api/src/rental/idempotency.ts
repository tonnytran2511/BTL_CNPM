import { BadRequestException, ConflictException } from "@nestjs/common";
import type { RentalTx } from "./rental.repository";

export const IDEMPOTENCY_HEADER = "idempotency-key";

/**
 * BR-11: header là tùy chọn để client cũ vẫn chạy (khi thiếu, lệnh chỉ được bảo vệ bằng
 * kiểm tra trạng thái). Khi có thì phải dài 1–128 ký tự và chỉ xuất hiện một lần.
 */
export function parseIdempotencyKey(
  raw: string | string[] | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !raw.trim() || raw.length > 128)
    throw new BadRequestException(
      "Idempotency-Key phải dài từ 1 đến 128 ký tự.",
    );
  return raw;
}

/**
 * Chạy `work` trong transaction của `tx` với Idempotency-Key (phạm vi actor + operation):
 * - cùng key, cùng payload: trả lại kết quả đã lưu, không chạy lại;
 * - cùng key, khác payload: 409;
 * - hai request cùng key chạy song song được tuần tự hóa bằng advisory lock.
 * `work` ném lỗi thì cả transaction (kể cả key) rollback nên key vẫn dùng lại được.
 * `skipStore` cho kết quả không nên lưu (ví dụ nhánh đã commit phần nhả xe rồi báo 409).
 */
export async function withIdempotency<T>(
  tx: RentalTx,
  actorId: string,
  operation: string,
  key: string | undefined,
  payload: unknown,
  work: () => Promise<T>,
  skipStore: (result: T) => boolean = () => false,
): Promise<T> {
  if (key === undefined) return work();
  const body = JSON.stringify(payload);
  await tx.client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
    [JSON.stringify(["rental", actorId, operation, key])],
  );
  const old = (
    await tx.client.query<{ payload: string; response: T }>(
      "SELECT payload, response FROM rental_idempotency WHERE actor_id=$1 AND operation=$2 AND key=$3",
      [actorId, operation, key],
    )
  ).rows[0];
  if (old) {
    if (old.payload !== body)
      throw new ConflictException(
        "Idempotency-Key đã được dùng với nội dung khác.",
      );
    return old.response;
  }
  const result = await work();
  if (!skipStore(result))
    await tx.client.query(
      "INSERT INTO rental_idempotency(actor_id, operation, key, payload, response) VALUES ($1,$2,$3,$4,$5)",
      [actorId, operation, key, body, JSON.stringify(result)],
    );
  return result;
}
