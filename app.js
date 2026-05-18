const API = "https://data-api.polymarket.com";

const els = {
  wallet: document.querySelector("#walletInput"),
  button: document.querySelector("#checkButton"),
  apiStatus: document.querySelector("#apiStatus"),
  dataCoverage: document.querySelector("#dataCoverage"),
  supply: document.querySelector("#supplyInput"),
  ecosystemScore: document.querySelector("#ecosystemScoreInput"),
  betWeight: document.querySelector("#betWeightInput"),
  categoryWeight: document.querySelector("#categoryWeightInput"),
  estimateFdv: document.querySelector("#estimateFdvInput"),
  estimatePool: document.querySelector("#estimatePoolInput"),
  totalVolume: document.querySelector("#totalVolume"),
  buySellSplit: document.querySelector("#buySellSplit"),
  totalBets: document.querySelector("#totalBets"),
  uniqueMarkets: document.querySelector("#uniqueMarkets"),
  wonLost: document.querySelector("#wonLost"),
  pnlHint: document.querySelector("#pnlHint"),
  airdropScore: document.querySelector("#airdropScore"),
  scoreShare: document.querySelector("#scoreShare"),
  estimatedReward: document.querySelector("#estimatedReward"),
  estimatedTokens: document.querySelector("#estimatedTokens"),
  categoryList: document.querySelector("#categoryList"),
  categoryCount: document.querySelector("#categoryCount"),
  matrix: document.querySelector("#matrix"),
  positionsBody: document.querySelector("#positionsBody"),
  positionCount: document.querySelector("#positionCount"),
  tradesBody: document.querySelector("#tradesBody"),
  tradeCount: document.querySelector("#tradeCount"),
  shareSection: document.querySelector("#shareSection"),
  shareBanner: document.querySelector("#shareBanner"),
  bannerTitle: document.querySelector("#bannerTitle"),
  bannerWallet: document.querySelector("#bannerWallet"),
  bannerReward: document.querySelector("#bannerReward"),
  bannerVolume: document.querySelector("#bannerVolume"),
  bannerPnl: document.querySelector("#bannerPnl"),
  bannerBets: document.querySelector("#bannerBets"),
  bannerMarkets: document.querySelector("#bannerMarkets"),
  bannerScore: document.querySelector("#bannerScore"),
  bannerAssumption: document.querySelector("#bannerAssumption"),
  shareButton: document.querySelector("#shareButton"),
  copyButton: document.querySelector("#copyButton"),
  downloadButton: document.querySelector("#downloadButton"),
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
let currentStats = emptyStats();

function emptyStats() {
  return {
    trades: [],
    positions: [],
    totalVolume: 0,
    buyVolume: 0,
    sellVolume: 0,
    totalBets: 0,
    pnl: 0,
    categoryMap: new Map(),
    marketSet: new Set(),
    score: 0,
    capped: false,
    profile: null,
    leaderboard: null,
    source: "none",
    estimatedUsd: 0,
    estimatedTokens: 0,
  };
}

function setStatus(text, tone = "") {
  els.apiStatus.textContent = text;
  els.apiStatus.className = `status-pill ${tone}`;
}

function normalizeAddress(raw) {
  return raw.trim().toLowerCase();
}

function isAddress(value) {
  return /^0x[a-f0-9]{40}$/.test(value);
}

async function fetchJson(path, params) {
  const url = new URL(`${API}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  });
  const response = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function checkWallet() {
  const wallet = normalizeAddress(els.wallet.value);
  if (!isAddress(wallet)) {
    setStatus("Bad wallet", "error");
    els.wallet.focus();
    return;
  }

  els.button.disabled = true;
  setStatus("Fetching all-time", "loading");
  els.dataCoverage.textContent = "Pulling all-time trades from Polymarket...";

  try {
    const [tradesResult, positionsResult, leaderboardResult, tradedResult, profileResult] = await Promise.allSettled([
      fetchAllTrades(wallet),
      fetchJson("/positions", { user: wallet, limit: 500, offset: 0 }),
      fetchLeaderboard(wallet),
      fetchJson("/traded", { user: wallet }),
      fetchPublicProfile(wallet),
    ]);

    const tradesRaw = tradesResult.status === "fulfilled" ? tradesResult.value : { trades: [], capped: false };
    const positionsRaw = positionsResult.status === "fulfilled" ? positionsResult.value : [];
    const leaderboard = leaderboardResult.status === "fulfilled" ? leaderboardResult.value : null;
    const traded = tradedResult.status === "fulfilled" ? tradedResult.value : null;
    const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
    const trades = Array.isArray(tradesRaw.trades) ? tradesRaw.trades : [];
    const positions = Array.isArray(positionsRaw) ? positionsRaw : positionsRaw?.data || [];

    currentStats = calculateStats(trades, positions);
    currentStats.capped = tradesRaw.capped;
    currentStats.profile = profile;
    currentStats.leaderboard = leaderboard;
    applyAggregateStats(currentStats, leaderboard, traded);
    renderAll();
    setStatus("Live", "ok");
  } catch (error) {
    console.error(error);
    setStatus("API error", "error");
    alert(`Polymarket API se data nahi aaya: ${error.message}`);
  } finally {
    els.button.disabled = false;
  }
}

async function fetchAllTrades(wallet) {
  const limit = 10000;
  const raw = await fetchJson("/trades", { user: wallet, limit, offset: 0 });
  const trades = Array.isArray(raw) ? raw : raw?.data || [];
  return { trades, capped: trades.length >= limit };
}

async function fetchLeaderboard(wallet) {
  const raw = await fetchJson("/v1/leaderboard", {
    user: wallet,
    timePeriod: "ALL",
    orderBy: "VOL",
    limit: 1,
    offset: 0,
  });
  const rows = Array.isArray(raw) ? raw : raw?.data || [];
  return rows[0] || null;
}

async function fetchPublicProfile(wallet) {
  const url = new URL("https://gamma-api.polymarket.com/public-profile");
  url.searchParams.set("address", wallet);
  const response = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function calculateStats(trades, positions) {
  const stats = emptyStats();
  stats.trades = trades;
  stats.positions = positions;

  for (const trade of trades) {
    const size = pickNumber(trade.size, trade.amount, trade.shares);
    const price = pickNumber(trade.price, trade.avgPrice, trade.averagePrice);
    const value = pickNumber(trade.usdcSize, trade.value, trade.notional, size * price);
    const side = String(trade.side || trade.type || "").toUpperCase();
    const marketKey = trade.conditionId || trade.marketSlug || trade.slug || trade.title || trade.question || "Unknown";
    const category = inferCategory(trade);

    stats.totalVolume += value;
    stats.totalBets += 1;
    stats.marketSet.add(marketKey);

    if (side.includes("SELL")) stats.sellVolume += value;
    else stats.buyVolume += value;

    const prev = stats.categoryMap.get(category) || { bets: 0, volume: 0 };
    prev.bets += 1;
    prev.volume += value;
    stats.categoryMap.set(category, prev);
  }

  for (const position of positions) {
    stats.pnl += pickNumber(
      position.cashPnl,
      position.realizedPnl,
      position.pnl,
      position.profit,
      position.unrealizedPnl,
      0,
    );
  }

  stats.score = computeScore(stats);
  return stats;
}

function applyAggregateStats(stats, leaderboard, traded) {
  const aggregateVolume = readNumber(leaderboard?.vol);
  const aggregatePnl = readNumber(leaderboard?.pnl);
  const tradedMarkets = readNumber(traded?.traded);

  if (aggregateVolume !== null && aggregateVolume > 0) {
    stats.totalVolume = aggregateVolume;
    stats.source = "leaderboard";
  } else if (stats.totalVolume > 0) {
    stats.source = "trades";
  }

  if (aggregatePnl !== null) {
    stats.pnl = aggregatePnl;
  }

  if (tradedMarkets !== null && tradedMarkets > stats.marketSet.size) {
    stats.marketSet = new Set(Array.from({ length: tradedMarkets }, (_, index) => `market-${index}`));
  }

  stats.score = computeScore(stats);
}

function computeScore(stats) {
  const betWeight = Number(els.betWeight.value) || 0;
  const categoryWeight = Number(els.categoryWeight.value) || 0;
  const pnlBonus = Math.max(stats.pnl, 0) * 0.1;
  return stats.totalVolume + stats.totalBets * betWeight + stats.categoryMap.size * categoryWeight + pnlBonus;
}

function getEstimate(stats) {
  const supply = Math.max(Number(els.supply.value) || 1, 1);
  const fdv = Math.max(Number(els.estimateFdv.value) || 1, 1);
  const poolPct = Math.max(Number(els.estimatePool.value) || 0, 0);
  const ecosystemScore = Math.max(Number(els.ecosystemScore.value) || 1, 1);
  const share = stats.score / ecosystemScore;
  const estimatedUsd = fdv * (poolPct / 100) * share;
  const tokenPrice = fdv / supply;
  return {
    estimatedUsd,
    estimatedTokens: estimatedUsd / tokenPrice,
    share,
  };
}

function pickNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferCategory(item) {
  const direct = item.category || item.eventCategory || item.marketCategory || item.tag || item.tags?.[0];
  if (direct) return titleCase(String(direct));

  const text = [
    item.title,
    item.question,
    item.market,
    item.eventSlug,
    item.marketSlug,
    item.slug,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const rules = [
    ["Politics", ["election", "trump", "biden", "president", "senate", "congress", "minister", "mayor"]],
    ["Crypto", ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto", "token", "airdrop"]],
    ["Sports", ["nba", "nfl", "mlb", "ufc", "soccer", "football", "tennis", "cricket", "world cup"]],
    ["Finance", ["fed", "rate", "inflation", "cpi", "stock", "nasdaq", "s&p", "oil", "gold"]],
    ["Culture", ["oscar", "grammy", "movie", "album", "celebrity", "music", "tiktok"]],
    ["Tech", ["openai", "apple", "google", "tesla", "ai", "spacex", "nvidia"]],
  ];

  for (const [category, keywords] of rules) {
    if (keywords.some((keyword) => text.includes(keyword))) return category;
  }
  return "Other";
}

function titleCase(value) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderAll() {
  currentStats.score = computeScore(currentStats);
  renderSummary();
  renderCategories();
  renderMatrix();
  renderPositions();
  renderTrades();
}

function renderSummary() {
  const estimate = getEstimate(currentStats);
  currentStats.estimatedUsd = estimate.estimatedUsd;
  currentStats.estimatedTokens = estimate.estimatedTokens;
  els.dataCoverage.textContent = currentStats.capped
    ? "Showing max 10,000 trades allowed by Polymarket API. Heavy wallets may have more history."
    : currentStats.totalBets
      ? currentStats.source === "leaderboard"
        ? `Real all-time volume/PnL from Polymarket leaderboard API. ${number.format(currentStats.totalBets)} trades used for category split.`
        : `All-time volume calculated from ${number.format(currentStats.totalBets)} fetched trades.`
      : "All-time mode: up to 10,000 trades";
  els.totalVolume.textContent = currency.format(currentStats.totalVolume);
  els.buySellSplit.textContent =
    currentStats.source === "leaderboard"
      ? `Fetched trades split: Buy ${currency.format(currentStats.buyVolume)} / Sell ${currency.format(
          currentStats.sellVolume,
        )}`
      : `Buy ${currency.format(currentStats.buyVolume)} / Sell ${currency.format(currentStats.sellVolume)}`;
  els.totalBets.textContent = number.format(currentStats.totalBets);
  els.uniqueMarkets.textContent = `${number.format(currentStats.marketSet.size)} markets`;
  els.wonLost.textContent = currency.format(currentStats.pnl);
  els.wonLost.className = currentStats.pnl >= 0 ? "profit" : "loss";
  els.pnlHint.textContent =
    currentStats.source === "leaderboard"
      ? "All-time PnL from leaderboard"
      : currentStats.positions.length
        ? "Position PnL from API"
        : "No position PnL found";
  els.airdropScore.textContent = number.format(currentStats.score);
  els.scoreShare.textContent = `${percent.format(estimate.share * 100)}% share`;
  els.estimatedReward.textContent = currency.format(estimate.estimatedUsd);
  els.estimatedTokens.textContent = `${number.format(estimate.estimatedTokens)} tokens at ${compactCurrency.format(
    Number(els.estimateFdv.value) || 0,
  )} FDV`;
  renderShareBanner(estimate);
}

function renderCategories() {
  const rows = [...currentStats.categoryMap.entries()]
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.volume - a.volume);

  els.categoryCount.textContent = `${rows.length} categories`;
  if (!rows.length) {
    els.categoryList.className = "bars empty-state";
    els.categoryList.textContent = "No category data yet.";
    return;
  }

  const max = Math.max(...rows.map((row) => row.volume), 1);
  els.categoryList.className = "bars";
  els.categoryList.innerHTML = rows
    .map(
      (row) => `
        <div class="bar-row">
          <div class="bar-meta">
            <strong>${escapeHtml(row.category)}</strong>
            <span>${row.bets} bets / ${currency.format(row.volume)}</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width: ${(row.volume / max) * 100}%"></div></div>
        </div>
      `,
    )
    .join("");
}

function renderShareBanner(estimate) {
  if (!currentStats.totalBets && !currentStats.totalVolume) {
    els.shareSection.classList.add("is-hidden");
    return;
  }

  const name =
    currentStats.profile?.name ||
    currentStats.profile?.pseudonym ||
    currentStats.leaderboard?.userName ||
    shortAddress(normalizeAddress(els.wallet.value));
  const rank = currentStats.leaderboard?.rank ? `Rank #${currentStats.leaderboard.rank}` : "Unofficial checker";
  const wallet = normalizeAddress(els.wallet.value);

  els.bannerWallet.textContent = `${rank} | ${shortAddress(wallet)}`;
  els.bannerTitle.textContent = `${name} wallet report`;
  els.bannerReward.textContent = currency.format(estimate.estimatedUsd);
  els.bannerVolume.textContent = compactCurrency.format(currentStats.totalVolume);
  els.bannerPnl.textContent = currency.format(currentStats.pnl);
  els.bannerBets.textContent = number.format(currentStats.totalBets);
  els.bannerMarkets.textContent = number.format(currentStats.marketSet.size);
  els.bannerScore.textContent = compactNumber(currentStats.score);
  els.bannerAssumption.textContent = `${compactCurrency.format(Number(els.estimateFdv.value) || 0)} / ${
    Number(els.estimatePool.value) || 0
  }%`;
  els.shareSection.classList.remove("is-hidden");
}

async function shareReport() {
  if (!currentStats.totalBets && !currentStats.totalVolume) return;
  const text = getShareText();

  try {
    if (navigator.share) {
      await navigator.share({ title: "Polymarket Airdrop Estimate", text });
    } else {
      await navigator.clipboard.writeText(text);
      setStatus("Copied", "ok");
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error(error);
      setStatus("Share failed", "error");
    }
  }
}

async function copyReport() {
  if (!currentStats.totalBets && !currentStats.totalVolume) return;
  try {
    await navigator.clipboard.writeText(getShareText());
    setStatus("Copied", "ok");
  } catch (error) {
    console.error(error);
    setStatus("Copy failed", "error");
  }
}

function getShareText() {
  const wallet = normalizeAddress(els.wallet.value);
  return `Polymarket wallet report for ${shortAddress(wallet)}
Volume: ${currency.format(currentStats.totalVolume)}
PnL: ${currency.format(currentStats.pnl)}
Bets: ${number.format(currentStats.totalBets)}
Markets: ${number.format(currentStats.marketSet.size)}
Airdrop score: ${number.format(currentStats.score)}
Estimated reward: ${currency.format(currentStats.estimatedUsd)}
Assumptions: ${compactCurrency.format(Number(els.estimateFdv.value) || 0)} FDV, ${Number(els.estimatePool.value) || 0}% pool
Unofficial estimate.`;
}

function compactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function downloadBanner() {
  if (!currentStats.totalBets && !currentStats.totalVolume) return;
  const canvas = document.createElement("canvas");
  const scale = 2;
  const width = 1200;
  const height = 630;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  const wallet = normalizeAddress(els.wallet.value);
  const title = els.bannerTitle.textContent;
  const assumption = `${compactCurrency.format(Number(els.estimateFdv.value) || 0)} FDV / ${
    Number(els.estimatePool.value) || 0
  }% pool`;

  drawBannerCanvas(ctx, {
    width,
    height,
    wallet: shortAddress(wallet),
    title,
    volume: compactCurrency.format(currentStats.totalVolume),
    pnl: currency.format(currentStats.pnl),
    bets: number.format(currentStats.totalBets),
    markets: number.format(currentStats.marketSet.size),
    score: compactNumber(currentStats.score),
    reward: currency.format(currentStats.estimatedUsd),
    assumption,
  });

  const link = document.createElement("a");
  link.download = `polymarket-airdrop-${shortAddress(wallet).replace("...", "-")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function drawBannerCanvas(ctx, data) {
  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, data.width, data.height);
  const gradient = ctx.createLinearGradient(0, 0, data.width, data.height);
  gradient.addColorStop(0, "#17364a");
  gradient.addColorStop(0.58, "#111820");
  gradient.addColorStop(1, "#123a35");
  roundRect(ctx, 44, 44, data.width - 88, data.height - 88, 28, gradient);

  ctx.fillStyle = "#8ba0b3";
  ctx.font = "700 26px Inter, Arial, sans-serif";
  ctx.fillText("POLYMARKET AIRDROP CHECKER", 82, 100);
  ctx.fillStyle = "#78e8dc";
  ctx.textAlign = "right";
  ctx.fillText("UNOFFICIAL ESTIMATE", data.width - 82, 100);
  ctx.textAlign = "left";

  ctx.fillStyle = "#f4f8fc";
  ctx.font = "800 54px Inter, Arial, sans-serif";
  ctx.fillText(data.title, 82, 178);
  ctx.fillStyle = "#8ba0b3";
  ctx.font = "600 26px Inter, Arial, sans-serif";
  ctx.fillText(`${data.wallet} | ${data.assumption}`, 82, 220);

  ctx.fillStyle = "#8ba0b3";
  ctx.font = "700 24px Inter, Arial, sans-serif";
  ctx.fillText("ESTIMATED REWARD", 82, 300);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 78px Inter, Arial, sans-serif";
  ctx.fillText(data.reward, 82, 385);

  const stats = [
    ["VOLUME", data.volume],
    ["PNL", data.pnl],
    ["BETS", data.bets],
    ["MARKETS", data.markets],
    ["SCORE", data.score],
  ];
  const startX = 82;
  const y = 460;
  const cardW = 198;
  stats.forEach(([label, value], index) => {
    const x = startX + index * 206;
    roundRect(ctx, x, y, cardW, 94, 14, "rgba(8, 13, 18, 0.38)", "rgba(139, 160, 179, 0.24)");
    ctx.fillStyle = "#8ba0b3";
    ctx.font = "700 18px Inter, Arial, sans-serif";
    ctx.fillText(label, x + 18, y + 34);
    ctx.fillStyle = "#f4f8fc";
    ctx.font = "800 26px Inter, Arial, sans-serif";
    ctx.fillText(value, x + 18, y + 70);
  });
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function shortAddress(address) {
  return address && address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function renderMatrix() {
  const fdvs = [2, 3, 4, 5, 6, 7].map((b) => b * 1_000_000_000);
  const pools = [1, 2, 3, 4, 5, 6, 7];
  const supply = Math.max(Number(els.supply.value) || 1, 1);
  const ecosystemScore = Math.max(Number(els.ecosystemScore.value) || 1, 1);
  const share = currentStats.score / ecosystemScore;

  els.matrix.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Pool</th>
          ${fdvs.map((fdv) => `<th>${compactCurrency.format(fdv)} FDV</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${pools
          .map(
            (poolPct) => `
              <tr>
                <th>${poolPct}%</th>
                ${fdvs
                  .map((fdv) => {
                    const poolUsd = fdv * (poolPct / 100);
                    const tokenPrice = fdv / supply;
                    const userUsd = poolUsd * share;
                    const tokens = userUsd / tokenPrice;
                    return `<td title="${number.format(tokens)} tokens">${compactCurrency.format(userUsd)}</td>`;
                  })
                  .join("")}
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderPositions() {
  els.positionCount.textContent = `${currentStats.positions.length} positions`;
  if (!currentStats.positions.length) {
    els.positionsBody.innerHTML = `<tr><td colspan="6" class="empty-cell">No open positions returned.</td></tr>`;
    return;
  }

  els.positionsBody.innerHTML = currentStats.positions
    .slice(0, 80)
    .map((position) => {
      const pnl = pickNumber(position.cashPnl, position.realizedPnl, position.pnl, position.profit, 0);
      return `
        <tr>
          <td class="market-name">${escapeHtml(position.title || position.question || position.market || "Unknown")}</td>
          <td>${escapeHtml(position.outcome || position.asset || "-")}</td>
          <td>${number.format(pickNumber(position.size, position.balance, position.shares))}</td>
          <td>${formatPrice(position.avgPrice || position.averagePrice)}</td>
          <td>${formatPrice(position.curPrice || position.currentPrice)}</td>
          <td class="${pnl >= 0 ? "profit" : "loss"}">${currency.format(pnl)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderTrades() {
  els.tradeCount.textContent = `${currentStats.trades.length} all-time trades`;
  if (!currentStats.trades.length) {
    els.tradesBody.innerHTML = `<tr><td colspan="6" class="empty-cell">No trades returned.</td></tr>`;
    return;
  }

  els.tradesBody.innerHTML = currentStats.trades
    .slice(0, 150)
    .map((trade) => {
      const size = pickNumber(trade.size, trade.amount, trade.shares);
      const price = pickNumber(trade.price, trade.avgPrice, trade.averagePrice);
      const value = pickNumber(trade.usdcSize, trade.value, trade.notional, size * price);
      const side = String(trade.side || trade.type || "BUY").toUpperCase();
      const category = inferCategory(trade);
      return `
        <tr>
          <td>${formatDate(trade.timestamp || trade.createdAt || trade.time)}</td>
          <td class="${side.includes("SELL") ? "side-sell" : "side-buy"}">${escapeHtml(side)}</td>
          <td>${escapeHtml(category)}</td>
          <td class="market-name">${escapeHtml(trade.title || trade.question || trade.market || trade.marketSlug || "Unknown")}</td>
          <td>${escapeHtml(trade.outcome || trade.outcomeName || "-")}</td>
          <td>${currency.format(value)}</td>
        </tr>
      `;
    })
    .join("");
}

function formatPrice(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed <= 1 ? `${number.format(parsed * 100)}c` : currency.format(parsed);
}

function formatDate(value) {
  if (!value) return "-";
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric > 1e12 ? numeric : numeric * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

els.button.addEventListener("click", checkWallet);
els.wallet.addEventListener("keydown", (event) => {
  if (event.key === "Enter") checkWallet();
});

[els.supply, els.ecosystemScore, els.betWeight, els.categoryWeight, els.estimateFdv, els.estimatePool].forEach((input) => {
  input.addEventListener("input", renderAll);
});
els.shareButton.addEventListener("click", shareReport);
els.copyButton.addEventListener("click", copyReport);
els.downloadButton.addEventListener("click", downloadBanner);

renderAll();
