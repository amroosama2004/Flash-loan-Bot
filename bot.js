// bot.js - Hybrid Flash Loan & Trading starter (DRY_RUN safe by default)
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const { getAmountsOut, getRouterContract } = require('./dex');
const { initTwilio, sendWhatsApp } = require('./notifier');

const CHAIN = process.env.CHAIN || 'polygon';
const RPC = process.env.RPC_POLYGON || 'https://polygon-rpc.com';
const provider = new ethers.JsonRpcProvider(RPC);
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const wallet = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;
const walletAddress = wallet ? wallet.address : 'NO_KEY';

const TARGET_DAILY_PERCENT = Number(process.env.TARGET_DAILY_PERCENT || 12);
const SAFETY_THRESHOLD = Number(process.env.SAFETY_THRESHOLD || 75);
const MAX_SLIPPAGE = Number(process.env.MAX_SLIPPAGE_PERCENT || 0.5) / 100;
const MAX_TRADE_PERCENT = Number(process.env.MAX_TRADE_PERCENT || 5) / 100;
const DRY_RUN = (process.env.DRY_RUN === 'true');

initTwilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const NOTIFY_PHONE = process.env.NOTIFY_PHONE;

function log(...args) { console.log(new Date().toISOString(), ...args); }
function appendLog(line) { try { fs.appendFileSync('trades.log', line + '\n'); } catch(e){} }

// ====== Configure watch pairs (example addresses on Polygon) ======
// Replace token addresses with exact addresses and decimals for production.
// Example: WMATIC (native wrapper) and WETH on Polygon.
const WATCH_PAIRS = [
  // WMATIC -> WETH (example addresses; replace with correct tokens)
  { chain: 'polygon', tokenIn: '0x0000000000000000000000000000000000001010', tokenOut: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', router: 'quickswap' }
];

// ====== Helpers ======
async function getNativeBalance() {
  if (!wallet) return 0;
  const bal = await provider.getBalance(wallet.address);
  return Number(ethers.formatEther(bal));
}

async function estimateGasCost() {
  const gasPrice = await provider.getGasPrice();
  const gasLimit = ethers.BigNumber.from('300000');
  return Number(ethers.utils.formatEther(gasPrice.mul(gasLimit)));
}

function computeSafety(profitPercent, expectedSlippagePercent) {
  const score = Math.max(0, 100 - (expectedSlippagePercent*100)*2 - Math.max(0, 10 - profitPercent));
  return Math.min(100, score);
}

async function evaluateOpportunity(pair, tradeAmountNative) {
  // tradeAmountNative in "native units" assumed 18 decimals - adjust per token decimals in production
  const amountInRaw = ethers.parseUnits(String(tradeAmountNative), 18);
  const amounts = await getAmountsOut(provider, CHAIN, pair.router, amountInRaw, [pair.tokenIn, pair.tokenOut]);
  if (!amounts) return null;
  const amountOutRaw = amounts[amounts.length - 1];
  const amountOut = Number(ethers.formatUnits(amountOutRaw, 18));
  const gasEstimate = await estimateGasCost();
  const inHuman = tradeAmountNative;
  const profit = amountOut - inHuman - gasEstimate;
  const profitPercent = (profit / Math.max(0.000001, inHuman)) * 100;
  const expectedSlippagePercent = Math.max(0.001, Math.min(0.02, (inHuman / Math.max(0.0001, amountOut))));
  const safetyScore = computeSafety(profitPercent, expectedSlippagePercent);
  return { inHuman, amountOut, gasEstimate, profit, profitPercent, safetyScore, router: pair.router, path: [pair.tokenIn, pair.tokenOut] };
}

async function executeSwap(pair, tradeAmountNative) {
  if (!wallet) {
    log('No wallet key - cannot execute.');
    return { success:false, error:'no-key' };
  }
  const router = getRouterContract(provider, CHAIN, pair.router).connect(wallet);
  const amountIn = ethers.parseUnits(String(tradeAmountNative), 18);
  try {
    const amounts = await router.getAmountsOut(amountIn, [pair.tokenIn, pair.tokenOut]);
    const amountOut = amounts[amounts.length - 1];
    const amountOutMin = amountOut.mul(ethers.BigNumber.from(String(10000 - Math.floor(MAX_SLIPPAGE*10000)))).div(10000);
    const deadline = Math.floor(Date.now()/1000) + 60*2;
    if (DRY_RUN) {
      log('[DRY_RUN] simulate swap', tradeAmountNative, 'via', pair.router, 'minOut', ethers.formatUnits(amountOutMin,18));
      return { success:true, txHash:'DRY_RUN' };
    }
    const tx = await router.swapExactTokensForTokens(amountIn, amountOutMin, [pair.tokenIn, pair.tokenOut], wallet.address, deadline, { gasLimit: 800000 });
    const receipt = await tx.wait();
    return { success:true, txHash: receipt.transactionHash };
  } catch (e) {
    return { success:false, error: e.message || String(e) };
  }
}

// ====== Main Loop ======
async function mainLoop() {
  log('Bot started', 'wallet:', walletAddress, 'DRY_RUN=', DRY_RUN);
  let consecutiveSuccess = 0;
  setInterval(async () => {
    try {
      const nativeBal = await getNativeBalance();
      if (nativeBal < Number(process.env.MIN_NATIVE_BALANCE || 0.0001)) {
        log('Insufficient native balance:', nativeBal);
        return;
      }
      const tradeAmount = Math.max(0.0001, nativeBal * MAX_TRADE_PERCENT);
      for (const pair of WATCH_PAIRS) {
        if (pair.chain !== CHAIN) continue;
        const evalRes = await evaluateOpportunity(pair, tradeAmount);
        if (!evalRes) continue;
        log('Eval', pair.router, 'profit%=', evalRes.profitPercent.toFixed(4), 'safety=', evalRes.safetyScore.toFixed(2));
        const perLoopTarget = TARGET_DAILY_PERCENT/24;
        if (evalRes.profitPercent >= perLoopTarget && evalRes.safetyScore >= SAFETY_THRESHOLD) {
          log('Opportunity accepted. Executing...');
          const exec = await executeSwap(pair, tradeAmount);
          if (exec.success) {
            consecutiveSuccess++;
            const msg = `✅ صفقة ناجحة\nربح تقريبي: ${evalRes.profit.toFixed(6)}\nالرصيد الآن (تقريبي): ${(nativeBal + evalRes.profit).toFixed(6)}\nprofit%: ${evalRes.profitPercent.toFixed(3)}\nsafety: ${evalRes.safetyScore.toFixed(2)}\nTx: ${exec.txHash}`;
            log(msg);
            appendLog(`${new Date().toISOString()},SUCCESS,${exec.txHash},${evalRes.profit.toFixed(6)},${(nativeBal+evalRes.profit).toFixed(6)}`);
            if (WHATSAPP_FROM && NOTIFY_PHONE) await sendWhatsApp(WHATSAPP_FROM, NOTIFY_PHONE, msg);
          } else {
            appendLog(`${new Date().toISOString()},FAIL,${exec.error || 'error'}`);
            log('Execution failed:', exec.error);
            consecutiveSuccess = 0;
          }
        }
      }
    } catch (err) {
      console.error('[loop] error', err.message || err);
    }
  }, 15 * 1000); // run every 15s - tune later
}

mainLoop().catch(e => console.error(e));
