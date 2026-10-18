import { useState } from "react";

export function useReservationConfirmation(onCancel: (id: string) => void) {
  const [id, setId] = useState<string | null>(null);
  return {
    id,
    ask: setId,
    dismiss: () => setId(null),
    confirm: (reservationId: string) => {
      setId(null);
      onCancel(reservationId);
    },
  };
}
