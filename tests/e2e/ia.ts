// Shape of the dev-only read-only debug handle exposed by src/ui/app.ts.
export interface IA {
  generation(): number;
  population(): number;
  boardHash(): string;
  running(): boolean;
  camera(): { originX: number; originY: number; zoom: number };
  cellToClient(x: number, y: number): { x: number; y: number };
  cell(x: number, y: number): number;
  log(): Array<{ generation: number; type: string }>;
  energy(): number;
  receipts(): Array<{ passageId: string; generation: number; detectorId: string; amount: number }>;
  collector(): { config: { id: string; x: number; y: number; heading: string }; nearMisses: number };
  collectors(): Array<{ config: { id: string; x: number; y: number; heading: string } }>;
  machines(): Array<{ id: string; kind: string; x: number; y: number; paid: number }>;
  goals(): string[];
  losses(): number;
  unlocks(): string[];
  mode(): string;
  boardSize(): { width: number; height: number };
}

declare global {
  interface Window {
    __ia: IA;
  }
}
