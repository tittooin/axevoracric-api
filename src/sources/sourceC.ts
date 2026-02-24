import { NormalizedMatch, normalizeMatch } from '../utils/normalize';
import { stealthFetch } from '../utils/stealthFetch';

export async function fetchFromSourceC(): Promise<NormalizedMatch[]> {
    try {
        // In a real scenario, this would be an ICC internal endpoint pattern
        const url = 'https://www.icc-cricket.com/api/match/live';

        const response = await stealthFetch(url);

        if (!response.ok) {
            console.warn(`[SourceC] Fetch failed with status ${response.status}`);
            return [];
        }

        // Mocking structure for ICC-like response
        const data = [
            { id: "ICC-999", home_team: "Australia", away_team: "West Indies", match_status: "live", updated_at: new Date().toISOString(), start_at: "2026-02-23T10:00:00Z" }
        ];

        return data.map(m => normalizeMatch(m, 'sourceC'));
    } catch (err) {
        console.error(`[SourceC] Error:`, err);
        return [];
    }
}
