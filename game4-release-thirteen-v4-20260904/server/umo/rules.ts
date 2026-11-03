import { COLORS, riskOf, symbolOf } from "./domain";
import type { Card, CardColor, IntentResult, MatchEvent, MatchMode, MatchResult, MatchState, PlayerIntent, PulseIntent, SeatView } from "./domain";

const MASK_64 = (1n << 64n) - 1n;

class DeterministicRng {
  private state: bigint;
  constructor(seed: bigint) { this.state = seed === 0n ? 0xa0761d6478bd642fn : seed & MASK_64; }
  next(max: number): number {
    this.state ^= this.state >> 12n;
    this.state ^= (this.state << 25n) & MASK_64;
    this.state ^= this.state >> 27n;
    this.state &= MASK_64;
    return Number(((this.state * 2685821657736338717n) & MASK_64) % BigInt(max));
  }
}

export class RulesEngine {
  create(mode: MatchMode, seed: bigint): MatchState {
    const drawPile = this.buildDeck();
    this.shuffle(drawPile, seed);
    const state: MatchState = {
      matchId: `umo-${seed.toString(16)}`, mode, seed, drawPile, discardPile: [],
      seats: Array.from({ length: 4 }, (_, seat) => ({ seat, hand: [], shielded: false, finished: false, connected: true })),
      currentSeat: 0, direction: 1, activeColor: "coral", pulse: [0, 0, 0, 0],
      pulseUsedThisTurn: [false, false, false, false], tunedCardIds: [null, null, null, null],
      seq: 0, winningSeat: null, winningTeam: null,
    };
    for (let round = 0; round < 7; round++) for (const seat of state.seats) seat.hand.push(this.takeRaw(state));
    let first = this.takeRaw(state);
    while (first.color === "wild" || first.kind !== "number") { state.drawPile.unshift(first); first = this.takeRaw(state); }
    state.discardPile.push(first);
    state.activeColor = first.color;
    return state;
  }

  apply(state: MatchState, intent: PlayerIntent): IntentResult {
    if (this.complete(state)) return this.reject("MATCH_COMPLETE");
    if (intent.expectedSeq !== state.seq) return this.reject("STALE_SEQ");
    if (intent.seat !== state.currentSeat) return this.reject("NOT_YOUR_TURN");
    const seat = this.seat(state, intent.seat);
    if (seat.finished) return this.reject("SEAT_FINISHED");
    const result = intent.type === "draw"
      ? this.draw(state, intent.seat)
      : intent.type === "pulse"
        ? this.usePulse(state, intent)
        : this.play(state, intent);
    if (!result.accepted || !intent.automation) return result;
    return this.accept([...result.events, this.emit(state, "BOT_ACTION", intent.seat, intent.automation)]);
  }

  isLegal(state: MatchState, card: Card): boolean {
    const top = this.top(state);
    return card.color === "wild" || card.color === state.activeColor || symbolOf(card) === symbolOf(top);
  }

  viewFor(state: MatchState, seatIndex: number): SeatView {
    const tunedId = state.tunedCardIds[seatIndex] ?? null;
    return {
      public: {
        matchId: state.matchId, mode: state.mode, seq: state.seq, currentSeat: state.currentSeat,
        direction: state.direction, topCard: this.top(state), activeColor: state.activeColor,
        pulse: state.mode === "classic" ? [...state.pulse] : [state.pulse[0] ?? 0, state.pulse[1] ?? 0],
        seats: state.seats.map(s => ({ seat: s.seat, handCount: s.hand.length, shielded: s.shielded, finished: s.finished, connected: s.connected })),
        winningSeat: state.winningSeat, winningTeam: state.winningTeam, result: this.resultFor(state),
      },
      private: { seat: seatIndex, hand: [...this.seat(state, seatIndex).hand], tunedCard: state.drawPile.find(c => c.id === tunedId) ?? null },
    };
  }

  private play(state: MatchState, intent: Extract<PlayerIntent, { type: "play" }>): IntentResult {
    const seat = this.seat(state, intent.seat);
    const index = seat.hand.findIndex(c => c.id === intent.cardId);
    if (index < 0) return this.reject("CARD_NOT_OWNED");
    const card = seat.hand[index];
    if (!card) return this.reject("CARD_NOT_OWNED");
    if (!this.isLegal(state, card)) return this.reject("CARD_NOT_LEGAL");
    if (card.color === "wild" && (!intent.chosenColor || intent.chosenColor === "wild")) return this.reject("COLOR_REQUIRED");
    if (card.kind === "pulsePrism" && seat.hand.some(c => c.id !== card.id && c.color === state.activeColor)) return this.reject("PULSE_PRISM_RESTRICTED");
    const previous = this.top(state);
    seat.hand.splice(index, 1);
    state.discardPile.push(card);
    state.activeColor = card.color === "wild" ? (intent.chosenColor as CardColor) : card.color;
    const events = [this.emit(state, "CARD_PLAYED", intent.seat, String(card.id))];
    if (card.color !== "wild" && symbolOf(card) === symbolOf(previous) && card.color !== previous.color) {
      const pulseIndex = this.pulseIndex(state, intent.seat);
      state.pulse[pulseIndex] = Math.min(3, (state.pulse[pulseIndex] ?? 0) + 1);
      events.push(this.emit(state, "PULSE_GAINED", intent.seat, "1"));
    }
    if (seat.hand.length === 0) {
      seat.finished = true;
      events.push(this.emit(state, "SEAT_FINISHED", intent.seat, "0"));
      this.resolveWinner(state, intent.seat, events);
      if (this.complete(state)) return this.accept(events);
    }
    let steps = 1;
    if (card.kind === "skip") steps = 2;
    if (card.kind === "reverse") { state.direction = state.direction === 1 ? -1 : 1; events.push(this.emit(state, "DIRECTION_CHANGED", intent.seat, String(state.direction))); }
    if (card.kind === "boost" || card.kind === "pulsePrism") {
      const target = this.nextActive(state, intent.seat, 1);
      this.drawPenalty(state, target, card.kind === "boost" ? 2 : 3, events);
      steps = 2;
    }
    this.advance(state, intent.seat, steps);
    return this.accept(events);
  }

  private draw(state: MatchState, seatIndex: number): IntentResult {
    this.seat(state, seatIndex).hand.push(this.drawOne(state));
    const events = [this.emit(state, "CARD_DRAWN", seatIndex, "1")];
    this.advance(state, seatIndex, 1);
    return this.accept(events);
  }

  private usePulse(state: MatchState, intent: PulseIntent): IntentResult {
    if (state.pulseUsedThisTurn[intent.seat]) return this.reject("PULSE_ALREADY_USED");
    const cost = intent.skill === "tune" ? 1 : intent.skill === "shield" ? 2 : 3;
    const pulseIndex = this.pulseIndex(state, intent.seat);
    if ((state.pulse[pulseIndex] ?? 0) < cost) return this.reject("PULSE_INSUFFICIENT");
    if (intent.skill === "retune") {
      const seat = this.seat(state, intent.seat);
      const index = seat.hand.findIndex(card => card.id === intent.cardId);
      const original = seat.hand[index];
      if (!original || original.color === "wild" || !intent.chosenColor || intent.chosenColor === "wild") return this.reject("RETUNE_TARGET_INVALID");
      const retuned: Card = { ...original, color: intent.chosenColor };
      if (!this.isLegal(state, retuned)) return this.reject("RETUNE_NOT_LEGAL");
      state.pulse[pulseIndex] = (state.pulse[pulseIndex] ?? 0) - cost;
      state.pulseUsedThisTurn[intent.seat] = true;
      seat.hand[index] = retuned;
      const spent = this.emit(state, "PULSE_SPENT", intent.seat, `retune:${cost}`);
      const played = this.play(state, { type: "play", seat: intent.seat, expectedSeq: state.seq, requestId: `${intent.requestId}:play`, cardId: retuned.id });
      return played.accepted ? this.accept([spent, ...played.events]) : played;
    }
    state.pulse[pulseIndex] = (state.pulse[pulseIndex] ?? 0) - cost;
    state.pulseUsedThisTurn[intent.seat] = true;
    if (intent.skill === "tune") state.tunedCardIds[intent.seat] = this.peek(state)?.id ?? null;
    if (intent.skill === "shield") this.seat(state, intent.seat).shielded = true;
    return this.accept([this.emit(state, "PULSE_SPENT", intent.seat, `${intent.skill}:${cost}`)]);
  }

  private buildDeck(): Card[] {
    const cards: Card[] = [];
    let id = 1;
    for (const color of COLORS) {
      cards.push({ id: id++, color, kind: "number", value: 0 });
      for (let value = 1; value <= 9; value++) for (let copy = 0; copy < 2; copy++) cards.push({ id: id++, color, kind: "number", value });
      for (const kind of ["skip", "reverse", "boost"] as const) for (let copy = 0; copy < 2; copy++) cards.push({ id: id++, color, kind, value: -1 });
    }
    for (let i = 0; i < 4; i++) cards.push({ id: id++, color: "wild", kind: "prism", value: -1 });
    for (let i = 0; i < 4; i++) cards.push({ id: id++, color: "wild", kind: "pulsePrism", value: -1 });
    return cards;
  }

  private shuffle(cards: Card[], seed: bigint): void {
    const rng = new DeterministicRng(seed);
    for (let i = cards.length - 1; i > 0; i--) { const j = rng.next(i + 1); const a = cards[i]; const b = cards[j]; if (a && b) { cards[i] = b; cards[j] = a; } }
  }
  private takeRaw(state: MatchState): Card { const card = state.drawPile.pop(); if (!card) throw new Error("EMPTY_DRAW_PILE"); return card; }
  private drawOne(state: MatchState): Card { if (state.drawPile.length === 0) this.recycle(state); return this.takeRaw(state); }
  private peek(state: MatchState): Card | null { if (state.drawPile.length === 0) this.recycle(state); return state.drawPile.at(-1) ?? null; }
  private recycle(state: MatchState): void {
    if (state.discardPile.length <= 1) throw new Error("NO_CARDS_TO_RECYCLE");
    const top = state.discardPile.pop(); if (!top) throw new Error("MISSING_TOP");
    const recycled = state.discardPile.splice(0); state.discardPile.push(top);
    this.shuffle(recycled, state.seed ^ BigInt(state.seq) ^ 0x9e3779b97f4a7c15n); state.drawPile.push(...recycled);
  }
  private drawPenalty(state: MatchState, target: number, initialAmount: number, events: MatchEvent[]): void {
    let amount = initialAmount; const seat = this.seat(state, target);
    if (seat.shielded) { amount = Math.max(0, amount - 2); seat.shielded = false; events.push(this.emit(state, "SHIELD_USED", target, "2")); }
    for (let i = 0; i < amount; i++) seat.hand.push(this.drawOne(state));
    if (amount > 0) events.push(this.emit(state, "PENALTY_DRAW", target, String(amount)));
  }
  private resolveWinner(state: MatchState, seatIndex: number, events: MatchEvent[]): void {
    if (state.mode === "classic") { state.winningSeat = seatIndex; events.push(this.emit(state, "MATCH_WON", seatIndex, `seat:${seatIndex}`)); return; }
    const team = seatIndex % 2;
    if (state.seats.filter(s => s.seat % 2 === team).every(s => s.finished)) { state.winningTeam = team; events.push(this.emit(state, "MATCH_WON", seatIndex, `team:${team}`)); }
  }
  private resultFor(state: MatchState): MatchResult | null {
    if (state.winningSeat === null && state.winningTeam === null) return null;
    const remaining = state.seats.map(seat => ({
      seat: seat.seat,
      team: state.mode === "teams2v2" ? seat.seat % 2 : null,
      remainingRisk: seat.hand.reduce((sum, card) => sum + riskOf(card), 0),
    }));
    if (state.mode === "classic" && state.winningSeat !== null) {
      const winningScore = remaining.reduce((sum, entry) => entry.seat === state.winningSeat ? sum : sum + entry.remainingRisk, 0);
      const ordered = [...remaining].sort((left, right) => {
        if (left.seat === state.winningSeat) return -1;
        if (right.seat === state.winningSeat) return 1;
        return left.remainingRisk - right.remainingRisk || left.seat - right.seat;
      });
      return {
        mode: "classic",
        winningSeat: state.winningSeat,
        winningTeam: null,
        entries: ordered.map((entry, index) => ({
          ...entry,
          rank: index + 1,
          roundScore: entry.seat === state.winningSeat ? winningScore : 0,
          pulseReward: [3, 2, 1, 0][index] ?? 0,
        })),
      };
    }
    if (state.mode !== "teams2v2" || state.winningTeam === null) return null;
    const losingTeam = state.winningTeam === 0 ? 1 : 0;
    const winningScore = remaining.reduce((sum, entry) => entry.team === losingTeam ? sum + entry.remainingRisk : sum, 0);
    const ordered = [...remaining].sort((left, right) => {
      const leftRank = left.team === state.winningTeam ? 1 : 2;
      const rightRank = right.team === state.winningTeam ? 1 : 2;
      return leftRank - rightRank || left.remainingRisk - right.remainingRisk || left.seat - right.seat;
    });
    return {
      mode: "teams2v2",
      winningSeat: null,
      winningTeam: state.winningTeam,
      entries: ordered.map(entry => ({
        ...entry,
        rank: entry.team === state.winningTeam ? 1 : 2,
        roundScore: entry.team === state.winningTeam ? winningScore : 0,
        pulseReward: entry.team === state.winningTeam ? 3 : 1,
      })),
    };
  }
  private pulseIndex(state: MatchState, seat: number): number { return state.mode === "classic" ? seat : seat % 2; }
  private nextActive(state: MatchState, from: number, steps: number): number {
    let current = from;
    for (let step = 0; step < steps; step++) { do { current = (current + state.direction + 4) % 4; } while (this.seat(state, current).finished && !this.complete(state)); }
    return current;
  }
  private advance(state: MatchState, from: number, steps: number): void { state.pulseUsedThisTurn[from] = false; state.currentSeat = this.nextActive(state, from, steps); }
  private top(state: MatchState): Card { const card = state.discardPile.at(-1); if (!card) throw new Error("MISSING_TOP"); return card; }
  private seat(state: MatchState, seat: number) { const found = state.seats[seat]; if (!found) throw new Error("INVALID_SEAT"); return found; }
  private complete(state: MatchState): boolean { return state.winningSeat !== null || state.winningTeam !== null; }
  private emit(state: MatchState, type: string, actorSeat: number, detail: string): MatchEvent { state.seq++; return { seq: state.seq, type, actorSeat, detail }; }
  private reject(code: string): IntentResult { return { accepted: false, code, events: [] }; }
  private accept(events: readonly MatchEvent[]): IntentResult { return { accepted: true, code: "OK", events }; }
}

export { riskOf };
