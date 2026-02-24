# 🏏 Cricket API Tutorial & Usage Guide

Bhai, ye aapki API use karne ka complete guide hai. Saare endpoints aur authentication details niche diye gaye hain.

## 🗝️ 1. Authentication
Saare `/api/v1/*` endpoints protected hain. Aapko har request ke header mein ek `x-api-key` bhejna hoga.

**Header:**
```http
x-api-key: <YOUR_API_KEY>
```

---

## 🚀 2. Quick Start: Aggregated Endpoint
Agar aapko ek hi baar mein sara data chahiye (Dashboard ke liye), toh ye best hai:

**Endpoint:** `GET /api/v1/all`
**Response:** Live Matches, Trending Players, ICC Rankings, **Photos**, aur **Stats** ka aggregate data.

---

## 🏗️ 3. Endpoint Categories

### 🏏 Matches
- `GET /api/v1/matches/live` - Current live matches.
- `GET /api/v1/matches/upcoming` - Future scheduled matches.
- `GET /api/v1/matches/recent` - Past results.
- `GET /api/v1/matches/get-scorecard?id=123` - Detailed scorecard.
- `GET /api/v1/matches/get-team?id=123` - (NEW) Full Squads aur Playing 11 (after toss).
- `GET /api/v1/matches/get-info?id=123` - (NEW) Comprehensive match info including squads/lineups.

### 🏆 Series (Schedules)
- `GET /api/v1/series/list` - List of ongoing/past series.
- `GET /api/v1/series/get-points-table?id=55` - Points Table for a league.

### 👥 Teams & Players
- `GET /api/v1/teams/list` - Category wise teams.
- `GET /api/v1/players/search?name=Kohli` - Player search.

### 📊 Stats & ICC
- `GET /api/v1/stats/get-icc-rankings` - Current ICC Team/Player rankings.

---

## ⚙️ 4. How to Test (Using CURL)
Aap terminal mein ye command run karke check kar sakte hain:

```bash
curl -H "x-api-key: YOUR_KEY_HERE" https://cricbuzz-api-v2.axevoracric.workers.dev/api/v1/all
```

---

## 🛡️ 5. Monitoring & Limits
Aapki har request ke response headers mein ye details milengi:
- `x-ratelimit-remaining`: Per-minute kitni requests bachi hain.
- `x-quota-remaining`: Aaj ki total daily quota kitni bachi hai.

Bhai, agar aur kuch details chahiye toh batana! 💎🏏🔥
