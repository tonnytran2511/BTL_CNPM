import { useReservations } from "./useReservations";
import { useVehicleSearch } from "./useVehicleSearch";
import { useTrips } from "./useTrips";
import { useTripTarget } from "./useTripTarget";

export function useRental(
  userId: string | undefined,
  updatedAt: string | null,
  refresh: () => Promise<void>,
) {
  const vehicles = useVehicleSearch(userId, updatedAt);
  const reservations = useReservations(userId, updatedAt);
  const trips = useTrips(userId, updatedAt);
  const tripTarget = useTripTarget(userId);
  const perform = async (action: () => Promise<boolean>) => {
    if (!(await action())) return;
    vehicles.reload();
    await refresh();
  };
  return {
    vehicles,
    reservations,
    trips,
    tripTarget,
    busyId: reservations.busyId ?? trips.busyId,
    reserve: (id: string) => perform(() => reservations.reserve(id)),
    cancel: (id: string) => perform(() => reservations.cancel(id)),
    pickup: (id: string) => perform(() => trips.pickup(id)),
    giveBack: (id: string, hubId: string) =>
      perform(() => trips.returnVehicle(id, hubId)),
  };
}
