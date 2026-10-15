export type Role = "agent" | "user" | "tool" | "sys";

export interface Line {
  id: string;
  role: Role;
  text: string;
}

export interface Booking {
  id: string;
  name: string;
  phone: string;
  court: number;
  datetimeISO: string;
  players: number;
}
