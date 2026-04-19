export type PatientContext = {
  name?: string;
  age?: number;
  sex?: string;
  diagnosis?: Record<string, boolean> | null;
};
