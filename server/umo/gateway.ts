import { randomInt, randomUUID } from 'node:crypto';
import type { AutomationReason, CardColor, MatchMode, PlayerIntent, PulseSkill, TeamEmote } from './domain';
import { AuthoritativeRoom, PROTOCOL_VERSION } from './room';

type GatewayType = 'WELCOME' | 'SNAPSHOT' | 'INTENT_RESULT' | 'LOBBY' | 'READY_RESULT' | 'EMOTE' | 'TURN_TIMER' | 'ERROR' | 'PONG';
const TEAM_EMOTE_COOLDOWN_MS = 5_000;
export const TURN_WARNING_MS = 15_000;
export const TURN_TIMEOUT_MS = 20_000;
export const RESTART_RECOVERY_GRACE_MS = 5_000;

export interface GatewayEnvelope {
    readonly protocolVersion: number;
    readonly type: GatewayType;
    readonly requestId: string;
    readonly payload: unknown;
}

export interface GatewayResponse {
    readonly connectionId: string;
    readonly envelope: GatewayEnvelope;
}

export interface GatewayTick {
    readonly responses: readonly GatewayResponse[];
    readonly changed: boolean;
}

interface SeatSession {
    readonly seat: number;
    readonly recoveryToken: string;
    connectionId: string | null;
    ready: boolean;
    lastEmoteAt: number | null;
    disconnectedAt: number | null;
    timeoutTurns: number;
}

interface RoomSession {
    readonly code: string;
    room: AuthoritativeRoom;
    readonly seats: SeatSession[];
    started: boolean;
    round: number;
    lastLifecycle: { readonly type: 'REMATCH' | 'RETURN_LOBBY'; readonly matchId: string; readonly seq: number } | null;
    turnStartedAt: number | null;
    warningSeq: number | null;
    automationIndex: number;
    automationNotBefore: number;
}

interface DurableGatewaySnapshot {
    readonly version: 1;
    readonly rooms: readonly {
        readonly code: string;
        readonly room: string;
        readonly seats: readonly {
            readonly seat: number;
            readonly recoveryToken: string;
            readonly ready: boolean;
            readonly lastEmoteAt?: number | null;
            readonly disconnectedAt?: number | null;
            readonly timeoutTurns?: number;
        }[];
        readonly started: boolean;
        readonly round?: number;
        readonly lastLifecycle?: { readonly type: 'REMATCH' | 'RETURN_LOBBY'; readonly matchId: string; readonly seq: number } | null;
        readonly turnStartedAt?: number | null;
        readonly warningSeq?: number | null;
        readonly automationIndex?: number;
        readonly automationNotBefore?: number;
    }[];
}

export interface GatewayOptions {
    readonly tokenFactory?: () => string;
    readonly roomCodeFactory?: () => string;
    readonly now?: () => number;
}

export class AuthoritativeGateway {
    private readonly rooms = new Map<string, RoomSession>();
    private readonly connectionRooms = new Map<string, string>();
    private readonly tokenFactory: () => string;
    private readonly roomCodeFactory: () => string;
    private readonly now: () => number;

    public constructor(options: GatewayOptions = {}) {
        this.tokenFactory = options.tokenFactory ?? randomUUID;
        this.roomCodeFactory = options.roomCodeFactory ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0'));
        this.now = options.now ?? Date.now;
    }

    public snapshotJson(): string {
        const snapshot: DurableGatewaySnapshot = {
            version: 1,
            rooms: [...this.rooms.values()].map((session) => ({
                code: session.code,
                room: session.room.durableSnapshotJson(),
                seats: session.seats.map((seat) => ({
                    seat: seat.seat,
                    recoveryToken: seat.recoveryToken,
                    ready: seat.ready,
                    lastEmoteAt: seat.lastEmoteAt,
                    disconnectedAt: seat.disconnectedAt,
                    timeoutTurns: seat.timeoutTurns,
                })),
                started: session.started,
                round: session.round,
                lastLifecycle: session.lastLifecycle,
                turnStartedAt: session.turnStartedAt,
                warningSeq: session.warningSeq,
                automationIndex: session.automationIndex,
                automationNotBefore: session.automationNotBefore,
            })),
        };
        return JSON.stringify(snapshot);
    }

    public static restore(json: string, options: GatewayOptions = {}): AuthoritativeGateway {
        const snapshot = JSON.parse(json) as DurableGatewaySnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.rooms)) throw new Error('GATEWAY_SNAPSHOT_INVALID');
        const gateway = new AuthoritativeGateway(options);
        for (const stored of snapshot.rooms) {
            if (!/^\d{6}$/.test(stored.code) || !Array.isArray(stored.seats)) throw new Error('GATEWAY_SNAPSHOT_INVALID');
            const room = AuthoritativeRoom.restoreDurable(stored.room);
            for (const stateSeat of room.state.seats) stateSeat.connected = false;
            gateway.rooms.set(stored.code, {
                code: stored.code,
                room,
                seats: stored.seats.map((seat: DurableGatewaySnapshot['rooms'][number]['seats'][number]) => ({
                    ...seat,
                    lastEmoteAt: seat.lastEmoteAt ?? null,
                    disconnectedAt: seat.disconnectedAt ?? gateway.now(),
                    timeoutTurns: seat.timeoutTurns ?? 0,
                    connectionId: null,
                })),
                started: stored.started,
                round: stored.round ?? 0,
                lastLifecycle: stored.lastLifecycle ?? null,
                turnStartedAt: stored.turnStartedAt ?? (stored.started ? gateway.now() : null),
                warningSeq: stored.warningSeq ?? null,
                automationIndex: stored.automationIndex ?? 0,
                automationNotBefore: Math.max(stored.automationNotBefore ?? 0, gateway.now() + RESTART_RECOVERY_GRACE_MS),
            });
        }
        return gateway;
    }

    public handle(connectionId: string, raw: unknown): readonly GatewayResponse[] {
        if (!isRecord(raw) || typeof raw.type !== 'string' || typeof raw.requestId !== 'string' || !isRecord(raw.payload)) {
            return [this.error(connectionId, 'unknown', 'MALFORMED_ENVELOPE', false)];
        }
        if (raw.protocolVersion !== PROTOCOL_VERSION) {
            return [this.error(connectionId, raw.requestId, 'PROTOCOL_VERSION_INCOMPATIBLE', false)];
        }
        if (raw.type === 'JOIN') return this.join(connectionId, raw.requestId, raw.payload);
        if (raw.type === 'CREATE') return this.create(connectionId, raw.requestId, raw.payload);
        if (raw.type === 'RESUME') return this.resume(connectionId, raw.requestId, raw.payload);
        if (raw.type === 'INTENT') return this.intent(connectionId, raw.requestId, raw.payload);
        if (raw.type === 'REMATCH') return this.rematch(connectionId, raw.requestId, raw.payload);
        if (raw.type === 'RETURN_LOBBY') return this.returnLobby(connectionId, raw.requestId, raw.payload);
        if (raw.type === 'READY') return this.ready(connectionId, raw.requestId, raw.payload);
        if (raw.type === 'EMOTE') return this.emote(connectionId, raw.requestId, raw.payload);
        if (raw.type === 'PING') {
            const sentAt = typeof raw.payload.sentAt === 'number' ? raw.payload.sentAt : 0;
            return [this.response(connectionId, 'PONG', raw.requestId, { sentAt, serverAt: Date.now() })];
        }
        return [this.error(connectionId, raw.requestId, 'UNKNOWN_MESSAGE_TYPE', false)];
    }

    public disconnect(connectionId: string): readonly GatewayResponse[] {
        const roomCode = this.connectionRooms.get(connectionId);
        if (!roomCode) return [];
        const session = this.rooms.get(roomCode);
        const seat = session?.seats.find((candidate) => candidate.connectionId === connectionId);
        if (seat && session) {
            seat.connectionId = null;
            seat.disconnectedAt = this.now();
            const stateSeat = session.room.state.seats[seat.seat];
            if (stateSeat) stateSeat.connected = false;
        }
        this.connectionRooms.delete(connectionId);
        return session ? [...this.lobbyBroadcast(session, `disconnect:${connectionId}`), ...this.tick().responses] : [];
    }

    public tick(): GatewayTick {
        const responses: GatewayResponse[] = [];
        let changed = false;
        const now = this.now();
        for (const session of this.rooms.values()) {
            if (!session.started || session.room.state.winningSeat !== null || session.room.state.winningTeam !== null) continue;
            if (session.turnStartedAt === null) {
                session.turnStartedAt = now;
                changed = true;
            }
            const currentSeat = session.room.state.currentSeat;
            const seat = session.seats[currentSeat];
            if (!seat) continue;
            const disconnected = seat.connectionId === null;
            if (now >= session.automationNotBefore && (disconnected || now - session.turnStartedAt >= TURN_TIMEOUT_MS)) {
                responses.push(...this.automateTurn(session, disconnected ? 'disconnect' : 'timeout'));
                changed = true;
                continue;
            }
            if (!disconnected && now - session.turnStartedAt >= TURN_WARNING_MS && session.warningSeq !== session.room.state.seq) {
                session.warningSeq = session.room.state.seq;
                changed = true;
                responses.push(...session.seats.flatMap((peer) => peer.connectionId
                    ? [this.response(peer.connectionId, 'TURN_TIMER', `timer:${session.code}:${session.room.state.seq}`, {
                        roomCode: session.code,
                        seat: currentSeat,
                        seq: session.room.state.seq,
                        remainingMs: TURN_TIMEOUT_MS - TURN_WARNING_MS,
                    })]
                    : []));
            }
        }
        return { responses, changed };
    }

    private join(connectionId: string, requestId: string, payload: Record<string, unknown>): readonly GatewayResponse[] {
        const roomCode = typeof payload.roomCode === 'string' ? payload.roomCode : '';
        if (!/^\d{6}$/.test(roomCode)) return [this.error(connectionId, requestId, 'ROOM_CODE_INVALID', false)];
        const session = this.rooms.get(roomCode) ?? this.createRoom(roomCode);
        if (session.seats.length >= 4) return [this.error(connectionId, requestId, 'ROOM_FULL', true)];
        const seat = session.seats.length;
        const seatSession: SeatSession = {
            seat,
            recoveryToken: this.tokenFactory(),
            connectionId,
            ready: false,
            lastEmoteAt: null,
            disconnectedAt: null,
            timeoutTurns: 0,
        };
        session.seats.push(seatSession);
        this.connectionRooms.set(connectionId, roomCode);
        return [this.response(connectionId, 'WELCOME', requestId, {
            roomCode,
            seat,
            recoveryToken: seatSession.recoveryToken,
            view: session.room.viewFor(seat),
        }), ...this.lobbyBroadcast(session, requestId)];
    }

    private create(connectionId: string, requestId: string, payload: Record<string, unknown>): readonly GatewayResponse[] {
        if (typeof payload.anonymousId !== 'string' || typeof payload.clientBuild !== 'string') {
            return [this.error(connectionId, requestId, 'CREATE_ENVELOPE_INVALID', false)];
        }
        const mode = normalizeMatchMode(payload.mode);
        if (payload.mode !== undefined && !mode) {
            return [this.error(connectionId, requestId, 'MATCH_MODE_INVALID', false)];
        }
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const roomCode = this.roomCodeFactory();
            if (/^\d{6}$/.test(roomCode) && !this.rooms.has(roomCode)) {
                this.createRoom(roomCode, mode ?? 'classic');
                return this.join(connectionId, requestId, { ...payload, roomCode });
            }
        }
        return [this.error(connectionId, requestId, 'ROOM_CODE_ALLOCATION_FAILED', true)];
    }

    private resume(connectionId: string, requestId: string, payload: Record<string, unknown>): readonly GatewayResponse[] {
        const roomCode = typeof payload.roomCode === 'string' ? payload.roomCode : '';
        const token = typeof payload.recoveryToken === 'string' ? payload.recoveryToken : '';
        const afterSeq = Number.isInteger(payload.afterSeq) ? Number(payload.afterSeq) : -1;
        const session = this.rooms.get(roomCode);
        const seat = session?.seats.find((candidate) => candidate.recoveryToken === token);
        if (!session || !seat || afterSeq < 0) return [this.error(connectionId, requestId, 'RECOVERY_TOKEN_INVALID', false)];
        if (seat.connectionId) this.connectionRooms.delete(seat.connectionId);
        seat.connectionId = connectionId;
        seat.disconnectedAt = null;
        this.connectionRooms.set(connectionId, roomCode);
        const stateSeat = session.room.state.seats[seat.seat];
        if (stateSeat) stateSeat.connected = true;
        const recovery = session.room.recover(seat.seat, afterSeq);
        return [this.response(connectionId, 'SNAPSHOT', requestId, {
            roomCode,
            seat: seat.seat,
            snapshotSeq: recovery.snapshotSeq,
            view: recovery.view,
            tail: recovery.tail,
        }), ...this.lobbyBroadcast(session, requestId)];
    }

    private ready(connectionId: string, requestId: string, payload: Record<string, unknown>): readonly GatewayResponse[] {
        const roomCode = this.connectionRooms.get(connectionId);
        const session = roomCode ? this.rooms.get(roomCode) : undefined;
        const seat = session?.seats.find((candidate) => candidate.connectionId === connectionId);
        if (!session || !seat) return [this.error(connectionId, requestId, 'SESSION_NOT_JOINED', false)];
        if (payload.roomCode !== roomCode || typeof payload.ready !== 'boolean') {
            return [this.error(connectionId, requestId, 'READY_ENVELOPE_INVALID', false)];
        }
        if (session.started) return [this.error(connectionId, requestId, 'MATCH_ALREADY_STARTED', false)];
        seat.ready = payload.ready;
        if (session.seats.length === 4 && session.seats.every((candidate) => candidate.ready && candidate.connectionId !== null)) {
            session.started = true;
            session.turnStartedAt = this.now();
            session.warningSeq = null;
            session.automationNotBefore = this.now();
        }
        return [this.response(connectionId, 'READY_RESULT', requestId, {
            accepted: true,
            ready: seat.ready,
            started: session.started,
        }), ...this.lobbyBroadcast(session, requestId)];
    }

    private intent(connectionId: string, requestId: string, payload: Record<string, unknown>): readonly GatewayResponse[] {
        const roomCode = this.connectionRooms.get(connectionId);
        const session = roomCode ? this.rooms.get(roomCode) : undefined;
        const seatSession = session?.seats.find((candidate) => candidate.connectionId === connectionId);
        if (!session || !seatSession) return [this.error(connectionId, requestId, 'SESSION_NOT_JOINED', false)];
        if (!session.started) return [this.error(connectionId, requestId, 'MATCH_NOT_STARTED', false)];
        if (
            payload.roomCode !== roomCode
            || payload.matchId !== session.room.state.matchId
            || !isRecord(payload.intent)
        ) return [this.error(connectionId, requestId, 'INTENT_ENVELOPE_INVALID', false)];
        const intent = this.normalizeIntent(payload.intent, seatSession.seat, this.scopedRequestId(seatSession.seat, requestId), payload.expectedSeq);
        if (!intent) return [this.error(connectionId, requestId, 'INTENT_INVALID', false)];
        const result = session.room.submit(intent);
        const responses: GatewayResponse[] = [this.response(connectionId, 'INTENT_RESULT', requestId, {
            accepted: result.accepted,
            code: result.code,
            events: result.events,
            view: session.room.viewFor(seatSession.seat),
        })];
        if (result.accepted) {
            seatSession.timeoutTurns = 0;
            this.resetTurnTimer(session);
            for (const peer of session.seats) {
                if (!peer.connectionId || peer.connectionId === connectionId) continue;
                responses.push(this.response(peer.connectionId, 'SNAPSHOT', requestId, {
                    roomCode,
                    seat: peer.seat,
                    snapshotSeq: session.room.state.seq,
                    view: session.room.viewFor(peer.seat),
                    tail: result.events,
                }));
            }
        }
        return responses;
    }

    private emote(connectionId: string, requestId: string, payload: Record<string, unknown>): readonly GatewayResponse[] {
        const roomCode = this.connectionRooms.get(connectionId);
        const session = roomCode ? this.rooms.get(roomCode) : undefined;
        const seat = session?.seats.find((candidate) => candidate.connectionId === connectionId);
        if (!session || !seat) return [this.error(connectionId, requestId, 'SESSION_NOT_JOINED', false)];
        if (!session.started) return [this.error(connectionId, requestId, 'MATCH_NOT_STARTED', false)];
        if (session.room.state.mode !== 'teams2v2') return [this.error(connectionId, requestId, 'EMOTE_TEAM_MODE_ONLY', false)];
        if (session.room.state.winningTeam !== null) return [this.error(connectionId, requestId, 'MATCH_COMPLETE', false)];
        const emote = normalizeTeamEmote(payload.emote);
        if (payload.roomCode !== roomCode || !emote) return [this.error(connectionId, requestId, 'EMOTE_INVALID', false)];
        const now = this.now();
        const elapsed = seat.lastEmoteAt === null ? TEAM_EMOTE_COOLDOWN_MS : now - seat.lastEmoteAt;
        if (elapsed < TEAM_EMOTE_COOLDOWN_MS) return [this.error(connectionId, requestId, 'EMOTE_COOLDOWN', true)];
        seat.lastEmoteAt = now;
        const payloadOut = { roomCode, seat: seat.seat, team: seat.seat % 2, emote, cooldownMs: TEAM_EMOTE_COOLDOWN_MS };
        return session.seats.flatMap((peer) => peer.connectionId && peer.seat % 2 === seat.seat % 2
            ? [this.response(peer.connectionId, 'EMOTE', requestId, payloadOut)]
            : []);
    }

    private rematch(connectionId: string, requestId: string, payload: Record<string, unknown>): readonly GatewayResponse[] {
        const validation = this.lifecycleSession(connectionId, requestId, payload, 'REMATCH');
        if ('error' in validation) return [validation.error];
        const { session, duplicate } = validation;
        if (duplicate) return this.snapshotBroadcast(session, requestId);
        session.lastLifecycle = { type: 'REMATCH', matchId: session.room.state.matchId, seq: session.room.state.seq };
        this.resetRoom(session);
        session.started = true;
        return this.snapshotBroadcast(session, requestId);
    }

    private returnLobby(connectionId: string, requestId: string, payload: Record<string, unknown>): readonly GatewayResponse[] {
        const validation = this.lifecycleSession(connectionId, requestId, payload, 'RETURN_LOBBY');
        if ('error' in validation) return [validation.error];
        const { session, duplicate } = validation;
        if (duplicate) return [...this.lobbyBroadcast(session, requestId), ...this.snapshotBroadcast(session, requestId)];
        session.lastLifecycle = { type: 'RETURN_LOBBY', matchId: session.room.state.matchId, seq: session.room.state.seq };
        this.resetRoom(session);
        session.started = false;
        for (const seat of session.seats) seat.ready = false;
        return [...this.lobbyBroadcast(session, requestId), ...this.snapshotBroadcast(session, requestId)];
    }

    private lifecycleSession(
        connectionId: string,
        requestId: string,
        payload: Record<string, unknown>,
        action: 'REMATCH' | 'RETURN_LOBBY',
    ): { readonly session: RoomSession; readonly duplicate: boolean } | { readonly error: GatewayResponse } {
        const roomCode = this.connectionRooms.get(connectionId);
        const session = roomCode ? this.rooms.get(roomCode) : undefined;
        const seat = session?.seats.find((candidate) => candidate.connectionId === connectionId);
        if (!session || !seat) return { error: this.error(connectionId, requestId, 'SESSION_NOT_JOINED', false) };
        if (payload.roomCode !== roomCode || !Number.isInteger(payload.expectedSeq)) {
            return { error: this.error(connectionId, requestId, 'MATCH_LIFECYCLE_ENVELOPE_INVALID', false) };
        }
        if (session.lastLifecycle
            && payload.matchId === session.lastLifecycle.matchId
            && payload.expectedSeq === session.lastLifecycle.seq) {
            return session.lastLifecycle.type === action
                ? { session, duplicate: true }
                : { error: this.error(connectionId, requestId, 'MATCH_LIFECYCLE_ALREADY_RESOLVED', false) };
        }
        if (
            payload.matchId !== session.room.state.matchId
            || payload.expectedSeq !== session.room.state.seq
        ) return { error: this.error(connectionId, requestId, 'MATCH_LIFECYCLE_ENVELOPE_INVALID', false) };
        if (!session.started) return { error: this.error(connectionId, requestId, 'MATCH_NOT_STARTED', false) };
        if (session.room.state.winningSeat === null && session.room.state.winningTeam === null) {
            return { error: this.error(connectionId, requestId, 'MATCH_NOT_FINISHED', false) };
        }
        return { session, duplicate: false };
    }

    private normalizeIntent(value: Record<string, unknown>, seat: number, requestId: string, expectedSeqValue: unknown): PlayerIntent | null {
        const expectedSeq = Number.isInteger(expectedSeqValue) ? Number(expectedSeqValue) : -1;
        if (expectedSeq < 0) return null;
        if (value.type === 'draw') return { type: 'draw', seat, expectedSeq, requestId };
        if (value.type === 'play' && Number.isInteger(value.cardId)) {
            const chosenColor = normalizeColor(value.chosenColor);
            return { type: 'play', seat, expectedSeq, requestId, cardId: Number(value.cardId), ...(chosenColor ? { chosenColor } : {}) };
        }
        if (value.type === 'pulse' && isPulseSkill(value.skill)) {
            const chosenColor = normalizeColor(value.chosenColor);
            return {
                type: 'pulse',
                seat,
                expectedSeq,
                requestId,
                skill: value.skill,
                ...(Number.isInteger(value.cardId) ? { cardId: Number(value.cardId) } : {}),
                ...(chosenColor ? { chosenColor } : {}),
            };
        }
        return null;
    }

    private createRoom(code: string, mode: MatchMode = 'classic'): RoomSession {
        const seed = BigInt(code);
        const session: RoomSession = {
            code,
            room: new AuthoritativeRoom(mode, seed),
            seats: [],
            started: false,
            round: 0,
            lastLifecycle: null,
            turnStartedAt: null,
            warningSeq: null,
            automationIndex: 0,
            automationNotBefore: 0,
        };
        this.rooms.set(code, session);
        return session;
    }

    private resetRoom(session: RoomSession): void {
        session.round += 1;
        const mode = session.room.state.mode;
        const seed = BigInt(session.code) + BigInt(session.round) * 1_000_003n;
        session.room = new AuthoritativeRoom(mode, seed);
        for (const stateSeat of session.room.state.seats) {
            stateSeat.connected = session.seats[stateSeat.seat]?.connectionId !== null;
        }
        for (const seat of session.seats) seat.timeoutTurns = 0;
        session.turnStartedAt = this.now();
        session.warningSeq = null;
        session.automationNotBefore = this.now();
    }

    private automateTurn(session: RoomSession, automation: AutomationReason): readonly GatewayResponse[] {
        const seatIndex = session.room.state.currentSeat;
        const seat = session.seats[seatIndex];
        if (!seat) return [];
        session.automationIndex += 1;
        const requestId = `bot:${session.code}:${session.room.state.matchId}:${session.automationIndex}`;
        const intent = session.room.botIntent(seatIndex, requestId, automation);
        const result = session.room.submit(intent);
        if (!result.accepted) throw new Error(`BOT_INTENT_REJECTED:${result.code}`);
        seat.timeoutTurns += 1;
        this.resetTurnTimer(session);
        return session.seats.flatMap((peer) => peer.connectionId
            ? [this.response(peer.connectionId, 'SNAPSHOT', requestId, {
                roomCode: session.code,
                seat: peer.seat,
                snapshotSeq: session.room.state.seq,
                view: session.room.viewFor(peer.seat),
                tail: result.events,
                automation: { seat: seatIndex, reason: automation, timeoutTurns: seat.timeoutTurns },
            })]
            : []);
    }

    private resetTurnTimer(session: RoomSession): void {
        session.turnStartedAt = session.room.state.winningSeat === null && session.room.state.winningTeam === null
            ? this.now()
            : null;
        session.warningSeq = null;
    }

    private snapshotBroadcast(session: RoomSession, requestId: string): readonly GatewayResponse[] {
        return session.seats.flatMap((seat) => seat.connectionId
            ? [this.response(seat.connectionId, 'SNAPSHOT', requestId, {
                roomCode: session.code,
                seat: seat.seat,
                snapshotSeq: session.room.state.seq,
                view: session.room.viewFor(seat.seat),
                tail: [],
            })]
            : []);
    }

    private lobbyBroadcast(session: RoomSession, requestId: string): readonly GatewayResponse[] {
        const payload = {
            roomCode: session.code,
            started: session.started,
            seats: session.seats.map((seat) => ({ seat: seat.seat, connected: seat.connectionId !== null, ready: seat.ready })),
        };
        return session.seats.flatMap((seat) => seat.connectionId
            ? [this.response(seat.connectionId, 'LOBBY', requestId, payload)]
            : []);
    }

    private scopedRequestId(seat: number, requestId: string): string {
        return `seat:${seat}:${requestId}`;
    }

    private response(connectionId: string, type: GatewayType, requestId: string, payload: unknown): GatewayResponse {
        return { connectionId, envelope: { protocolVersion: PROTOCOL_VERSION, type, requestId, payload } };
    }

    private error(connectionId: string, requestId: string, code: string, retryable: boolean): GatewayResponse {
        return this.response(connectionId, 'ERROR', requestId, { code, message: code, retryable });
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeColor(value: unknown): CardColor | undefined {
    return typeof value === 'string' && ['coral', 'amber', 'aqua', 'violet', 'wild'].includes(value)
        ? value as CardColor
        : undefined;
}

function isPulseSkill(value: unknown): value is PulseSkill {
    return typeof value === 'string' && ['tune', 'shield', 'retune'].includes(value);
}

function normalizeMatchMode(value: unknown): MatchMode | undefined {
    return value === 'classic' || value === 'teams2v2' ? value : undefined;
}

function normalizeTeamEmote(value: unknown): TeamEmote | undefined {
    return typeof value === 'string' && ['agree', 'caution', 'changeColor', 'almostDone'].includes(value)
        ? value as TeamEmote
        : undefined;
}
