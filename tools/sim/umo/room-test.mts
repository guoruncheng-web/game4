import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { Card, CardColor, MatchMode, SeatView } from '../../../server/umo/domain';
import { AuthoritativeGateway } from '../../../server/umo/gateway';
import { UmoWsAdapter } from '../../../server/umo/ws-adapter';

interface Envelope {
    readonly protocolVersion: number;
    readonly type: string;
    readonly requestId: string;
    readonly payload: Record<string, unknown>;
}

interface Waiter {
    readonly type: string;
    readonly resolve: (message: Envelope) => void;
    readonly reject: (error: Error) => void;
    readonly timer: ReturnType<typeof setTimeout>;
}

class Peer {
    private readonly queue: Envelope[] = [];
    private readonly waiters: Waiter[] = [];
    readonly socket: WebSocket;

    private constructor(socket: WebSocket) {
        this.socket = socket;
        socket.on('message', (raw): void => this.receive(raw));
    }

    static async connect(url: string): Promise<Peer> {
        const socket = new WebSocket(url);
        await new Promise<void>((resolve, reject) => {
            socket.once('open', () => resolve());
            socket.once('error', reject);
        });
        return new Peer(socket);
    }

    send(type: string, requestId: string, payload: Record<string, unknown>): void {
        this.socket.send(JSON.stringify({ protocolVersion: 1, type, requestId, payload }));
    }

    wait(type: string, timeoutMs = 3000): Promise<Envelope> {
        const queuedIndex = this.queue.findIndex((message) => message.type === type);
        if (queuedIndex >= 0) return Promise.resolve(this.queue.splice(queuedIndex, 1)[0] as Envelope);
        return new Promise<Envelope>((resolve, reject) => {
            const timer = setTimeout(() => {
                const index = this.waiters.findIndex((waiter) => waiter.timer === timer);
                if (index >= 0) this.waiters.splice(index, 1);
                reject(new Error(`TIMEOUT_WAITING_FOR_${type}`));
            }, timeoutMs);
            this.waiters.push({ type, resolve, reject, timer });
        });
    }

    async close(): Promise<void> {
        if (this.socket.readyState === WebSocket.CLOSED) return;
        const closed = new Promise<void>((resolve) => this.socket.once('close', () => resolve()));
        this.socket.close(1000, 'full-match-recovery');
        const forceClose = setTimeout(() => this.socket.terminate(), 1_000);
        await closed;
        clearTimeout(forceClose);
    }

    private receive(raw: RawData): void {
        const message = JSON.parse(raw.toString()) as Envelope;
        const index = this.waiters.findIndex((waiter) => waiter.type === message.type);
        if (index < 0) {
            this.queue.push(message);
            return;
        }
        const waiter = this.waiters.splice(index, 1)[0];
        if (!waiter) return;
        clearTimeout(waiter.timer);
        waiter.resolve(message);
    }
}

const codes = ['310245', '864209', '579024'];
let codeIndex = 0;
let tokenIndex = 0;
let authoritativeNow = 0;
let persistedSnapshots = 0;
const gateway = new AuthoritativeGateway({
    roomCodeFactory: () => codes[codeIndex++] ?? '999999',
    tokenFactory: () => `full-match-recovery-${tokenIndex++}`,
    now: () => authoritativeNow,
});
const server = createServer();
const wss = new WebSocketServer({ server });
const adapter = new UmoWsAdapter(gateway, {
    automationTickMs: 10,
    onGatewayChanged: () => { persistedSnapshots += 1; },
});
wss.on('connection', (socket): void => adapter.attach(socket));
await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert.ok(address && typeof address !== 'string');
const service = {
    url: `ws://127.0.0.1:${address.port}`,
    close: async (): Promise<void> => {
        adapter.destroy();
        for (const socket of wss.clients) socket.terminate();
        await new Promise<void>((resolve) => wss.close(() => resolve()));
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
};

try {
    const classic = await runMatch('classic');
    const teams = await runMatch('teams2v2');
    const automation = await runAutomationScheduler();
    assert.ok(persistedSnapshots > 0);
    console.log(JSON.stringify({
        transport: 'ws',
        classic,
        teams2v2: teams,
        automation,
        persistedSnapshots,
        failures: [],
    }, null, 2));
} finally {
    await service.close();
}

async function runAutomationScheduler(): Promise<Record<string, unknown>> {
    authoritativeNow = 0;
    const peers = [await Peer.connect(service.url)];
    const creatorWelcomePromise = peers[0].wait('WELCOME');
    peers[0].send('CREATE', 'automation:create', { anonymousId: 'automation:0', clientBuild: 'host-scheduler', mode: 'classic' });
    const creatorWelcome = await creatorWelcomePromise;
    const roomCode = creatorWelcome.payload.roomCode as string;
    for (let seat = 1; seat < 4; seat += 1) {
        const peer = await Peer.connect(service.url);
        peers.push(peer);
        const welcome = peer.wait('WELCOME');
        peer.send('JOIN', `automation:join:${seat}`, { roomCode, anonymousId: `automation:${seat}`, clientBuild: 'host-scheduler' });
        await welcome;
    }
    await Promise.all(peers.map(async (peer, seat) => {
        const ready = peer.wait('READY_RESULT');
        peer.send('READY', `automation:ready:${seat}`, { roomCode, ready: true });
        assert.equal((await ready).payload.accepted, true);
    }));

    const warningPromises = peers.map((peer) => peer.wait('TURN_TIMER'));
    authoritativeNow = 15_000;
    const warnings = await Promise.all(warningPromises);
    assert.ok(warnings.every((message) => message.payload.remainingMs === 5_000));

    const snapshotPromises = peers.map((peer) => peer.wait('SNAPSHOT'));
    authoritativeNow = 20_000;
    const snapshots = await Promise.all(snapshotPromises);
    const automation = snapshots[0]?.payload.automation as { seat?: number; reason?: string; timeoutTurns?: number } | undefined;
    assert.equal(automation?.reason, 'timeout');
    assert.equal(automation?.timeoutTurns, 1);
    assert.ok(snapshots.every((message) => (message.payload.tail as Array<{ type?: string }>).some((event) => event.type === 'BOT_ACTION')));
    await Promise.all(peers.map((peer) => peer.close()));
    return {
        roomCode,
        warnings: warnings.length,
        botSnapshots: snapshots.length,
        reason: automation.reason,
        timeoutTurns: automation.timeoutTurns,
    };
}

async function runMatch(mode: MatchMode): Promise<Record<string, unknown>> {
    const peers: Array<Peer | null> = [await Peer.connect(service.url)];
    const first = peers[0];
    assert.ok(first);
    const welcomePromise = first.wait('WELCOME');
    first.send('CREATE', `${mode}:create`, { anonymousId: `${mode}:0`, clientBuild: 'full-match', mode });
    const creatorWelcome = await welcomePromise;
    const roomCode = creatorWelcome.payload.roomCode as string;
    const welcomes = [creatorWelcome];

    for (let seat = 1; seat < 4; seat += 1) {
        const peer = await Peer.connect(service.url);
        peers.push(peer);
        const welcome = peer.wait('WELCOME');
        peer.send('JOIN', `${mode}:join:${seat}`, { roomCode, anonymousId: `${mode}:${seat}`, clientBuild: 'full-match' });
        welcomes.push(await welcome);
    }

    const recoveryTokens = welcomes.map((message) => message.payload.recoveryToken as string);
    const views = welcomes.map((message) => message.payload.view as unknown as SeatView);
    assert.deepEqual(views.map((view) => view.private.seat), [0, 1, 2, 3]);
    assert.ok(views.every((view) => view.public.mode === mode && view.private.hand.length === 7));
    assert.ok(views.every((view) => view.public.seats.every((seat) => !Object.prototype.hasOwnProperty.call(seat, 'hand'))));

    await Promise.all(peers.map(async (peer, seat) => {
        assert.ok(peer);
        const ready = peer.wait('READY_RESULT');
        peer.send('READY', `${mode}:ready:${seat}`, { roomCode, ready: true });
        assert.equal((await ready).payload.accepted, true);
    }));

    let turns = 0;
    let recoveryTail = -1;
    while (!complete(views[0]) && turns < 1000) {
        if (turns === 3 && recoveryTail < 0) {
            const currentSeat = views[0]?.public.currentSeat ?? 0;
            const droppedSeat = (currentSeat + 1) % 4;
            const dropped = peers[droppedSeat];
            assert.ok(dropped);
            const afterSeq = views[droppedSeat]?.public.seq ?? 0;
            await dropped.close();
            peers[droppedSeat] = null;
            await takeTurn(peers, views, roomCode, mode, turns);
            turns += 1;

            const recoveredPeer = await Peer.connect(service.url);
            peers[droppedSeat] = recoveredPeer;
            const snapshot = recoveredPeer.wait('SNAPSHOT');
            recoveredPeer.send('RESUME', `${mode}:resume:${droppedSeat}`, {
                roomCode,
                recoveryToken: recoveryTokens[droppedSeat],
                afterSeq,
            });
            const recovered = await snapshot;
            recoveryTail = (recovered.payload.tail as unknown[]).length;
            views[droppedSeat] = recovered.payload.view as unknown as SeatView;
            assert.ok(recoveryTail >= 1);
            continue;
        }
        await takeTurn(peers, views, roomCode, mode, turns);
        turns += 1;
    }

    assert.ok(turns < 1000, `${mode}:MATCH_DID_NOT_FINISH`);
    assert.ok(views.every((view) => view.public.seq === views[0]?.public.seq));
    if (mode === 'classic') {
        assert.notEqual(views[0]?.public.winningSeat, null);
        assert.equal(views[0]?.public.winningTeam, null);
    } else {
        assert.equal(views[0]?.public.winningSeat, null);
        assert.ok(views[0]?.public.winningTeam === 0 || views[0]?.public.winningTeam === 1);
        assert.ok(views.every((view) => view.public.pulse.length === 2));
    }
    await Promise.all(peers.map(async (peer) => peer?.close()));
    return {
        mode,
        roomCode,
        turns,
        finalSeq: views[0]?.public.seq,
        winningSeat: views[0]?.public.winningSeat,
        winningTeam: views[0]?.public.winningTeam,
        recoveryTail,
        privateHandsIsolated: true,
    };
}

async function takeTurn(peers: Array<Peer | null>, views: SeatView[], roomCode: string, mode: MatchMode, turn: number): Promise<void> {
    const currentSeat = views[0]?.public.currentSeat;
    assert.notEqual(currentSeat, undefined);
    const actor = peers[currentSeat as number];
    const view = views[currentSeat as number];
    assert.ok(actor && view);
    const card = chooseCard(view);
    const requestId = `${mode}:turn:${turn}`;
    const actorResult = actor.wait('INTENT_RESULT');
    const peerSnapshots = peers.map((peer, seat) => seat !== currentSeat && peer ? peer.wait('SNAPSHOT') : null);
    actor.send('INTENT', requestId, {
        roomCode,
        matchId: view.public.matchId,
        expectedSeq: view.public.seq,
        intent: card
            ? { type: 'play', cardId: card.id, ...(card.color === 'wild' ? { chosenColor: bestColor(view.private.hand) } : {}) }
            : { type: 'draw' },
    });
    const result = await actorResult;
    assert.equal(result.payload.accepted, true, `${mode}:${turn}:${String(result.payload.code)}`);
    views[currentSeat as number] = result.payload.view as unknown as SeatView;
    await Promise.all(peerSnapshots.map(async (snapshot, seat) => {
        if (!snapshot) return;
        views[seat] = (await snapshot).payload.view as unknown as SeatView;
    }));
}

function chooseCard(view: SeatView): Card | null {
    const top = view.public.topCard;
    const candidates = view.private.hand.filter((card) => {
        const legal = card.color === 'wild' || card.color === view.public.activeColor || symbol(card) === symbol(top);
        if (!legal) return false;
        return card.kind !== 'pulsePrism' || !view.private.hand.some((other) => other.id !== card.id && other.color === view.public.activeColor);
    });
    return [...candidates].sort((a, b) => risk(b) - risk(a) || a.id - b.id)[0] ?? null;
}

function symbol(card: Card): string {
    return card.kind === 'number' ? String(card.value) : card.kind;
}

function risk(card: Card): number {
    return card.kind === 'number' ? card.value : card.kind === 'prism' || card.kind === 'pulsePrism' ? 50 : 20;
}

function bestColor(hand: readonly Card[]): Exclude<CardColor, 'wild'> {
    const colors: Array<Exclude<CardColor, 'wild'>> = ['coral', 'amber', 'aqua', 'violet'];
    return colors.map((color) => ({ color, count: hand.filter((card) => card.color === color).length }))
        .sort((a, b) => b.count - a.count || colors.indexOf(a.color) - colors.indexOf(b.color))[0]?.color ?? 'coral';
}

function complete(view: SeatView | undefined): boolean {
    return view !== undefined && (view.public.winningSeat !== null || view.public.winningTeam !== null);
}
