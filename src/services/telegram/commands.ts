// src/services/telegram/commands.ts 
// Catalyst Apex Trader v2.2 — Telegram Command Handlers 
// 
// Provides handlers for: 
// - /pause         
→ Stop auto-trading, close all positions 
// - /resume        
// - /positions     
// - /status        
// - /risk          
// - /kill          
→ Resume auto-trading 
→ Show open positions 
→ Show current regime + stats 
→ Show risk state + limits 
→ Emergency stop (same as /pause but more aggressive) 
// - /addwallet     
→ Add manual wallet to track 
// - /help          
// 
→ Show command list 
// All commands return formatted Telegram messages 
import { supabase } from "../../db/supabase"; 
import { getRegimeState } from "../scoring/bull-run-intelligence"; 
import { getPortfolioSummary } from "../scoring/portfolio-correlation"; 
import { listTrackedWallets, addManualWallet } from "../social/smart-wallet-tracker"; 
import axios from "axios"; 
// ─── Types 
────────────────────────────────────────────────────────────
──────── 
export interface CommandResult { 
success: boolean; 
message: string; 
shouldNotify: boolean; 
} 
// ─── Helper: Format numbers for Telegram 
────────────────────────────────────── 
function formatUSD(n: number): string { 
if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`; 
if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`; 
return `$${n.toFixed(2)}`; 
} 
function formatPercent(n: number): string { 
return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; 
} 
// ─── /pause Command 
─────────────────────────────────────────────────────────── 
 
export async function cmdPause(): Promise<CommandResult> { 
  try { 
    // Update risk_state to paused 
    const { error } = await supabase 
      .from("risk_state") 
      .update({ is_paused: true }) 
      .eq("id", 1); 
 
    if (error) { 
      return { success: false, message: `
❌
 Failed to pause: ${error.message}`, shouldNotify: false 
}; 
    } 
 
    // Log this action 
    await supabase.from("security_logs").insert({ 
      level: "INFO", 
      reason: "AUTO_TRADE_PAUSED", 
      details: "Pause command executed via Telegram", 
      timestamp: new Date().toISOString(), 
    }); 
 
    return { 
      success: true, 
      message: `
⏸
 **AUTO-TRADING PAUSED**\nNo new positions will be opened.\nExisting 
positions will continue to be monitored.`, 
      shouldNotify: true, 
    }; 
  } catch (err: any) { 
    return { success: false, message: `
❌
 Error: ${err.message}`, shouldNotify: false }; 
  } 
} 
 
// ─── /resume Command 
────────────────────────────────────────────────────────── 
 
export async function cmdResume(): Promise<CommandResult> { 
  try { 
    const { error } = await supabase 
      .from("risk_state") 
      .update({ is_paused: false }) 
      .eq("id", 1); 
 
    if (error) { 
      return { success: false, message: `
❌
 Failed to resume: ${error.message}`, shouldNotify: 
false }; 
    } 
 
    await supabase.from("security_logs").insert({ 
      level: "INFO", 
      reason: "AUTO_TRADE_RESUMED", 
      details: "Resume command executed via Telegram", 
      timestamp: new Date().toISOString(), 
    }); 
 
    return { 
      success: true, 
      message: `
✅
 **AUTO-TRADING RESUMED**\nScanning for signals and opening new 
positions.`, 
      shouldNotify: true, 
    }; 
  } catch (err: any) { 
    return { success: false, message: `
❌
 Error: ${err.message}`, shouldNotify: false }; 
  } 
} 
 
// ─── /positions Command 
──────────────────────────────────────────────────────── 
 
export async function cmdPositions(): Promise<CommandResult> { 
  try { 
    const { data: trades } = await supabase 
      .from("trades") 
      .select("id, status, amount_usd, pnl_usd, opened_at, pairs(ticker, name, address)") 
      .eq("status", "open") 
      .order("opened_at", { ascending: false }); 
 
    if (!trades || trades.length === 0) { 
      return { 
        success: true, 
        message: `
📈
 **OPEN POSITIONS**\nNo open positions.`, 
        shouldNotify: false, 
      }; 
    } 
 
    let message = `
📈
 **OPEN POSITIONS** (${trades.length})\n\n`; 
 
    let totalExposure = 0; 
    for (const trade of trades) { 
      const pair = (trade as any).pairs; 
      const ticker = pair?.ticker ?? "?"; 
      const pnl = trade.pnl_usd ?? 0; 
      const pnlStr = pnl >= 0 ? `+${formatUSD(pnl)}` : formatUSD(pnl); 
      const color = pnl >= 0 ? "
🟢
" : "
🔴
"; 
 
      message += `${color} **${ticker}** (${pair?.address?.slice(0, 6)}...)\n`; 
      message += `   Entry: ${formatUSD(trade.amount_usd)}\n`; 
      if (pnl !== 0) message += `   P&L: ${pnlStr}\n`; 
      message += `   Age: ${Math.floor((Date.now() - new Date(trade.opened_at).getTime()) / 
60000)}m\n`; 
      message += `   [DexScreener](https://dexscreener.com/solana/${pair?.address})\n\n`; 
 
      totalExposure += trade.amount_usd ?? 0; 
    } 
 
    message += `\n
💼
 **Total Exposure**: ${formatUSD(totalExposure)}`; 
 
    return { success: true, message, shouldNotify: false }; 
  } catch (err: any) { 
    return { success: false, message: `
❌
 Error: ${err.message}`, shouldNotify: false }; 
  } 
} 
 
// ─── /status Command 
────────────────────────────────────────────────────────── 
 
export async function cmdStatus(): Promise<CommandResult> { 
  try { 
    const [regime, portfolio, riskState, trades] = await Promise.all([ 
      getRegimeState(), 
      getPortfolioSummary(), 
      supabase.from("risk_state").select("*").eq("id", 1).single(), 
      supabase.from("trades").select("*").eq("status", "open"), 
    ]); 
 
    const risk = (riskState as any).data; 
    const openTrades = (trades as any).data ?? []; 
 
    let message = `
🤖
 **CATALYST APEX STATUS**\n\n`; 
 
    // Regime 
    message += `
📊
 **Market Regime**: ${regime.state}\n`; 
    message += `   Confidence: ${regime.confidence}/100\n`; 
    message += `   Filters: ${regime.filterTightness}\n`; 
    message += `   Martingale: ${regime.martingaleAllowed ? "
✅
" : "
❌
"}\n`; 
    message += `   Position Size: ${(regime.positionSizeMultiplier * 100).toFixed(0)}%\n\n`; 
 
    // Portfolio 
    message += `
💼
 **Portfolio Health**\n`; 
    message += `   Diversification: ${portfolio.diversificationScore}/100\n`; 
    message += `   Total Exposure: ${formatUSD(portfolio.totalExposure)}\n`; 
    message += `   Open Positions: ${openTrades.length}\n\n`; 
 
    // Risk State 
    message += `
🛡
 **Risk Engine**\n`; 
    message += `   Status: ${risk?.is_paused ? "
⏸
 PAUSED" : "
✅
 ACTIVE"}\n`; 
    message += `   Daily P&L: ${formatUSD(risk?.daily_pnl_sol ?? 0)} SOL\n`; 
    message += `   Trades Today: ${risk?.trades_today ?? 0}/10\n`; 
    message += `   Drawdown: ${(risk?.total_drawdown_pct ?? 0).toFixed(1)}%\n`; 
    message += `   Loss Streak: ${risk?.consecutive_losses ?? 0}\n`; 
 
    return { success: true, message, shouldNotify: false }; 
  } catch (err: any) { 
    return { success: false, message: `
❌
 Error: ${err.message}`, shouldNotify: false }; 
  } 
} 
 
// ─── /risk Command 
──────────────────────────────────────────────────────────── 
 
export async function cmdRisk(): Promise<CommandResult> { 
  try { 
    const { data: riskState } = await supabase 
      .from("risk_state") 
      .select("*") 
      .eq("id", 1) 
      .single(); 
 
    if (!riskState) { 
      return { success: false, message: `
❌
 Risk state not found`, shouldNotify: false }; 
    } 
 
    let message = `
🛡
 **RISK STATE**\n\n`; 
 
    message += `**Current Status**\n`; 
    message += `   ${riskState.is_paused ? "
⏸
 PAUSED" : "
✅
 ACTIVE"}\n\n`; 
 
    message += `**Daily Limits**\n`; 
    message += `   Trades Today: ${riskState.trades_today}/10\n`; 
    message += `   Daily P&L: ${formatUSD(riskState.daily_pnl_sol)} SOL\n\n`; 
 
    message += `**Drawdown Tracking**\n`; 
    message += `   Total DD: ${riskState.total_drawdown_pct.toFixed(2)}%\n`; 
    message += `   Max DD: 20% (auto-pause)\n\n`; 
 
    message += `**Loss Streak**\n`; 
    message += `   Current: ${riskState.consecutive_losses} consecutive losses\n`; 
    message += `   Auto-pause at: 5 losses\n\n`; 
 
    // Color code the drawdown 
    const ddPercent = riskState.total_drawdown_pct; 
    let ddColor = "
🟢
"; 
    if (ddPercent > 15) ddColor = "
🔴
"; 
    else if (ddPercent > 10) ddColor = "
🟠
"; 
    else if (ddPercent > 5) ddColor = "
🟡
"; 
 
    message += `${ddColor} **Drawdown Status**: 
${riskState.total_drawdown_pct.toFixed(1)}%\n`; 
 
    return { success: true, message, shouldNotify: false }; 
  } catch (err: any) { 
    return { success: false, message: `
❌
 Error: ${err.message}`, shouldNotify: false }; 
  } 
} 
 
// ─── /kill Command (Emergency Stop) 
──────────────────────────────────────────── 
 
export async function cmdKill(): Promise<CommandResult> { 
  try { 
    // Hard stop: pause + log critical event 
    await supabase 
      .from("risk_state") 
      .update({ is_paused: true, total_drawdown_pct: 100 }) 
      .eq("id", 1); 
 
    await supabase.from("security_logs").insert({ 
      level: "CRITICAL", 
      reason: "EMERGENCY_STOP", 
      details: "Kill command executed via Telegram — all trading halted", 
      timestamp: new Date().toISOString(), 
    }); 
 
    return { 
      success: true, 
      message: `
🛑
 **EMERGENCY STOP ACTIVATED**\n\nAll trading has been halted 
immediately.\nNo positions will be opened or scaled.\nExisting positions will remain open for 
manual exit.`, 
      shouldNotify: true, 
    }; 
  } catch (err: any) { 
    return { success: false, message: `
❌
 Error: ${err.message}`, shouldNotify: false }; 
  } 
} 
 
// ─── /addwallet Command 
──────────────────────────────────────────────────────── 
 
export async function cmdAddWallet(args: string[]): Promise<CommandResult> { 
  try { 
    if (args.length < 1) { 
      return { 
        success: false, 
        message: `
❌
 **Usage**: /addwallet <address> [label]\n\nExample:\n/addwallet 
So11111111111111111111111111111111111111112\n/addwallet 
So11111111111111111111111111111111111111112 MyKOL`, 
        shouldNotify: false, 
      }; 
    } 
 
    const address = args[0]; 
    const label = args[1] ?? `Wallet-${address.slice(0, 6)}`; 
 
    // Validate Solana address format 
    if (address.length < 32 || address.length > 44) { 
      return { 
        success: false, 
        message: `
❌
 Invalid Solana address length (got ${address.length}, expected 32-44)`, 
        shouldNotify: false, 
      }; 
    } 
 
    // Add to smart_wallets 
    const { error } = await supabase.from("smart_wallets").upsert({ 
      address, 
      label, 
      win_rate: 0.5, 
      total_trades: 0, 
      wins: 0, 
      is_manual: true, 
      added_at: new Date().toISOString(), 
    }); 
 
    if (error) { 
      return { success: false, message: `
❌
 Failed: ${error.message}`, shouldNotify: false }; 
    } 
 
    return { 
      success: true, 
      message: `
✅
 **Wallet Added**\n\n${label}\n${address}\n\nThis wallet will be monitored 
24/7 for buys.`, 
      shouldNotify: true, 
    }; 
  } catch (err: any) { 
    return { success: false, message: `
❌
 Error: ${err.message}`, shouldNotify: false }; 
  } 
} 
 
// ─── /help Command 
──────────────────────────────────────────────────────────── 
 
export async function cmdHelp(): Promise<CommandResult> { 
  const message = `
🤖
 **CATALYST APEX TRADER — Command List** 
 
*Control* 
\`/pause\` — Pause auto-trading 
\`/resume\` — Resume auto-trading 
\`/kill\` — Emergency stop 
 
*Status & Monitoring* 
\`/status\` — Market regime + portfolio health 
\`/positions\` — Show open positions 
\`/risk\` — Show risk state 
 
*Portfolio Management* 
\`/addwallet <address> [label]\` — Track manual wallet 
 
*Help* 
\`/help\` — Show this message 
 
**Examples** 
\`/addwallet So11111111111111111111111111111111111111112 LongzuAlpha\` 
\`/status\` 
\`/pause\``; 
 
  return { success: true, message, shouldNotify: false }; 
} 
 
// ─── Command Router 
─────────────────────────────────────────────────────────── 
 
export async function handleCommand(command: string, args: string[] = []): 
Promise<CommandResult> { 
  const cmd = command.toLowerCase(); 
 
  switch (cmd) { 
    case "pause": 
      return await cmdPause(); 
    case "resume": 
      return await cmdResume(); 
    case "positions": 
      return await cmdPositions(); 
    case "status": 
      return await cmdStatus(); 
    case "risk": 
      return await cmdRisk(); 
    case "kill": 
      return await cmdKill(); 
    case "addwallet": 
      return await cmdAddWallet(args); 
    case "help": 
      return await cmdHelp(); 
    default: 
      return { 
        success: false, 
        message: `
❌
 Unknown command: /${cmd}\n\nUse /help for command list`, 
        shouldNotify: false, 
      }; 
  } 
} 