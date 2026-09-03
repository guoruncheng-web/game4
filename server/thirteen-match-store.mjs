const GAME_SLUG = 'thirteen';

function publicUid(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 100000 && parsed <= 999999 ? parsed : null;
}

function sanitizedResult(result) {
  return {
    winnerSeat: result.winnerSeat,
    matchNumber: result.matchNumber,
    entries: result.entries.map(({ rank, seat, remaining, delta, wagerDelta, cong }) => ({
      rank,
      seat,
      remaining,
      delta,
      ...(wagerDelta === undefined ? {} : { wagerDelta }),
      cong,
    })),
  };
}

/**
 * Append-only, idempotent archive for completed authoritative matches.
 * Internal user ids live only in the player join table and never enter result/actions JSON.
 */
export function createThirteenMatchStore(sql) {
  async function persistCompletedMatches(rawAudits) {
    const audits = Array.from(new Map(rawAudits.map((audit) => [
      `${audit.roomId}:${audit.matchNumber}`,
      audit,
    ])).values());
    if (audits.length === 0) return;

    await sql.begin(async (transaction) => {
      for (const audit of audits) {
        const inserted = await transaction`
          insert into thirteen_matches
            (room_id, match_number, rules_version, economy_mode, commitment_version,
             deal_commitment, seed_reveal, deal_nonce_reveal, result, actions, completed_at)
          values (
            ${audit.roomId}, ${audit.matchNumber}, ${String(audit.rulesVersion)}, ${audit.economyMode},
            ${audit.dealCommitmentVersion}, ${audit.dealCommitment}, ${audit.seedReveal},
            ${audit.dealNonceReveal}, ${transaction.json(sanitizedResult(audit.result))},
            ${transaction.json(audit.actions)}, ${new Date(audit.completedAt)}
          )
          on conflict (room_id, match_number) do nothing
          returning id
        `;
        const existing = inserted[0] ? inserted : await transaction`
          select id from thirteen_matches
          where room_id = ${audit.roomId} and match_number = ${audit.matchNumber}
          limit 1
        `;
        const matchId = existing[0]?.id;
        if (!matchId) throw new Error('THIRTEEN_MATCH_ARCHIVE_ID_MISSING');

        for (const player of audit.players) {
          const activeUsers = await transaction`
            select id, uid from users where id = ${Number(player.userId)} limit 1
          `;
          const activeUser = activeUsers[0] ?? null;
          await transaction`
            insert into thirteen_match_players
              (match_id, seat, user_id, public_uid, display_name, avatar)
            values (
              ${matchId}, ${player.seat}, ${activeUser?.id ?? null},
              ${activeUser ? publicUid(activeUser.uid) : null},
              ${activeUser ? player.displayName : '已注销玩家'}, ${activeUser ? player.avatar : ''}
            )
            on conflict (match_id, seat) do nothing
          `;
        }
      }
    });
  }

  return { gameSlug: GAME_SLUG, persistCompletedMatches };
}
