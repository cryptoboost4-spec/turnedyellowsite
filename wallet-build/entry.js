// TON Board wallet/swap bundle.
//
// Why this file exists: two different CDNs (esm.sh, then jsdelivr's +esm)
// both failed to resolve @ston-fi/sdk's dependency tree correctly when
// loaded live in a browser via dynamic import() — different errors each
// time ("Failed to fetch", then "@ton/ton does not provide an export named
// 'address'"), which points at CDN-side ESM resolution being unreliable
// for this specific package rather than a fluke of one provider. This file
// bundles the real npm packages with esbuild instead, so none of that
// resolution happens in the visitor's browser at all — it's already done
// here, at build time, and the result is one plain script this page loads
// like any other local file.
//
// To rebuild after changing this file: from this directory,
//   npm install && npm run build
// which writes ../wallet-bundle.js directly (commit that file too).

import "./polyfills.js";
import { TonConnectUI, THEME, toUserFriendlyAddress } from "@tonconnect/ui";
import { dexFactory, Client } from "@ston-fi/sdk";
import { StonApiClient } from "@ston-fi/api";

// Same values as REFERRAL_ADDRESS/REFERRAL_VALUE in index.html's main
// script — this bundle runs as its own separate script, so it can't see
// that script's top-level bindings. Keep both in sync if changed.
const REFERRAL_ADDRESS = "EQA7NubDDzupeKWC-hmTlCugHfySLrxftL9cwImY_wVPYMG9";
const REFERRAL_VALUE = 30; // units of 0.01% => 0.30%

// STON.fi's REST API rejects the literal string "ton" for offer/ask
// address ("Failed to deserialize query string: offer_address: invalid
// jetton address" — confirmed live) despite their docs' placeholder text
// implying it's accepted. This is the real value: the native-TON
// pseudo-address their own reference demo app uses
// (examples/next-js-app/constants.ts in ston-fi/sdk on GitHub) — same
// address that shows up as "Toncoin" itself in GeckoTerminal's listings.
const TON_PSEUDO_ADDRESS = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

const manifestUrl = new URL("tonconnect-manifest.json", window.location.href).toString();

// Telegram's own bottom-bar action button — feels native when this app is
// actually opened inside Telegram (initData is only populated in that
// case; a plain browser hitting this page directly won't have it, so the
// in-page trade button stays the primary CTA there instead).
const tgApp = window.Telegram?.WebApp;
const inTelegram = !!(tgApp && tgApp.initData);
if (inTelegram) document.body.classList.add("in-telegram");

let tonConnectUI = null;
let connectLoadError = null;
try {
  tonConnectUI = new TonConnectUI({
    manifestUrl,
    buttonRootId: "ton-connect-button",
    // Match the app's own TON-blue accent instead of TonConnect's default
    // styling. Their docs advise against CSS overrides of the widget, so
    // this uses their supported theming API instead.
    uiPreferences: {
      theme: THEME.DARK,
      borderRadius: "s",
      colorsSet: { [THEME.DARK]: { connectButton: { background: "#0098EA" } } },
    },
  });
} catch (e) {
  console.error("TonConnect UI failed to initialize:", e);
  connectLoadError = e?.message || String(e);
}

if (inTelegram && tgApp?.MainButton) {
  tgApp.MainButton.setParams({ color: "#0098EA", text_color: "#03131f" });
  tgApp.MainButton.onClick(() => window.handleTrade?.());
}

let tonClient, apiClient;
let sdkLoadError = null;
try {
  tonClient = new Client({ endpoint: "https://toncenter.com/api/v2/jsonRPC" });
  apiClient = new StonApiClient();
} catch (e) {
  console.error("Failed to set up STON.fi swap SDK:", e);
  sdkLoadError = e?.message || String(e);
}

// STON.fi's SDK is built on `ofetch`, which puts the actual parsed
// response body (the real reason a 400 etc. happened) on `error.data` —
// not in `error.message`, which is just the status line. A bare "400"
// with no body text isn't an accurate error, just a status code, so pull
// the real reason out when it's there.
function describeError(e) {
  const parts = [];
  if (e?.message) parts.push(e.message);
  const data = e?.data;
  if (data) {
    if (typeof data === "string") parts.push(data);
    else if (data.message) parts.push(String(data.message));
    else if (data.error) parts.push(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
    else {
      try { parts.push(JSON.stringify(data)); } catch { /* not serializable, skip */ }
    }
  }
  return parts.filter(Boolean).join(" — ") || "Swap failed";
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}

// Floors rather than rounds so a Sell amount built from this can never come
// out slightly above what the user typed (or above their balance, for the
// MAX preset) — a wallet rejection from a rounded-up amount is a worse
// failure mode than a fractional unit of dust left behind.
function toNanoUnits(amountStr, decimals) {
  const n = Number(amountStr);
  if (!isFinite(n) || n <= 0) return null;
  return Math.floor(n * Math.pow(10, decimals)).toString();
}

function formatDisplayUnits(units, decimals) {
  const n = Number(units) / Math.pow(10, decimals);
  if (!isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

// ---- Trade direction state ----
// "buy" = TON -> Jetton, "sell" = Jetton -> TON. Both directions share the
// same amount input, preview panel and debug panel; only which asset is
// the "offer" side and which is the "ask" side flips.
let tradeMode = "buy";

function offerAsset(coin) {
  return tradeMode === "buy"
    ? { address: TON_PSEUDO_ADDRESS, decimals: 9, symbol: "TON" }
    : { address: coin.tokenAddress, decimals: coin.decimals ?? 9, symbol: coin.symbol };
}
function askAsset(coin) {
  return tradeMode === "buy"
    ? { address: coin.tokenAddress, decimals: coin.decimals ?? 9, symbol: coin.symbol }
    : { address: TON_PSEUDO_ADDRESS, decimals: 9, symbol: "TON" };
}
function sideLabel(asset) {
  return asset.symbol === "TON" ? "TON" : "$" + asset.symbol;
}

// STON.fi's own per-asset risk data (honeypot/suspicious/fake/blacklisted/
// deprecated flags, liquidity tier) — exposed for index.html's Trust
// signals card, which has no other way to reach the STON.fi SDK/apiClient
// living in this separate bundle.
window.loadAssetTrust = async function (address) {
  if (!apiClient) return null;
  try {
    return await apiClient.getAsset(address);
  } catch (e) {
    console.error("STON.fi asset lookup failed:", e, "response body:", e?.data);
    return null;
  }
};

// Shared by the live preview and the real trade flow — both hit the exact
// same STON.fi endpoint, so there's one place building the request and
// logging it to the debug panel instead of copies that could drift.
async function runSimulate(offerAddress, askAddress, nano) {
  try {
    return await apiClient.simulateSwap({
      offerAddress,
      askAddress,
      offerUnits: nano,
      slippageTolerance: "0.01",
    });
  } catch (e) {
    console.error("Simulate failed:", e, "response body:", e?.data);
    throw e;
  }
}

// ---- Sell-side balance lookup ----
// STON.fi's asset catalog (getWalletAssets) already knows every asset
// balance for a wallet in one call — including the native TON balance
// (kind "Ton"), not just jettons — so the same lookup covers both Buy's
// TON balance and Sell's jetton balance; no need to resolve the user's
// jetton-wallet contract address ourselves just to read a balance.
let balanceState = { loading: false, raw: null, decimals: 9, error: null };
let walletAssetsCache = null; // { address, assets } — cleared on account change or after a trade

async function fetchWalletAssets(address) {
  if (walletAssetsCache && walletAssetsCache.address === address) return walletAssetsCache.assets;
  const assets = await apiClient.getWalletAssets(address);
  walletAssetsCache = { address, assets };
  return assets;
}

window.isWalletConnected = function () {
  return !!tonConnectUI?.connected;
};
window.connectWallet = function () {
  tonConnectUI?.openModal();
};

// STON.fi's own risk tags — same list the Trust signals card on the detail
// page treats as "don't trust this" (see index.html's loadStonfiTrustSignals).
// Reused here so a flagged jetton gets the same treatment in the wallet.
const RISK_TAGS = ["asset:honeypot", "asset:suspicious", "asset:fake"];

// Every non-zero balance in the wallet (including native TON), priced in
// USD from STON.fi's own feed — powers the Portfolio screen. Separate
// from loadBalance()/balanceState above, which only track the single
// asset relevant to the current Buy/Sell screen.
//
// Splits into two buckets rather than one flat list: TON wallets
// routinely accumulate unsolicited "airdropped" jettons (spam tokens with
// no real liquidity, sometimes carrying phishing links in the name) —
// mixing those into a new user's real holdings, sorted by the same $
// column, makes the screen both confusing and a bigger phishing surface.
// Anything STON.fi has no price for, or has explicitly flagged
// (blacklisted / honeypot / suspicious / fake), goes to `unlisted`
// instead of `holdings` and is excluded from `totalUsd`.
window.loadPortfolio = async function () {
  if (!apiClient || !tonConnectUI?.connected) return null;
  try {
    const rawAddress = tonConnectUI.wallet?.account?.address;
    const address = rawAddress ? toUserFriendlyAddress(rawAddress) : null;
    const assets = await fetchWalletAssets(rawAddress);
    const holdings = [];
    const unlisted = [];
    let totalUsd = 0;
    for (const a of assets) {
      if (a.kind === "NotAnAsset" || !a.balance || a.balance === "0") continue;
      const decimals = a.decimals ?? 9;
      const amount = Number(a.balance) / Math.pow(10, decimals);
      const price = Number(a.dexPriceUsd ?? a.thirdPartyPriceUsd ?? 0);
      const usd = amount * price;
      const isTon = a.kind === "Ton";
      const tags = a.tags || [];
      const flagged = !isTon && (!!a.blacklisted || tags.some((t) => RISK_TAGS.includes(t)));
      const item = {
        address: a.contractAddress,
        kind: a.kind,
        symbol: a.symbol,
        name: a.displayName || a.symbol,
        imageUrl: a.imageUrl || null,
        amount,
        usd,
        flagged,
      };
      if (!isTon && (flagged || !(price > 0))) {
        unlisted.push(item);
      } else {
        totalUsd += usd;
        holdings.push(item);
      }
    }
    // TON pinned first — it's the gas asset every other trade depends on,
    // not just another line item to rank by $ value.
    holdings.sort((a, b) => (a.kind === "Ton" ? -1 : b.kind === "Ton" ? 1 : b.usd - a.usd));
    unlisted.sort((a, b) => a.name.localeCompare(b.name));
    return { totalUsd, holdings, unlisted, address };
  } catch (e) {
    console.error("Portfolio load failed:", e, "response body:", e?.data);
    return null;
  }
};

async function loadBalance() {
  const coin = window.currentDetailCoin;
  if (!coin || !tonConnectUI?.connected || !apiClient) return;
  const myCoin = coin;
  const myMode = tradeMode;
  const decimals = myMode === "buy" ? 9 : (coin.decimals ?? 9);
  balanceState = { loading: true, raw: null, decimals, error: null };
  updateBalanceHint();
  try {
    const address = tonConnectUI.wallet?.account?.address;
    const assets = await fetchWalletAssets(address);
    if (window.currentDetailCoin !== myCoin || tradeMode !== myMode) return; // navigated/switched meanwhile
    const match = myMode === "buy"
      ? assets.find((a) => a.kind === "Ton")
      : assets.find((a) => a.contractAddress === myCoin.tokenAddress);
    balanceState = {
      loading: false,
      raw: match?.balance ?? "0",
      decimals: match?.decimals ?? decimals,
      error: null,
    };
  } catch (e) {
    if (window.currentDetailCoin !== myCoin || tradeMode !== myMode) return;
    balanceState = { loading: false, raw: null, decimals, error: describeError(e) };
  }
  updateBalanceHint();
}

function updateBalanceHint() {
  const el = document.getElementById("balanceHint");
  if (!el) return;
  const coin = window.currentDetailCoin;
  if (!tonConnectUI?.connected) { el.textContent = "Connect wallet to see balance"; return; }
  if (balanceState.loading) { el.textContent = "Loading balance…"; return; }
  if (balanceState.error) { el.textContent = "Balance unavailable"; return; }
  if (balanceState.raw == null) { el.textContent = ""; return; }
  const label = tradeMode === "buy" ? "TON" : "$" + escHtml(coin ? coin.symbol : "");
  el.innerHTML = `Balance: <b>${formatDisplayUnits(balanceState.raw, balanceState.decimals)} ${label}</b>`;
}

// ---- Mode switching (Buy <-> Sell) ----
window.setTradeMode = function (mode) {
  if (mode !== "buy" && mode !== "sell") return;
  tradeMode = mode;
  const coin = window.currentDetailCoin;

  document.getElementById("tabBuy")?.classList.toggle("active", mode === "buy");
  document.getElementById("tabSell")?.classList.toggle("active", mode === "sell");
  document.getElementById("buyPresetRow")?.toggleAttribute("hidden", mode !== "buy");
  document.getElementById("sellPresetRow")?.toggleAttribute("hidden", mode !== "sell");
  document.getElementById("buyBtn")?.classList.toggle("sell-mode", mode === "sell");

  const unitEl = document.getElementById("amountUnit");
  if (unitEl) unitEl.textContent = mode === "buy" ? "TON" : (coin ? coin.symbol : "");

  const input = document.getElementById("buyAmount");
  if (input) { input.value = ""; input.dataset.exactNano = ""; }
  const box = document.getElementById("swapPreview");
  if (box) { box.className = "swappreview"; box.innerHTML = ""; }
  const statusEl = document.getElementById("buyStatus");
  if (statusEl) { statusEl.textContent = ""; statusEl.className = "buystatus"; }

  updateBalanceHint();
  loadBalance();
  window.refreshBuyUi?.();
};

window.setBuyAmount = function (v) {
  const input = document.getElementById("buyAmount");
  if (input) { input.value = v; input.dataset.exactNano = ""; }
  window.previewSwap?.();
};

// Reserved out of a Buy MAX so the transaction always has TON left over
// for its own gas — using the literal full balance would leave nothing to
// pay the network fee and the swap would fail outright.
const BUY_GAS_RESERVE_NANO = 300000000n; // 0.3 TON

window.setMaxBuy = function () {
  const input = document.getElementById("buyAmount");
  if (!input) return;
  if (!tonConnectUI?.connected) { tonConnectUI?.openModal(); return; }
  if (balanceState.raw == null) return;

  const rawBal = BigInt(balanceState.raw);
  const nano = rawBal > BUY_GAS_RESERVE_NANO ? rawBal - BUY_GAS_RESERVE_NANO : 0n;
  if (nano <= 0n) return;
  input.value = (Number(nano) / 1e9).toString();
  input.dataset.exactNano = nano.toString();
  window.previewSwap?.();
};

// Sell presets are fractions of the wallet's current balance (25/50/75%,
// or MAX) rather than fixed amounts — a user selling almost never thinks
// in absolute token counts. MAX carries the exact on-chain balance through
// as a BigInt so it can never be rounded up past what the wallet holds;
// only the displayed input value goes through float formatting.
window.setSellFraction = function (fraction) {
  const input = document.getElementById("buyAmount");
  if (!input) return;
  if (!tonConnectUI?.connected) { tonConnectUI?.openModal(); return; }
  if (balanceState.raw == null) return;

  const rawBal = BigInt(balanceState.raw);
  const nano = fraction >= 1 ? rawBal : (rawBal * BigInt(Math.round(fraction * 10000))) / 10000n;
  input.value = (Number(nano) / Math.pow(10, balanceState.decimals)).toString();
  input.dataset.exactNano = nano.toString();
  window.previewSwap?.();
};

// Live preview: how many tokens/TON this trade produces, price impact,
// minimum received after slippage. simulateSwap() doesn't need a
// connected wallet, so this works before the trade button is even
// tappable — and as a side effect, it's the fastest way to see whether a
// swap will succeed at all, since it hits the exact same STON.fi endpoint
// handleTrade() does.
let previewToken = 0;
window.previewSwap = function () {
  const myToken = ++previewToken;
  const box = document.getElementById("swapPreview");
  const coin = window.currentDetailCoin;
  if (!box || !coin) return;

  const input = document.getElementById("buyAmount");
  const offer = offerAsset(coin);
  const ask = askAsset(coin);
  const nano = input?.dataset.exactNano || toNanoUnits(input?.value, offer.decimals);
  if (!nano) {
    box.className = "swappreview";
    box.innerHTML = "";
    return;
  }
  if (!apiClient) {
    box.className = "swappreview show";
    box.innerHTML = `<div class="swappreview-err">Swap engine unavailable${sdkLoadError ? " (" + sdkLoadError + ")" : ""}.</div>`;
    return;
  }

  box.className = "swappreview show";
  box.innerHTML = `<div class="swappreview-loading">Getting a price…</div>`;

  setTimeout(async () => {
    if (myToken !== previewToken) return; // a newer keystroke superseded this one
    try {
      const sim = await runSimulate(offer.address, ask.address, nano);
      if (myToken !== previewToken) return;

      const fmt = (units) => formatDisplayUnits(units, ask.decimals);
      const impactPct = Number(sim.priceImpact) * 100;
      const impactClass = impactPct >= 10 ? "bad" : impactPct >= 3 ? "warn" : "";

      box.innerHTML = `
        <div class="swappreview-row"><span class="k">You receive (est.)</span><span class="v primary">${fmt(sim.askUnits)} ${sideLabel(ask)}</span></div>
        <div class="swappreview-row"><span class="k">Minimum received</span><span class="v">${fmt(sim.minAskUnits)} ${sideLabel(ask)}</span></div>
        <div class="swappreview-row"><span class="k">Price impact</span><span class="v ${impactClass}">${impactPct.toFixed(2)}%</span></div>
        <div class="swappreview-row"><span class="k">Fee</span><span class="v">${(Number(sim.feePercent) || 0).toFixed(2)}%</span></div>
      `;
    } catch (e) {
      if (myToken !== previewToken) return;
      console.error("Price preview failed:", e, "response body:", e?.data);
      box.innerHTML = `<div class="swappreview-err">${describeError(e)}</div>`;
    }
  }, 500);
};

// Keeps the in-page trade button and Telegram's MainButton (when present)
// in sync with each other — same label, same enabled/progress state.
function setBuyButtonsText(text, opts = {}) {
  const btn = document.getElementById("buyBtn");
  if (btn) {
    btn.textContent = text;
    btn.disabled = !!opts.disabled;
  }
  if (inTelegram && tgApp?.MainButton) {
    tgApp.MainButton.setText(text);
    if (opts.progress) tgApp.MainButton.showProgress(false);
    else tgApp.MainButton.hideProgress();
    if (opts.disabled) tgApp.MainButton.disable();
    else tgApp.MainButton.enable();
  }
}

function syncMainButtonVisibility() {
  if (!inTelegram || !tgApp?.MainButton) return;
  const detailActive = document.getElementById("screen-detail")?.classList.contains("active");
  if (detailActive) tgApp.MainButton.show();
  else tgApp.MainButton.hide();
}
window.syncMainButton = syncMainButtonVisibility;
window.hideMainButton = function () {
  if (inTelegram) tgApp?.MainButton?.hide();
};

window.refreshBuyUi = function () {
  const statusEl = document.getElementById("buyStatus");
  // The button disables itself in both failure states below, so a tap
  // can never reach handleTrade()'s own error text — show the reason here
  // instead, so it's visible without needing to open the console.
  if (!tonConnectUI) {
    setBuyButtonsText("Wallet unavailable", { disabled: true });
    if (statusEl) {
      statusEl.textContent = "Wallet connect failed to load (" + (connectLoadError || "unknown error") + ").";
      statusEl.className = "buystatus err";
    }
    syncMainButtonVisibility();
    return;
  }
  if (sdkLoadError) {
    setBuyButtonsText("Swap engine unavailable", { disabled: true });
    if (statusEl) {
      statusEl.textContent = "Swap engine failed to load (" + sdkLoadError + ").";
      statusEl.className = "buystatus err";
    }
    syncMainButtonVisibility();
    return;
  }
  const coin = window.currentDetailCoin;
  const symbol = coin ? coin.symbol : "";
  const label = !tonConnectUI.connected
    ? "Connect wallet to trade"
    : tradeMode === "buy" ? `Buy $${symbol}` : `Sell $${symbol}`;
  setBuyButtonsText(label, { disabled: false });
  syncMainButtonVisibility();
};

tonConnectUI?.onStatusChange(() => {
  window.refreshBuyUi?.();
  walletAssetsCache = null; // wallet/account may have changed
  updateBalanceHint();
  loadBalance();
});

window.handleTrade = async function () {
  const coin = window.currentDetailCoin;
  const statusEl = document.getElementById("buyStatus");
  if (!coin || !statusEl) return;

  if (!tonConnectUI) {
    statusEl.textContent = "Wallet connect failed to load (" + (connectLoadError || "unknown error") + ") — use the link below.";
    statusEl.className = "buystatus err";
    return;
  }

  if (!tonConnectUI.connected) {
    tonConnectUI.openModal();
    statusEl.textContent = "Connect your wallet, then try again.";
    statusEl.className = "buystatus";
    return;
  }

  if (sdkLoadError) {
    statusEl.textContent = "Swap engine failed to load (" + sdkLoadError + ") — use the link below.";
    statusEl.className = "buystatus err";
    return;
  }

  const input = document.getElementById("buyAmount");
  const offer = offerAsset(coin);
  const ask = askAsset(coin);
  const nano = input?.dataset.exactNano || toNanoUnits(input?.value, offer.decimals);
  if (!nano) {
    statusEl.textContent = tradeMode === "buy" ? "Enter a TON amount first." : "Enter an amount to sell first.";
    statusEl.className = "buystatus err";
    return;
  }
  if (balanceState.raw != null && BigInt(nano) > BigInt(balanceState.raw)) {
    statusEl.textContent = "Amount exceeds your balance.";
    statusEl.className = "buystatus err";
    return;
  }

  setBuyButtonsText("Preparing swap…", { disabled: true, progress: true });
  statusEl.textContent = "";
  statusEl.className = "buystatus";

  try {
    const simulationResult = await runSimulate(offer.address, ask.address, nano);

    const routerInfo = simulationResult.router;
    const dexContracts = dexFactory(routerInfo);
    const router = tonClient.open(dexContracts.Router.create(routerInfo.address));
    const proxyTon = dexContracts.pTON.create(routerInfo.ptonMasterAddress);

    let txParams;
    if (tradeMode === "buy") {
      txParams = await router.getSwapTonToJettonTxParams({
        userWalletAddress: tonConnectUI.wallet?.account?.address,
        offerAmount: simulationResult.offerUnits,
        minAskAmount: simulationResult.minAskUnits,
        askJettonAddress: simulationResult.askAddress,
        proxyTon,
        referralAddress: REFERRAL_ADDRESS,
        referralValue: REFERRAL_VALUE,
        queryId: Date.now(),
      });
    } else {
      txParams = await router.getSwapJettonToTonTxParams({
        userWalletAddress: tonConnectUI.wallet?.account?.address,
        offerJettonAddress: simulationResult.offerAddress,
        offerAmount: simulationResult.offerUnits,
        minAskAmount: simulationResult.minAskUnits,
        proxyTon,
        referralAddress: REFERRAL_ADDRESS,
        referralValue: REFERRAL_VALUE,
        queryId: Date.now(),
      });
    }

    const message = {
      address: txParams.to.toString(),
      amount: txParams.value.toString(),
      payload: txParams.body.toBoc().toString("base64"),
    };

    setBuyButtonsText("Confirm in your wallet…", { disabled: true, progress: true });
    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [message],
    });

    statusEl.textContent = "Sent — check your wallet for confirmation.";
    statusEl.className = "buystatus ok";
    tgApp?.HapticFeedback?.notificationOccurred?.("success");
    if (input) { input.value = ""; input.dataset.exactNano = ""; }
    walletAssetsCache = null; // balance just changed on-chain
    loadBalance();
  } catch (e) {
    console.error("Swap failed:", e, "response body:", e?.data);
    statusEl.textContent = describeError(e) + " — try the direct STON.fi link below.";
    statusEl.className = "buystatus err";
    tgApp?.HapticFeedback?.notificationOccurred?.("error");
  } finally {
    window.refreshBuyUi?.();
  }
};

// Kept as an alias — index.html's Telegram MainButton wiring and any
// cached copy of the page may still reference the old name.
window.handleBuy = window.handleTrade;
