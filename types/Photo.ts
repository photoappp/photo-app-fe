export type Photo = {
  uri: string;
  takenAt?: number | null; // optional
  city?: string;
  country?: string;
  location?: {
    latitude: string | number;
    longitude: string | number;
  } | null;
};