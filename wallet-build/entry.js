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
import { TonConnectUI, THEME } from "@tonconnect/ui";
import { dexFactory, Client } from "@ston-fi/sdk";
import { StonApiClient } from "@ston-fi/api";

// Same values as REFERRAL_ADDRESS/REFERRAL_VALUE in index.html's main
// script — this bundle runs as its own separate script, so it can't see
// that script's top-level bindings. Keep both in sync if changed.
const REFERRAL_ADDRESS = "EQA7NubDDzupeKWC-hmTlCugHfySLrxftL9cwImY_wVPYMG9";
const REFERRAL_VALUE = 30; // units of 0.01% => 0.30%

const manifestUrl = new URL("tonconnect-manifest.json", window.location.href).toString();

// Telegram's own bottom-bar action button — feels native when this app is
// actually opened inside Telegram (initData is only populated in that
// case; a plain browser hitting this page directly won't have it, so the
// in-page Buy button stays the primary CTA there instead).
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
  tgApp.MainButton.onClick(() => window.handleBuy?.());
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

function toNanoTon(amountStr) {
  const n = Number(amountStr);
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 1e9).toString();
}

window.setBuyAmount = function (v) {
  const input = document.getElementById("buyAmount");
  if (input) input.value = v;
};

// Keeps the in-page Buy button and Telegram's MainButton (when present) in
// sync with each other — same label, same enabled/progress state.
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
  // can never reach handleBuy()'s own error text — show the reason here
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
  const label = tonConnectUI.connected ? `Buy $${coin ? coin.symbol : ""}` : "Connect wallet to buy";
  setBuyButtonsText(label, { disabled: false });
  syncMainButtonVisibility();
};

tonConnectUI?.onStatusChange(() => window.refreshBuyUi?.());

window.handleBuy = async function () {
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
    statusEl.textContent = "Connect your wallet, then tap Buy again.";
    statusEl.className = "buystatus";
    return;
  }

  if (sdkLoadError) {
    statusEl.textContent = "Swap engine failed to load (" + sdkLoadError + ") — use the link below.";
    statusEl.className = "buystatus err";
    return;
  }

  const nano = toNanoTon(document.getElementById("buyAmount")?.value);
  if (!nano) {
    statusEl.textContent = "Enter a TON amount first.";
    statusEl.className = "buystatus err";
    return;
  }

  setBuyButtonsText("Preparing swap…", { disabled: true, progress: true });
  statusEl.textContent = "";
  statusEl.className = "buystatus";

  try {
    const simulationResult = await apiClient.simulateSwap({
      offerAddress: "ton",
      askAddress: coin.tokenAddress,
      offerUnits: nano,
      slippageTolerance: "0.01",
    });

    const routerInfo = simulationResult.router;
    const dexContracts = dexFactory(routerInfo);
    const router = tonClient.open(dexContracts.Router.create(routerInfo.address));
    const proxyTon = dexContracts.pTON.create(routerInfo.ptonMasterAddress);

    const txParams = await router.getSwapTonToJettonTxParams({
      userWalletAddress: tonConnectUI.wallet?.account?.address,
      offerAmount: simulationResult.offerUnits,
      minAskAmount: simulationResult.minAskUnits,
      askJettonAddress: simulationResult.askAddress,
      proxyTon,
      referralAddress: REFERRAL_ADDRESS,
      referralValue: REFERRAL_VALUE,
      queryId: Date.now(),
    });

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
  } catch (e) {
    console.error("Swap failed:", e);
    statusEl.textContent = (e?.message || "Swap failed") + " — try the direct STON.fi link below.";
    statusEl.className = "buystatus err";
    tgApp?.HapticFeedback?.notificationOccurred?.("error");
  } finally {
    window.refreshBuyUi?.();
  }
};
