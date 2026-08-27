export const COLORS = ["coral", "amber", "aqua", "violet"] as const;
export type CardColor = (typeof COLORS)[number] | "wild";
export type CardKind = "number" | "skip" | "reverse" | "boost" | "prism" | "pulsePrism";
export type MatchMode = "classic" | "teams2v2";
export type PulseSkill = "tune" | "shield" | "retune";
export type TeamEmote = "agree" | "caution" | "changeColor" | "almostDone";

export interface Card { readonly id: number; readonly color: CardColor; readonly kind: CardKind; readonly value: number }
export interface SeatState {
  readonly seat: number;
  readonly hand: Card[];
  shielded: boolean;
  finished: boolean;
  connected: boolean;
}
export interface MatchState {
  readonly matchId: string;
  readonly mode: MatchMode;
  readonly seed: bigint;
  readonly drawPile: Card[];
  readonly discardPile: Card[];
  readonly seats: SeatState[];
  currentSeat: number;
  direction: 1 | -1;
  activeColor: CardColor;
  readonly pulse: number[];
  readonly pulseUsedThisTurn: boolean[];
  readonly tunedCardIds: Array<number | null>;
  seq: number;
  winningSeat: number | null;
  winningTeam: number | null;
}

export type AutomationReason = "timeout" | "disconnect" | "bot";
export interface BaseIntent {
  readonly seat: number;
  readonly expectedSeq: number;
  readonly requestId: string;
  readonly automation?: AutomationReason;
}
export interface PlayIntent extends BaseIntent { readonly type: "play"; readonly cardId: number; readonly chosenColor?: CardColor }
export interface DrawIntent extends BaseIntent { readonly type: "draw" }
export interface PulseIntent extends BaseIntent {
  readonly type: "pulse";
  readonly skill: PulseSkill;
  readonly cardId?: number;
  readonly chosenColor?: CardColor;
}
export type PlayerIntent = PlayIntent | DrawIntent | PulseIntent;
export interface MatchEvent { readonly seq: number; readonly type: string; readonly actorSeat: number; readonly detail: string }
export interface IntentResult { readonly accepted: boolean; readonly code: string; readonly events: readonly MatchEvent[] }

export interface PublicSeatView { readonly seat: number; readonly handCount: number; readonly shielded: boolean; readonly finished: boolean; readonly connected: boolean }
export interface MatchResultEntry {
  readonly seat: number;
  readonly team: number | null;
  readonly rank: number;
  readonly remainingRisk: number;
  readonly roundScore: number;
  readonly pulseReward: number;
}
export interface MatchResult {
  readonly mode: MatchMode;
  readonly winningSeat: number | null;
  readonly winningTeam: number | null;
  readonly entries: readonly MatchResultEntry[];
}
export interface PublicMatchView {
  readonly matchId: string; readonly mode: MatchMode; readonly seq: number; readonly currentSeat: number;
  readonly direction: 1 | -1; readonly topCard: Card; readonly activeColor: CardColor;
  readonly pulse: readonly number[]; readonly seats: readonly PublicSeatView[];
  readonly winningSeat: number | null; readonly winningTeam: number | null;
  readonly result: MatchResult | null;
}
export interface PrivateSeatView { readonly seat: number; readonly hand: readonly Card[]; readonly tunedCard: Card | null }
export interface SeatView { readonly public: PublicMatchView; readonly private: PrivateSeatView }

export function symbolOf(card: Card): string { return card.kind === "number" ? String(card.value) : card.kind; }
export function riskOf(card: Card): number {
  if (card.kind === "number") return card.value;
  return card.kind === "prism" || card.kind === "pulsePrism" ? 50 : 20;
}
