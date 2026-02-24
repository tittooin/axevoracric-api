const fs = require('fs');
const html = fs.readFileSync('clean.html', 'utf8');

const testIds = ['117047', '125085', '139381', '139382', '139393', '144620', '145784'];

testIds.forEach(id => {
    let startIdx = 0;
    let found = false;

    while ((startIdx = html.indexOf(`"matchId":${id}`, startIdx)) !== -1) {
        const block = html.slice(startIdx, startIdx + 1500);

        // Use [\\s\\S]*? to handle newlines between team1 and teamName safely!
        const t1Match = /"team1"\s*:\s*{[\s\S]*?"teamName"\s*:\s*"([^"]+)"/.exec(block);
        const t2Match = /"team2"\s*:\s*{[\s\S]*?"teamName"\s*:\s*"([^"]+)"/.exec(block);
        const stateMatch = /"state"\s*:\s*"([^"]+)"/.exec(block);

        if (t1Match && t2Match) {
            console.log(`[${id}] ${t1Match[1]} vs ${t2Match[1]} | Status: ${stateMatch ? stateMatch[1] : 'Unknown'}`);
            found = true;
            break;
        }

        startIdx += 10;
    }

    if (!found) {
        console.log(`[${id}] FAILED TO FIND OR PARSE`);
    }
});
