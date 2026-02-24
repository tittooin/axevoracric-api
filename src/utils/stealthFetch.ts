export async function stealthFetch(url: string, options: any = {}): Promise<Response> {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    ];

    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    // Randomized Jitter (100ms - 2s)
    const jitter = Math.floor(Math.random() * 1900) + 100;
    await new Promise(resolve => setTimeout(resolve, jitter));

    const headers = {
        'User-Agent': randomUA,
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.google.com/',
        ...options.headers
    };

    return fetch(url, { ...options, headers });
}
