export enum MatchStatus {
    SCHEDULED = 'scheduled',
    LIVE = 'live',
    COMPLETED = 'completed',
    ABANDONED = 'abandoned',
    UNKNOWN = 'unknown'
}

export interface NormalizedMatch {
    id: string; // Internal unique ID (Source:SourceMatchID)
    source: string;
    source_match_id: string;
    team_a: string;
    team_a_img?: string; // imageId
    team_b: string;
    team_b_img?: string; // imageId
    status: MatchStatus;
    start_time: number; // UTC timestamp
    provider_updated_at: number; // UTC timestamp from source
    ingested_at?: number; // Internal timestamp
    squads?: string; // JSON String
    lineups?: string; // JSON String
    scorecard?: string; // JSON String
    live_details?: string; // JSON String
    raw_payload?: string;
}

/**
 * ELITE FRESHNESS GUARD
 * Rules:
 * - Fresher provider_updated_at wins.
 * - If timestamps equal, lower priority wins (priority 1 > 2).
 * - Status Regression Guard: NEVER allow 'live' to be overwritten by 'scheduled'.
 */
export function shouldPreferIncoming(
    existing: { status: string; provider_updated_at: number; source_priority: number } | null,
    incoming: NormalizedMatch,
    incomingPriority: number
): boolean {
    if (!existing) return true;

    // 1. Status Regression Guard (Live -> Scheduled block)
    if (existing.status === MatchStatus.LIVE && incoming.status === MatchStatus.SCHEDULED) {
        return false;
    }

    // 2. Freshness check
    if (incoming.provider_updated_at > existing.provider_updated_at) {
        return true;
    }

    if (incoming.provider_updated_at < existing.provider_updated_at) {
        return false;
    }

    // 3. Priority check (Equal timestamps)
    // Higher priority (lower number) wins
    return incomingPriority < existing.source_priority;
}

export function normalizeMatch(raw: any, source: string): NormalizedMatch {
    const now = Math.floor(Date.now() / 1000);

    // Source A Mapper
    if (source === 'sourceA') {
        return {
            id: `sourceA:${raw.id}`,
            source: 'sourceA',
            source_match_id: String(raw.id),
            team_a: raw.home_team || 'Unknown',
            team_b: raw.away_team || 'Unknown',
            status: mapStatus(raw.match_status),
            start_time: Math.floor(new Date(raw.start_at).getTime() / 1000),
            provider_updated_at: raw.updated_at ? Math.floor(new Date(raw.updated_at).getTime() / 1000) : now,
            squads: raw.squads ? JSON.stringify(raw.squads) : undefined,
            lineups: raw.lineups ? JSON.stringify(raw.lineups) : undefined,
            scorecard: raw.scorecard ? JSON.stringify(raw.scorecard) : undefined,
            live_details: raw.live_details ? JSON.stringify(raw.live_details) : undefined,
            raw_payload: JSON.stringify(raw)
        };
    }

    // Source B Mapper (Cricbuzz-like or Relay)
    if (source === 'sourceB' || source === 'relay') {
        const rawId = String(raw.match_id || raw.id);
        const finalId = rawId.startsWith(`${source}:`) ? rawId : `${source}:${rawId}`;
        return {
            id: finalId,
            source: source,
            source_match_id: String(raw.match_id || raw.id),
            team_a: raw.team_a || raw.t1_name || 'TBA',
            team_a_img: String(raw.team_a_img || raw.t1_img || ''),
            team_b: raw.team_b || raw.t2_name || 'TBA',
            team_b_img: String(raw.team_b_img || raw.t2_img || ''),
            status: mapStatus(raw.status || raw.state || raw.match_status),
            start_time: raw.start_time || raw.timestamp || (raw.start_at ? Math.floor(new Date(raw.start_at).getTime() / 1000) : 0),
            provider_updated_at: raw.provider_updated_at || raw.last_push_ts || now,
            squads: raw.squads ? (typeof raw.squads === 'string' ? raw.squads : JSON.stringify(raw.squads)) : undefined,
            lineups: raw.lineups || raw.playing_xi ? (typeof (raw.lineups || raw.playing_xi) === 'string' ? (raw.lineups || raw.playing_xi) : JSON.stringify(raw.lineups || raw.playing_xi)) : undefined,
            scorecard: raw.scorecard ? (typeof raw.scorecard === 'string' ? raw.scorecard : JSON.stringify(raw.scorecard)) : undefined,
            live_details: raw.live_details ? (typeof raw.live_details === 'string' ? raw.live_details : JSON.stringify(raw.live_details)) : undefined,
            raw_payload: JSON.stringify(raw)
        };
    }

    // Source C Mapper (ICC Pattern)
    if (source === 'sourceC') {
        return {
            id: `sourceC:${raw.id}`,
            source: 'sourceC',
            source_match_id: String(raw.id),
            team_a: raw.home_team || 'Unknown',
            team_b: raw.away_team || 'Unknown',
            status: mapStatus(raw.match_status),
            start_time: Math.floor(new Date(raw.start_at).getTime() / 1000),
            provider_updated_at: raw.updated_at ? Math.floor(new Date(raw.updated_at).getTime() / 1000) : now,
            squads: raw.squads ? JSON.stringify(raw.squads) : undefined,
            lineups: raw.lineups ? JSON.stringify(raw.lineups) : undefined,
            scorecard: raw.scorecard ? JSON.stringify(raw.scorecard) : undefined,
            live_details: raw.live_details ? JSON.stringify(raw.live_details) : undefined,
            raw_payload: JSON.stringify(raw)
        };
    }

    throw new Error(`Unsupported source: ${source}`);
}

function mapStatus(status: string): MatchStatus {
    const s = status?.toLowerCase();
    if (['live', 'running', 'in_progress', '1', 'in progress', 'ongoing'].includes(s)) return MatchStatus.LIVE;
    if (['upcoming', 'scheduled', 'scheduled', '0', 'yet to begin'].includes(s)) return MatchStatus.SCHEDULED;
    if (['finished', 'ended', 'completed', '2', 'result', 'complete'].includes(s)) return MatchStatus.COMPLETED;
    if (['abandoned', 'cancelled', 'no_result', 'no result', 'abn'].includes(s)) return MatchStatus.ABANDONED;
    return MatchStatus.UNKNOWN;
}
