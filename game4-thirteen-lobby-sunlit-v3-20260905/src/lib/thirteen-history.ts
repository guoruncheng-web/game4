import { getSql } from './db';

type MatchRow = {
  id: string | number;
  room_id: string;
  match_number: number;
  rules_version: string;
  economy_mode: string;
  commitment_version: string;
  deal_commitment: string;
  seed_reveal: string | number;
  deal_nonce_reveal: string;
  result: Record<string, unknown>;
  actions: unknown[];
  completed_at: string;
};

type PlayerRow = {
  match_id: string | number;
  seat: number;
  public_uid: number | null;
  display_name: string;
  avatar: string;
};

function appealCode(id: string | number): string {
  return `T13-${Number(id).toString(36).toUpperCase().padStart(8, '0')}`;
}

export async function getThirteenHistory(userId: number, requestedLimit = 20) {
  const sql = getSql();
  const limit = Math.max(1, Math.min(50, Math.trunc(requestedLimit) || 20));
  const matches = (await sql`
    select m.id, m.room_id, m.match_number, m.rules_version, m.economy_mode,
           m.commitment_version, m.deal_commitment, m.seed_reveal, m.deal_nonce_reveal,
           m.result, m.actions, m.completed_at
    from thirteen_matches m
    where exists (
      select 1 from thirteen_match_players self
      where self.match_id = m.id and self.user_id = ${userId}
    )
    order by m.completed_at desc, m.id desc
    limit ${limit}
  `) as MatchRow[];
  if (matches.length === 0) return [];

  const ids = matches.map((match) => Number(match.id));
  const players = (await sql`
    select match_id, seat, public_uid, display_name, avatar
    from thirteen_match_players
    where match_id in ${sql(ids)}
    order by match_id, seat
  `) as PlayerRow[];
  const playersByMatch = new Map<number, PlayerRow[]>();
  for (const player of players) {
    const matchId = Number(player.match_id);
    const group = playersByMatch.get(matchId) ?? [];
    group.push(player);
    playersByMatch.set(matchId, group);
  }

  return matches.map((match) => ({
    appealCode: appealCode(match.id),
    roomId: match.room_id,
    matchNumber: match.match_number,
    rulesVersion: match.rules_version,
    economyMode: match.economy_mode,
    completedAt: match.completed_at,
    players: (playersByMatch.get(Number(match.id)) ?? []).map((player) => ({
      seat: player.seat,
      uid: player.public_uid,
      displayName: player.display_name,
      avatar: player.avatar,
      deleted: player.public_uid === null,
    })),
    result: match.result,
    actions: match.actions,
    fairness: {
      algorithm: 'sha256',
      commitmentVersion: match.commitment_version,
      commitment: match.deal_commitment,
      seed: Number(match.seed_reveal),
      nonce: match.deal_nonce_reveal,
      canonicalInput: `${match.commitment_version}\n${match.room_id}\n${match.match_number}\n${Number(match.seed_reveal)}\n${match.deal_nonce_reveal}`,
    },
  }));
}
