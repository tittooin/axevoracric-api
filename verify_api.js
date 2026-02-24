/**
 * API Verification Script (Node.js)
 * Run this to check if all major endpoint groups are working.
 */

const API_BASE = "https://cricbuzz-api-v2.axevoracric.workers.dev/api/v1";
const API_KEY = process.env.API_KEY || "PASTE_YOUR_KEY_HERE";

const endpoints = [
    "/all",
    "/matches/live",
    "/matches/upcoming",
    "/series/list",
    "/stats/get-icc-rankings"
];

async function verify() {
    console.log("🚀 Starting API Verification...\n");

    for (const ep of endpoints) {
        try {
            const start = Date.now();
            const res = await fetch(`${API_BASE}${ep}`, {
                headers: { "x-api-key": API_KEY }
            });
            const duration = Date.now() - start;

            if (res.ok) {
                console.log(`✅ [${res.status}] ${ep} - ${duration}ms`);
            } else {
                const data = await res.json();
                console.error(`❌ [${res.status}] ${ep} - Error: ${data.error || 'Unknown'}`);
            }
        } catch (err) {
            console.error(`💥 [ERROR] ${ep} - Connection Failed: ${err.message}`);
        }
    }

    console.log("\n✨ Verification Complete!");
}

verify();
