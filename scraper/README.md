# AutoMod AI — Before/After Car Modification Dataset Scraper

A robust, ethical dataset collection pipeline designed to gather real before/after car modification image pairs for AI fine-tuning and evaluation.

---

## Key Features

1. **Official Reddit PRAW API Integration**
   - Compliant with Reddit's API Terms of Service (uses official OAuth authenticated PRAW rather than raw HTML scraping).
   - Searches targeted car modification subreddits (`r/CarWraps`, `r/projectcar`, `r/Autobody`, `r/AutoDetailing`, `r/Stance`, `r/JDM`, `r/Mustang`, `r/civic`, `r/GolfGTI`, `r/BMW`, `r/ft86`, `r/Miata`, etc.).
   - Pattern matching on post titles (`"before/after"`, `"before and after"`, `"b4/after"`, `"transformation"`, etc.).
   - Intelligently extracts pairs from Reddit Multi-Image Galleries (inspecting captions to guarantee ordering) and single side-by-side split posts.

2. **Curated Car Wrap & Mod Shop Portfolio Scraper**
   - Scrapes public "Our Work" / Before & After galleries across reputable auto restyling & wrap shop portfolios.
   - Strictly respects `robots.txt` per domain and enforces polite delays with random jitter.
   - Detects standard before/after comparison widgets (TwentyTwenty, BeerSlider, image comparison modules, and paired markup).

3. **Perceptual Deduplication (`imagehash`)**
   - Automatically computes `pHash` (Perceptual Hash) and `dHash` (Difference Hash) for all collected images.
   - Rejects self-identical images (where before == after).
   - Rejects near-duplicates across cross-posted threads or identical submissions.

4. **Structured Storage & Attribution**
   - Saves clean RGB JPEG pairs as `0001_before.jpg`, `0001_after.jpg`.
   - Records metadata in `dataset/before-after-pairs/metadata.json` and `metadata.jsonl` (source URL, title, author, subreddit/shop, dimensions, hashes, review status).

5. **Interactive Visual Review Tool (`review.html`)**
   - Open `dataset/before-after-pairs/review.html` in any browser.
   - Side-by-side inspection, Approve / Reject / Swap buttons, status filters, and one-click JSON export.

---

## Setup & Configuration

### 1. Requirements
Dependencies are already installed:
```bash
pip install praw imagehash pillow requests beautifulsoup4 python-dotenv
```

### 2. Reddit API Credentials (Free, 1 Minute Setup)
To use Reddit as a source:
1. Go to [https://www.reddit.com/prefs/apps](https://www.reddit.com/prefs/apps).
2. Scroll to the bottom and click **"create another app..."**.
3. Fill in:
   - **Name**: `AutoMod-Scraper`
   - **Type**: Select `script`
   - **Redirect URI**: `http://localhost:8080`
4. Click **Create app**.
5. Copy your **Client ID** (under the app name) and **Secret Key**.
6. Add them to your `.env` or `.env.local` file:
```env
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
REDDIT_USER_AGENT=AutoModAI-ResearchScraper/1.0 (academic fine-tuning dataset collector; +https://automod.ai)
```

---

## Usage Guide

### 1. Run a Small Test Batch (10-20 Pairs for Review)
```bash
python3 scraper/main.py --test-batch
```

### 2. Scrape from Reddit Only
```bash
python3 scraper/main.py --source reddit --limit 30
```

### 3. Scrape Specific Subreddits
```bash
python3 scraper/main.py --source reddit --subreddits "CarWraps,Mustang,JDM,AutoDetailing" --limit 20
```

### 4. Scrape Curated Shop Portfolios
```bash
python3 scraper/main.py --source shops --limit 20
```

### 5. Ingest Curated Benchmark Seed Pairs
```bash
python3 scraper/main.py --seed-samples
```

### 6. Review Collected Pairs
Open the interactive reviewer in your browser:
```bash
open dataset/before-after-pairs/review.html
```
