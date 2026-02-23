# AXEVORA Cricket API - GitHub Relay Setup

Ye script aapke GitHub repository par 24/7 chalega aur real-time data aapke Worker API ko bhejta rahega (zero cost).

## 🚀 Setup Steps

### 1. Files Push Karein
Aapne jo repo banayi hai, usme ye do files push kar dijiye:
- `relay_scraper.js` (Root directory mein)
- `.github/workflows/scrape_relay.yml` (Is directory structure ke sath)

### 2. GitHub Secrets Setup
GitHub Repo Settings mein jaakar niche diye gaye **Secrets** add karein:
- **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**

Add these two:
1. `INGESTION_ENDPOINT`: `https://cricbuzz-api-v2.axevoracric.workers.dev/api/v1/ingest/push`
2. `INGESTION_TOKEN`: `axevora_test_secret_123` (Aap ise baad mein wrangler secrets se change kar sakte hain security ke liye).

### 3. Workflow Trigger
- **Actions** tab mein jaakar `Cricket Data Relay` workflow ko **Manual Trigger** (Run workflow) karein check karne ke liye.
- Iske baad ye har 5 minute mein khud chalne lagega.

### 4. Verify
Aap apne Worker logs (`wrangler tail`) mein dekh payenge:
`[Push API] Relay Data Ingested Successfully`

Base format ready hai bhai, ab funding ka tension chhodiye aur app banana shuru kijiye! 🏏
