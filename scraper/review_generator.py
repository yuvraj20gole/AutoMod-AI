"""Generates a standalone interactive HTML review tool for dataset inspection & validation."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

from scraper.config import REVIEW_HTML_PATH
from scraper.storage import DatasetStorage

logger = logging.getLogger("scraper.review")


def generate_review_html(
    storage: Optional[DatasetStorage] = None,
    output_path: Optional[Path] = None,
) -> Path:
    """
    Generate an interactive, standalone HTML review UI inside the dataset directory.
    Allows manual visual inspection, comparison slider, approving, rejecting, and filtering pairs.
    """
    store = storage or DatasetStorage()
    dest = output_path or REVIEW_HTML_PATH
    metadata = store.get_existing_metadata()

    # Create embedded JSON data
    metadata_json_str = json.dumps(metadata, indent=2, ensure_ascii=False)

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoMod AI — Dataset Pair Reviewer</title>
  <style>
    :root {{
      --bg: #090a0f;
      --card-bg: #12141c;
      --card-border: #1e2230;
      --accent: #f59e0b;
      --accent-hover: #d97706;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }}
    body {{
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      min-height: 100vh;
    }}
    header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
    }}
    .title-group h1 {{
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .badge {{
      background: rgba(245, 158, 11, 0.15);
      color: var(--accent);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 2px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }}
    .stats-bar {{
      display: flex;
      gap: 16px;
      align-items: center;
      font-size: 14px;
      color: var(--text-muted);
      background: #12141c;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--card-border);
    }}
    .stat-item strong {{
      color: var(--text);
      font-weight: 600;
    }}
    .actions-bar {{
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }}
    button.btn {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }}
    button.btn:hover {{
      background: #1c202e;
      border-color: #2e3448;
    }}
    button.btn-primary {{
      background: var(--accent);
      color: #000;
      border-color: var(--accent);
    }}
    button.btn-primary:hover {{
      background: var(--accent-hover);
    }}
    .shortcuts-hint {{
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 16px;
      display: flex;
      gap: 16px;
      align-items: center;
    }}
    .shortcuts-hint kbd {{
      background: #1e2230;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      border: 1px solid #2d3348;
      color: var(--accent);
    }}
    .filter-section {{
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
      background: #0f1118;
      border: 1px solid var(--card-border);
      padding: 12px 16px;
      border-radius: 10px;
    }}
    .filter-row {{
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }}
    .filter-label {{
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      min-width: 80px;
    }}
    .filters {{
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }}
    .filter-btn {{
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      background: #141722;
      border: 1px solid #1f2436;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
    }}
    .filter-btn:hover {{
      border-color: #3b425b;
      color: var(--text);
    }}
    .filter-btn.active {{
      background: rgba(245, 158, 11, 0.2);
      border-color: var(--accent);
      color: var(--accent);
      font-weight: 600;
    }}
    .run-badge {{
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }}
    .vision-badge {{
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid transparent;
    }}
    .vision-badge.pass {{
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.3);
    }}
    .vision-badge.fail {{
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.3);
    }}
    .vision-reason {{
      font-size: 11px;
      color: #94a3b8;
      background: #090b11;
      border-left: 2px solid var(--accent);
      padding: 4px 8px;
      border-radius: 0 4px 4px 0;
      margin-top: 6px;
      line-height: 1.35;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(580px, 1fr));
      gap: 24px;
    }}
    @media (max-width: 640px) {{
      .grid {{ grid-template-columns: 1fr; }}
    }}
    .card {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: all 0.2s ease;
    }}
    .card.approved {{
      border-color: rgba(16, 185, 129, 0.6);
      box-shadow: 0 0 16px rgba(16, 185, 129, 0.1);
    }}
    .card.rejected {{
      border-color: rgba(239, 68, 68, 0.5);
      opacity: 0.5;
    }}
    .card.rejected:hover {{
      opacity: 0.85;
    }}
    .card-header {{
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 1px solid #1a1d29;
    }}
    .card-title {{
      font-size: 14px;
      font-weight: 600;
      line-height: 1.4;
      color: #e5e7eb;
    }}
    .card-meta {{
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }}
    .card-meta a {{
      color: var(--accent);
      text-decoration: none;
    }}
    .card-meta a:hover {{
      text-decoration: underline;
    }}
    .card-body {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      background: #0d0e15;
      padding: 6px;
      position: relative;
    }}
    .img-container {{
      position: relative;
      width: 100%;
      height: 250px;
      background: #000;
      border-radius: 6px;
      overflow: hidden;
    }}
    .img-container img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      cursor: zoom-in;
      transition: transform 0.2s ease;
    }}
    .img-container img:hover {{
      transform: scale(1.02);
    }}
    .img-label {{
      position: absolute;
      top: 8px;
      left: 8px;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      z-index: 2;
    }}
    .img-label.before {{
      border-left: 3px solid #3b82f6;
    }}
    .img-label.after {{
      border-left: 3px solid var(--accent);
    }}
    .card-footer {{
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #11131a;
      border-top: 1px solid #1a1d29;
    }}
    .status-badge {{
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 3px 10px;
      border-radius: 6px;
    }}
    .status-badge.pending {{ background: #262938; color: var(--text-muted); }}
    .status-badge.approved {{ background: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }}
    .status-badge.rejected {{ background: rgba(239, 68, 68, 0.2); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }}
    .btn-group {{
      display: flex;
      gap: 6px;
    }}
    .btn-sm {{
      padding: 6px 12px;
      font-size: 12px;
      border-radius: 6px;
      cursor: pointer;
    }}
    .btn-approve {{ background: #064e3b; color: #a7f3d0; border: 1px solid #059669; }}
    .btn-approve:hover {{ background: #059669; color: #fff; }}
    .btn-reject {{ background: #450a0a; color: #fecaca; border: 1px solid #dc2626; }}
    .btn-reject:hover {{ background: #dc2626; color: #fff; }}
    .btn-swap {{ background: #1f2436; color: #93c5fd; border: 1px solid #3b82f6; }}
    .btn-swap:hover {{ background: #2563eb; color: #fff; }}
    .empty-state {{
      grid-column: 1 / -1;
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }}
  </style>
</head>
<body>

  <header>
    <div class="title-group">
      <h1>AutoMod AI <span class="badge">Dataset Reviewer</span></h1>
    </div>
    <div class="stats-bar">
      <div class="stat-item">Total Pairs: <strong id="stat-total">0</strong></div>
      <div class="stat-item">Approved: <strong id="stat-approved" style="color: var(--success)">0</strong></div>
      <div class="stat-item">Rejected: <strong id="stat-rejected" style="color: var(--danger)">0</strong></div>
      <div class="stat-item">Pending: <strong id="stat-pending">0</strong></div>
    </div>
    <div class="actions-bar">
      <button class="btn btn-primary" onclick="exportVerifiedJSON()">Export Cleaned JSON</button>
      <button class="btn" onclick="approveAllPending()">Approve All Pending</button>
    </div>
  </header>

  <div class="shortcuts-hint">
    <span>Shortcuts: Click on any pair, or use buttons to validate. Click any image to view full resolution.</span>
  </div>

  <div class="filter-section">
    <div class="filter-row">
      <span class="filter-label">Status:</span>
      <div class="filters" id="status-filters">
        <button class="filter-btn active" onclick="setStatusFilter('all', event)">All Statuses (<span id="count-all">0</span>)</button>
        <button class="filter-btn" onclick="setStatusFilter('pending', event)">Pending (<span id="count-pending">0</span>)</button>
        <button class="filter-btn" onclick="setStatusFilter('approved', event)">Approved (<span id="count-approved">0</span>)</button>
        <button class="filter-btn" onclick="setStatusFilter('rejected', event)">Rejected (<span id="count-rejected">0</span>)</button>
      </div>
    </div>
    <div class="filter-row">
      <span class="filter-label">Vision AI:</span>
      <div class="filters" id="vision-filters">
        <button class="filter-btn active" onclick="setVisionFilter('all', event)">All (<span id="count-vision-all">0</span>)</button>
        <button class="filter-btn" onclick="setVisionFilter('passed', event)" style="color: var(--success)">✓ Vision Passed Only (<span id="count-vision-passed">0</span>)</button>
        <button class="filter-btn" onclick="setVisionFilter('failed', event)" style="color: var(--danger)">✗ Vision Failed (<span id="count-vision-failed">0</span>)</button>
      </div>
    </div>
    <div class="filter-row">
      <span class="filter-label">Batch Run:</span>
      <div class="filters" id="run-filters">
        <!-- Dynamically generated run filter buttons -->
      </div>
    </div>
  </div>

  <div class="grid" id="pairs-grid">
    <!-- Populated by JavaScript -->
  </div>

  <script>
    let dataset = {metadata_json_str};
    let currentStatusFilter = 'all';
    let currentVisionFilter = 'all';
    let currentRunFilter = 'all';

    // Enrich dataset items with batch run information based on timestamp clustering
    function computeBatchRuns() {{
      // Sort dataset by collected_at or pair_id
      const sorted = [...dataset].sort((a, b) => (a.collected_at || '').localeCompare(b.collected_at || ''));
      
      let currentRunId = 1;
      let lastTime = null;
      
      sorted.forEach((item, idx) => {{
        const itemTime = item.collected_at ? new Date(item.collected_at).getTime() : 0;
        if (idx === 0) {{
          item._run_number = currentRunId;
        }} else {{
          // If items are more than 30 minutes apart or on different dates, treat as separate collection run
          if (itemTime - lastTime > 30 * 60 * 1000) {{
            currentRunId += 1;
          }}
          item._run_number = currentRunId;
        }}
        lastTime = itemTime;
        
        // Format human readable date
        if (item.collected_at) {{
          const d = new Date(item.collected_at);
          item._date_str = d.toISOString().split('T')[0];
          item._run_label = `Run #${{item._run_number}} (${{item._date_str}})`;
        }} else {{
          item._date_str = 'Historical';
          item._run_label = `Run #${{item._run_number}} (Historical)`;
        }}
      }});
    }}

    function init() {{
      computeBatchRuns();

      const savedReviews = localStorage.getItem('automod_dataset_reviews');
      if (savedReviews) {{
        try {{
          const reviewMap = JSON.parse(savedReviews);
          dataset.forEach(item => {{
            if (reviewMap[item.pair_id]) {{
              item.review_status = reviewMap[item.pair_id];
            }}
          }});
        }} catch(e) {{
          console.error(e);
        }}
      }}
      renderRunFilters();
      render();
    }}

    function renderRunFilters() {{
      const container = document.getElementById('run-filters');
      container.innerHTML = '';

      // Count pairs per run
      const runCounts = {{}};
      dataset.forEach(item => {{
        const label = item._run_label;
        runCounts[label] = (runCounts[label] || 0) + 1;
      }});

      // "All Runs" button
      const allBtn = document.createElement('button');
      allBtn.className = `filter-btn ${{currentRunFilter === 'all' ? 'active' : ''}}`;
      allBtn.innerHTML = `All Runs (${{dataset.length}})`;
      allBtn.onclick = (e) => setRunFilter('all', e);
      container.appendChild(allBtn);

      // Latest Run shortcut button (if multiple runs exist)
      const distinctRuns = Object.keys(runCounts);
      if (distinctRuns.length > 1) {{
        const latestRunLabel = distinctRuns[distinctRuns.length - 1];
        const latestBtn = document.createElement('button');
        latestBtn.className = `filter-btn ${{currentRunFilter === latestRunLabel ? 'active' : ''}}`;
        latestBtn.innerHTML = `★ Latest Run (${{runCounts[latestRunLabel]}})`;
        latestBtn.style.borderColor = 'var(--accent)';
        latestBtn.onclick = (e) => setRunFilter(latestRunLabel, e);
        container.appendChild(latestBtn);
      }}

      // Individual run buttons
      distinctRuns.forEach(label => {{
        const btn = document.createElement('button');
        btn.className = `filter-btn ${{currentRunFilter === label ? 'active' : ''}}`;
        btn.innerHTML = `${{label}} (${{runCounts[label]}})`;
        btn.onclick = (e) => setRunFilter(label, e);
        container.appendChild(btn);
      }});
    }}

    function saveState() {{
      const reviewMap = {{}};
      dataset.forEach(item => {{
        reviewMap[item.pair_id] = item.review_status || 'pending';
      }});
      localStorage.setItem('automod_dataset_reviews', JSON.stringify(reviewMap));
    }}

    function setStatusFilter(filter, ev) {{
      currentStatusFilter = filter;
      document.querySelectorAll('#status-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
      if (ev && ev.target) {{
        ev.target.classList.add('active');
      }}
      render();
    }}

    function setVisionFilter(filter, ev) {{
      currentVisionFilter = filter;
      document.querySelectorAll('#vision-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
      if (ev && ev.target) {{
        ev.target.classList.add('active');
      }}
      render();
    }}

    function setRunFilter(runLabel, ev) {{
      currentRunFilter = runLabel;
      document.querySelectorAll('#run-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
      if (ev && ev.target) {{
        ev.target.classList.add('active');
      }}
      render();
    }}

    function updateStatus(pairId, status) {{
      const item = dataset.find(x => x.pair_id === pairId);
      if (item) {{
        item.review_status = status;
        saveState();
        render();
      }}
    }}

    function swapPair(pairId) {{
      const item = dataset.find(x => x.pair_id === pairId);
      if (item && item.filenames) {{
        const temp = item.filenames.before;
        item.filenames.before = item.filenames.after;
        item.filenames.after = temp;
        item.swapped = !item.swapped;
        saveState();
        render();
      }}
    }}

    function approveAllPending() {{
      dataset.forEach(item => {{
        // Respect current run & vision filter if applied
        const matchesRun = (currentRunFilter === 'all') || (item._run_label === currentRunFilter);
        const matchesVision = (currentVisionFilter === 'all') ||
          (currentVisionFilter === 'passed' && item.vision_validation && item.vision_validation.passed) ||
          (currentVisionFilter === 'failed' && item.vision_validation && !item.vision_validation.passed);

        if (matchesRun && matchesVision && (!item.review_status || item.review_status === 'pending')) {{
          item.review_status = 'approved';
        }}
      }});
      saveState();
      render();
    }}

    function exportVerifiedJSON() {{
      const approvedOnly = dataset.filter(item => item.review_status === 'approved' || item.review_status === 'pending');
      const blob = new Blob([JSON.stringify(approvedOnly, null, 2)], {{ type: 'application/json' }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'metadata_verified.json';
      a.click();
      URL.revokeObjectURL(url);
    }}

    function render() {{
      const grid = document.getElementById('pairs-grid');
      grid.innerHTML = '';

      // Count stats with respect to active run filter
      const runScopedData = dataset.filter(item => {{
        if (currentRunFilter === 'all') return true;
        return item._run_label === currentRunFilter;
      }});

      let total = runScopedData.length;
      let approved = runScopedData.filter(x => x.review_status === 'approved').length;
      let rejected = runScopedData.filter(x => x.review_status === 'rejected').length;
      let pending = runScopedData.filter(x => !x.review_status || x.review_status === 'pending').length;

      document.getElementById('stat-total').innerText = total;
      document.getElementById('stat-approved').innerText = approved;
      document.getElementById('stat-rejected').innerText = rejected;
      document.getElementById('stat-pending').innerText = pending;

      document.getElementById('count-all').innerText = total;
      document.getElementById('count-pending').innerText = pending;
      document.getElementById('count-approved').innerText = approved;
      document.getElementById('count-rejected').innerText = rejected;

      // Vision counts
      const vPassed = runScopedData.filter(x => x.vision_validation && x.vision_validation.passed).length;
      const vFailed = runScopedData.filter(x => x.vision_validation && !x.vision_validation.passed).length;
      document.getElementById('count-vision-all').innerText = total;
      document.getElementById('count-vision-passed').innerText = vPassed;
      document.getElementById('count-vision-failed').innerText = vFailed;

      const filtered = runScopedData.filter(item => {{
        // Status filter
        if (currentStatusFilter !== 'all') {{
          if (currentStatusFilter === 'pending' && item.review_status && item.review_status !== 'pending') return false;
          if (currentStatusFilter !== 'pending' && item.review_status !== currentStatusFilter) return false;
        }}
        // Vision filter
        if (currentVisionFilter === 'passed') {{
          return item.vision_validation && item.vision_validation.passed;
        }}
        if (currentVisionFilter === 'failed') {{
          return item.vision_validation && !item.vision_validation.passed;
        }}
        return true;
      }});

      if (filtered.length === 0) {{
        grid.innerHTML = '<div class="empty-state"><h3>No pairs found matching current filters.</h3></div>';
        return;
      }}

      filtered.forEach(item => {{
        const status = item.review_status || 'pending';
        const card = document.createElement('div');
        card.className = `card ${{status}}`;

        const beforeSrc = item.filenames ? item.filenames.before : `${{item.pair_id}}_before.jpg`;
        const afterSrc = item.filenames ? item.filenames.after : `${{item.pair_id}}_after.jpg`;
        const runBadge = item._run_label ? `<span class="run-badge">📅 ${{escapeHtml(item._run_label)}}</span>` : '';

        let visionBadge = '';
        let visionReason = '';
        if (item.vision_validation) {{
          if (item.vision_validation.passed) {{
            visionBadge = `<span class="vision-badge pass">👁 Vision: PASS</span>`;
          }} else {{
            visionBadge = `<span class="vision-badge fail">✗ Vision: FAIL</span>`;
          }}
          if (item.vision_validation.reason) {{
            visionReason = `<div class="vision-reason"><strong>AI Verdict:</strong> ${{escapeHtml(item.vision_validation.reason)}}</div>`;
          }}
        }}

        card.innerHTML = `
          <div class="card-header">
            <div>
              <div class="card-title">#${{item.pair_id}} — ${{escapeHtml(item.title || 'Untitled Modification')}}</div>
              <div class="card-meta">
                ${{runBadge}}
                ${{visionBadge}}
                <span>Source: <strong>${{item.source_type}}</strong> (${{item.subreddit || item.author || 'N/A'}})</span>
                <span>Method: ${{item.extraction_method}}</span>
                <a href="${{item.source_url}}" target="_blank" rel="noopener">View Source ↗</a>
              </div>
              ${{visionReason}}
            </div>
          </div>
          <div class="card-body">
            <div class="img-container">
              <span class="img-label before">Before</span>
              <img src="${{beforeSrc}}" alt="Before" loading="lazy" onclick="window.open(this.src)">
            </div>
            <div class="img-container">
              <span class="img-label after">After</span>
              <img src="${{afterSrc}}" alt="After" loading="lazy" onclick="window.open(this.src)">
            </div>
          </div>
          <div class="card-footer">
            <span class="status-badge ${{status}}">${{status}}</span>
            <div class="btn-group">
              <button class="btn btn-sm btn-approve" onclick="updateStatus('${{item.pair_id}}', 'approved')">✓ Approve</button>
              <button class="btn btn-sm btn-reject" onclick="updateStatus('${{item.pair_id}}', 'rejected')">✗ Reject</button>
              <button class="btn btn-sm btn-swap" onclick="swapPair('${{item.pair_id}}')" title="Swap Before & After">⇄ Swap</button>
            </div>
          </div>
        `;
        grid.appendChild(card);
      }});
    }}

    function escapeHtml(str) {{
      const div = document.createElement('div');
      div.innerText = str;
      return div.innerHTML;
    }}

    window.onload = init;
  </script>
</body>
</html>
"""

    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        f.write(html_content)

    logger.info(f"Generated visual review tool at {dest}")
    return dest
