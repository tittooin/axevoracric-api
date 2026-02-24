import { NormalizedMatch } from '../utils/normalize';
import { fetchFromSourceA } from './sourceA';
import { fetchFromSourceB } from './sourceB';
import { fetchFromSourceC } from './sourceC';
import { KV_KEYS } from '../utils/kv';

export async function fetchAllSources(kv: KVNamespace, forceAll = false): Promise<{ matches: NormalizedMatch[]; priority: number }[]> {
    const sources = [
        { name: 'sourceA', fetcher: fetchFromSourceA, priority: 1, enabled: false },
        { name: 'sourceB', fetcher: fetchFromSourceB, priority: 2, enabled: false },
        { name: 'sourceC', fetcher: fetchFromSourceC, priority: 3, enabled: false }
    ];

    let sourceIndices = [];

    if (forceAll) {
        sourceIndices = [0, 1, 2];
    } else {
        const lastIndexStr = await kv.get(KV_KEYS.LAST_SOURCE_INDEX);
        let nextIndex = lastIndexStr ? (parseInt(lastIndexStr) + 1) % sources.length : 0;
        sourceIndices = [nextIndex];
        // Rotate the index for next run
        await kv.put(KV_KEYS.LAST_SOURCE_INDEX, nextIndex.toString());
    }

    const allMatchesWithPriority: { matches: NormalizedMatch[]; priority: number }[] = [];
    console.log(`[SourceRotator] Processing indices: ${JSON.stringify(sourceIndices)}`);

    for (const idx of sourceIndices) {
        const sourceMeta = sources[idx];
        console.log(`[SourceRotator] Checking source: ${sourceMeta?.name} (Index ${idx})`);
        if (!sourceMeta?.enabled) {
            console.log(`[SourceRotator] Source ${sourceMeta?.name} is disabled. Skipping.`);
            continue;
        }

        const cooldownKey = KV_KEYS.SOURCE_COOLDOWN(sourceMeta.name);
        if (!forceAll) {
            const isCooledDown = await kv.get(cooldownKey);
            if (isCooledDown) {
                console.warn(`[CircuitBreaker] Skipping ${sourceMeta.name} due to cooldown.`);
                continue;
            }
        }

        try {
            console.log(`[SourceRotator] Calling fetcher for ${sourceMeta.name}...`);
            const data = await sourceMeta.fetcher();
            console.log(`[SourceRotator] ${sourceMeta.name} returned ${data.length} matches.`);

            if (data.length > 0) {
                console.log(`[SourceRotator] Sample Data: ${JSON.stringify(data[0]).substring(0, 100)}...`);
            }

            if (data.length === 0 && !forceAll) {
                await kv.put(cooldownKey, '1', { expirationTtl: 300 });
            }

            allMatchesWithPriority.push({
                matches: data,
                priority: sourceMeta.priority
            });
        } catch (err) {
            console.error(`[SourceRotator] Error in ${sourceMeta.name}:`, err);
            if (!forceAll) await kv.put(cooldownKey, '1', { expirationTtl: 900 });
        }
    }

    return allMatchesWithPriority;
}
