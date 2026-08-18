export type ReservationNotifyInput = {
  kind: "confirmed" | "reminder";
  restaurantName: string;
  restaurantAddress?: string;
  reservationTime: Date;
  guestCount: number;
  orderId: string;
};

const istWhen = (date: Date): string =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

/** Pure payload builder shared by notification delivery and unit tests. */
export const buildReservationEmailData = (
  input: ReservationNotifyInput
): Record<string, unknown> => ({
  restaurantName: input.restaurantName,
  restaurantAddress: input.restaurantAddress,
  whenLabel: istWhen(input.reservationTime),
  guestCount: input.guestCount,
  orderId: input.orderId,
  isReminder: input.kind === "reminder",
});
