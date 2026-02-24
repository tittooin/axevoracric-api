import { NormalizedMatch, normalizeMatch } from '../utils/normalize';
import { stealthFetch } from '../utils/stealthFetch';

export async function fetchFromSourceB(): Promise<NormalizedMatch[]> {
    try {
        const url = 'https://www.cricbuzz.com/cricket-match/live-scores';
        const response = await stealthFetch(url);

        if (!response.ok) {
            console.warn(`[SourceB] HTML Fetch failed with status ${response.status}`);
            return [];
        }

        const html = await response.text();
        const normalized: NormalizedMatch[] = [];

        // Parsing match data from embedded JSON in Next.js scripts
        const matchRegex = /"matchId":(\d+),"seriesId":\d+,"seriesName":"([^"]+)","matchDesc":"([^"]+)","matchFormat":"([^"]+)","startDate":"(\d+)"/g;
        let match;

        while ((match = matchRegex.exec(html)) !== null) {
            const [_, matchId, seriesName, matchDesc, matchFormat, startDate] = match;

            normalized.push(normalizeMatch({
                id: matchId,
                home_team: seriesName.split(' vs ')[0] || "Team A",
                away_team: seriesName.split(' vs ')[1] || "Team B",
                match_status: 'live',
                start_at: new Date(parseInt(startDate)).toISOString(),
                updated_at: new Date().toISOString()
            }, 'sourceB'));
        }

        console.log(`[SourceB] Extracted ${normalized.length} matches from live HTML.`);
        return normalized;
    } catch (err) {
        console.error(`[SourceB] Error in HTML Extractor:`, err);
        return [];
    }
}
