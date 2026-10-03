export type BookingService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
};

export type BookingBranch = { id: string; name: string };

export type BookingProfessional = {
  id: string;
  name: string;
  branchIds: string[];
  serviceIds: string[];
};
