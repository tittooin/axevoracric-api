import { NormalizedMatch, normalizeMatch } from '../utils/normalize';

export async function fetchFromSourceA(): Promise<NormalizedMatch[]> {
    const response = [
        {
            id: 139382,
            home_team: "West Indies",
            away_team: "Zimbabwe",
            match_status: "live",
            start_at: "2026-02-23T14:30:00Z",
            squads: {
                home: [
                    { id: 1001, name: "Shai Hope", role: "Batter" },
                    { id: 1002, name: "Nicholas Pooran", role: "Batter" }
                ],
                away: [
                    { id: 2001, name: "Sikandar Raza", role: "All-rounder" },
                    { id: 2002, name: "Craig Ervine", role: "Batter" }
                ]
            },
            lineups: { home: [1001, 1002], away: [2001, 2002] }
        }
    ];

    return response.map(m => normalizeMatch(m, 'sourceA'));
}
