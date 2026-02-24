const fs = require('fs');
const html = fs.readFileSync('clean.html', 'utf8');

// Find all occurrences of anything inside `{ ... }` that has `"matchId"` and `"team1"` and `"team2"`
// A robust way in Node is to match JSON-like structures.
const regex = /{"matchId":\d+,"seriesId":\d+,"seriesName":"[^"]+","matchDesc":"[^"]+","matchFormat":"[^"]+"[^}]*?.*?"team1":{[^}]*},"team2":{[^}]*}/g;

let match;
let count = 0;
while ((match = regex.exec(html)) !== null) {
    const blockStr = match[0] + '}'; // Closing the object tentatively
    // Rather than JSON parse which might fail if we cut it off, let's just regex out the team names from the match text itself!

    const fullText = html.substring(match.index, match.index + 1000); // 1000 chars should cover the whole match object

    const idMatch = /"matchId":(\d+)/.exec(fullText);
    const t1 = /"team1":{[^}]*"teamName":"([^"]+)"/.exec(fullText);
    const t2 = /"team2":{[^}]*"teamName":"([^"]+)"/.exec(fullText);
    const stateMatch = /"state":"([^"]+)"/.exec(fullText);

    if (idMatch && t1 && t2) {
        count++;
        console.log(`[${idMatch[1]}] ${t1[1]} vs ${t2[1]} | ${stateMatch ? stateMatch[1] : 'Unknown'}`);
    }
}

console.log(`Extracted via universal matchBlock finding: ${count}`);
