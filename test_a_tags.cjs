const fs = require('fs');
const html = fs.readFileSync('clean.html', 'utf8');

// Match `<a title="TeamA vs TeamB, 1st match - Live " href="/live-cricket-scores/12345/..."`
const regex = /<a title="([^"]+?)\s+vs\s+([^"]+?),\s*(.*?)"[^>]+href="\/live-cricket-scores\/(\d+)\//g;

let count = 0;
let match;
while ((match = regex.exec(html)) !== null) {
    const teamA = match[1].trim();
    const teamB = match[2].trim();
    const stateDesc = match[3].trim();
    const id = match[4];

    let status = 'live';
    if (stateDesc.toLowerCase().includes('preview') || stateDesc.toLowerCase().includes('upcoming')) status = 'scheduled';
    if (stateDesc.toLowerCase().includes('result') || stateDesc.toLowerCase().includes('complete') || stateDesc.toLowerCase().includes('won')) status = 'completed';

    console.log(`[${id}] ${teamA} vs ${teamB} | ${status} | Description: ${stateDesc}`);
    count++;
}
console.log(`Total HTML matches found: ${count}`);
