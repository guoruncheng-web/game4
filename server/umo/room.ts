import { createHash } from "node:crypto";
import { COLORS, riskOf } from "./domain";
import type { AutomationReason, CardColor, IntentResult, MatchEvent, MatchMode, MatchState, PlayerIntent, SeatView } from "./domain";
import { RulesEngine } from "./rules";

export const PROTOCOL_VERSION = 1;
export interface ProtocolEnvelope { readonly protocolVersion: number; readonly type: string; readonly payload: unknown }
export interface RecoveryPacket { readonly snapshotSeq: number; readonly view: SeatView; readonly tail: readonly MatchEvent[]; readonly stateHash: string }
interface DurableRoomSnapshot { readonly state: MatchState; readonly events: readonly MatchEvent[]; readonly idempotency: readonly (readonly [string, IntentResult])[] }

export class AuthoritativeRoom {
  readonly state: MatchState;
  private readonly rules = new RulesEngine();
  private readonly events: MatchEvent[] = [];
  private readonly idempotency = new Map<string, IntentResult>();
  constructor(mode: MatchMode, seed: bigint, restored?: MatchState, events: readonly MatchEvent[] = [], idempotency: readonly (readonly [string, IntentResult])[] = []) {
    this.state = restored ?? this.rules.create(mode, seed); this.events.push(...events); for (const [key, value] of idempotency) this.idempotency.set(key, value);
  }
  submit(intent: PlayerIntent): IntentResult {
    const cached = this.idempotency.get(intent.requestId); if (cached) return cached;
    const result = this.rules.apply(this.state, intent); if (result.accepted) this.events.push(...result.events);
    this.idempotency.set(intent.requestId, result); return result;
  }
  botIntent(seat: number, requestId: string, automation: AutomationReason): PlayerIntent {
    if (seat !== this.state.currentSeat) throw new Error("BOT_SEAT_NOT_CURRENT");
    const own = this.state.seats[seat];
    if (!own) throw new Error("BOT_SEAT_INVALID");
    const legal = own.hand.filter((card) => this.rules.isLegal(this.state, card)
      && !(card.kind === "pulsePrism" && own.hand.some((other) => other.id !== card.id && other.color === this.state.activeColor)));
    legal.sort((left, right) => riskOf(left) - riskOf(right) || left.id - right.id);
    const card = legal[0];
    if (!card) return { type: "draw", seat, expectedSeq: this.state.seq, requestId, automation };
    if (card.color !== "wild") return { type: "play", seat, expectedSeq: this.state.seq, requestId, cardId: card.id, automation };
    return {
      type: "play",
      seat,
      expectedSeq: this.state.seq,
      requestId,
      cardId: card.id,
      chosenColor: chooseBotColor(own.hand.filter((candidate) => candidate.id !== card.id)),
      automation,
    };
  }
  viewFor(seat: number): SeatView { return this.rules.viewFor(this.state, seat); }
  recover(seat: number, afterSeq: number): RecoveryPacket {
    const view = this.viewFor(seat); return { snapshotSeq: this.state.seq, view, tail: this.events.filter(e => e.seq > afterSeq), stateHash: hashView(view) };
  }
  snapshotJson(): string { return JSON.stringify(this.state, (_, value: unknown) => typeof value === "bigint" ? `${value}n` : value); }
  static restore(json: string): AuthoritativeRoom {
    const state = JSON.parse(json, (_key: string, value: unknown) => typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value) as MatchState;
    return new AuthoritativeRoom(state.mode, state.seed, state);
  }
  durableSnapshotJson(): string {
    return JSON.stringify({ state: this.state, events: this.events, idempotency: [...this.idempotency.entries()] }, bigintReplacer);
  }
  static restoreDurable(json: string): AuthoritativeRoom {
    const snapshot = JSON.parse(json, bigintReviver) as DurableRoomSnapshot;
    return new AuthoritativeRoom(snapshot.state.mode, snapshot.state.seed, snapshot.state, snapshot.events, snapshot.idempotency);
  }
}

function chooseBotColor(hand: readonly { readonly color: CardColor }[]): CardColor {
  const counts = new Map<CardColor, number>(COLORS.map((color) => [color, 0]));
  for (const card of hand) if (card.color !== "wild") counts.set(card.color, (counts.get(card.color) ?? 0) + 1);
  return [...COLORS].sort((left, right) => (counts.get(right) ?? 0) - (counts.get(left) ?? 0))[0] ?? "coral";
}

function bigintReplacer(_key: string, value: unknown): unknown { return typeof value === "bigint" ? `${value}n` : value; }
function bigintReviver(_key: string, value: unknown): unknown { return typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value; }

export function validateProtocol(envelope: ProtocolEnvelope): "OK" | "PROTOCOL_VERSION_INCOMPATIBLE" {
  return envelope.protocolVersion === PROTOCOL_VERSION ? "OK" : "PROTOCOL_VERSION_INCOMPATIBLE";
}
export function hashView(view: SeatView): string { return createHash("sha256").update(JSON.stringify(view)).digest("hex").toUpperCase(); }
