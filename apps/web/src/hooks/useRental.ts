import { useReservations } from "./useReservations";
import { useVehicleSearch } from "./useVehicleSearch";

export function useRental(
  userId: string | undefined,
  updatedAt: string | null,
  refresh: () => Promise<void>,
) {
  const vehicles = useVehicleSearch(userId, updatedAt);
  const reservations = useReservations(userId, updatedAt);
  const perform = async (action: () => Promise<boolean>) => {
    if (!(await action())) return;
    vehicles.reload();
    await refresh();
  };
  return {
    vehicles,
    reservations,
    reserve: (id: string) => perform(() => reservations.reserve(id)),
    cancel: (id: string) => perform(() => reservations.cancel(id)),
  };
}
