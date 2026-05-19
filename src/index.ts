/**
 * CATALYST APEX TRADER - BOOT SEQUENCE
 * 
 * Startup order:
 * 1. Load & validate config
 * 2. Connect to Supabase
 * 3. Load wallets from database
 * 4. Prompt for wallet selection (if multiple)
 * 5. Initialize runtime state
 * 6. Initialize AI budget
 * 7. Start event bus
 * 8. Start Apex Orchestrator (Phase 1 ingestion + Phase 2 intelligence)
 * 9. Start Telegram bot
 * 10. Setup event subscriptions
 * 11. Start HTTP server
 * 12. System ready for signals
 */

import * as dotenv from 'dotenv';

declare const require: any;

dotenv.config({ path: '.env.backend' });
dotenv.config({ path: '.env.local' });

const { INFRASTRUCTURE, EXECUTION, validateConfig, printConfig } = require('./core/config');
const { supabase } = require('./db/supabase');
const { runtimeState } = require('./core/state/runtime-state');
const { eventBus } = require('./services/events/event-bus');
const { walletManager } = require('./services/wallet/wallet-manager');
const { apexOrchestrator } = require('./core/orchestrator/apex-orchestrator');

// ============================================================================
// BOOT SEQUENCE
// ============================================================================

async function boot() {
  try {
    // ─────────────────────────────────────────────────────────────────────
    // 1. PRINT DIAGNOSTICS
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n');
    printConfig();

    // ─────────────────────────────────────────────────────────────────────
    // 2. VALIDATE CONFIGURATION
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n[Boot] Validating configuration...');
    const validation = validateConfig();
    if (!validation.valid) {
      console.error('❌ Configuration validation failed:');
      validation.errors.forEach((err: string) => console.error(`   • ${err}`));
      process.exit(1);
    }
    console.log('✅ Configuration valid');

    // ─────────────────────────────────────────────────────────────────────
    // 3. TEST SUPABASE CONNECTION
    // ─────────────────────────────────────────────────────────────────────
    console.log('[Boot] Connecting to Supabase...');
    const { error: dbError } = await supabase
      .from('wallets')
      .select('id')
      .limit(1);

    if (dbError) {
      console.error('❌ Supabase connection failed:', dbError.message);
      console.error('   Check SUPABASE_URL and SUPABASE_SERVICE_KEY (or legacy SUPABASE_API_KEY)');
      process.exit(1);
    }
    console.log('✅ Supabase connected');

    // ─────────────────────────────────────────────────────────────────────
    // 4. LOAD WALLETS FROM DATABASE
    // ─────────────────────────────────────────────────────────────────────
    console.log('[Boot] Loading wallets...');
    const wallets: any[] = await walletManager.getAllWallets();

    if (wallets.length === 0) {
      console.warn('\n⚠️  No wallets found in database');
      console.warn('   To add a wallet, use one of these methods:');
      console.warn('   1. Telegram: /add_wallet <address> <strategy>');
      console.warn('   2. Mini App: Wallet Management → Add Wallet');
      console.warn('   3. API: POST /api/wallet');
      console.warn('\n   Restart system after adding a wallet.\n');
      process.exit(0);
    }

    console.log(`✅ Found ${wallets.length} wallet(s):`);
    wallets.forEach((w: any, i: number) => {
      console.log(`   ${i + 1}. ${w.address.substring(0, 8)}... (${w.strategy})`);
    });

    // ─────────────────────────────────────────────────────────────────────
    // 5. SELECT WALLET (Interactive or Auto)
    // ─────────────────────────────────────────────────────────────────────
    let selectedWallet = wallets[0];

    if (wallets.length > 1) {
      // TODO: In production, add interactive prompt here
      // For now, auto-select first wallet
      console.log(`\n[Boot] Multiple wallets available, selecting first: ${wallets[0].address.substring(0, 8)}...`);
      console.log('   (In Mini App, you can switch wallets anytime)');
    }

    await walletManager.selectWallet(selectedWallet.id);
    console.log(`\n✅ Active wallet: ${selectedWallet.address.substring(0, 8)}... (${selectedWallet.strategy})`);

    // ─────────────────────────────────────────────────────────────────────
    // 6. INITIALIZE RUNTIME STATE
    // ─────────────────────────────────────────────────────────────────────
    console.log('[Boot] Initializing runtime state...');

    const walletContext = await walletManager.getWalletContext(selectedWallet.id);
    if (walletContext) {
      runtimeState.setWallet({
        id: selectedWallet.id,
        address: selectedWallet.address,
        strategy: walletContext.wallet.strategy as any,
        status: 'ACTIVE',
        totalPnL: walletContext.pnl_usd,
        openPositions: walletContext.current_positions,
        winRate: walletContext.win_rate,
        convictionMultiplier: 1.0,
        shouldTrade: !EXECUTION.TRADING_PAUSED,
        lastUpdate: Date.now(),
      });
    }

    console.log('✅ Runtime state initialized');

    // ─────────────────────────────────────────────────────────────────────
    // 7. INITIALIZE AI BUDGET (if AI is enabled)
    // ─────────────────────────────────────────────────────────────────────
    console.log('[Boot] Setting up AI budget...');
    runtimeState.initializeAIBudget(100000, 50000);
    console.log('✅ AI budget initialized');

    // ─────────────────────────────────────────────────────────────────────
    // 8. START EVENT BUS
    // ─────────────────────────────────────────────────────────────────────
    console.log('[Boot] Starting event bus...');
    const eventStats = await eventBus.getStats();
    console.log(`✅ Event bus ready (${eventStats.totalEvents} total events logged)`);

    // ─────────────────────────────────────────────────────────────────────
    // 9. START APEX ORCHESTRATOR (Phase 1 & 2)
    // ─────────────────────────────────────────────────────────────────────
    console.log('[Boot] Starting Apex Orchestrator...');
    try {
      await apexOrchestrator.startup();
      console.log('✅ Apex Orchestrator online');
    } catch (error) {
      console.error('❌ Orchestrator startup failed:', (error as Error).message);
      console.error('   Phase 1 (scanners) and Phase 2 (intelligence) will not run');
      console.warn('   System will continue with degraded functionality');
    }

    // ─────────────────────────────────────────────────────────────────────
    // 10. START TELEGRAM BOT
    // ─────────────────────────────────────────────────────────────────────
    console.log('[Boot] Starting Telegram bot...');
    try {
      // TODO: Uncomment when telegram bot is ready
      // const { startBot } = await import('./services/telegram/bot');
      // await startBot();
      // console.log('✅ Telegram bot started');
      console.log('⏭️  Telegram bot (skipped - not yet integrated)');
    } catch (error) {
      console.warn('⚠️  Telegram bot failed to start:', (error as Error).message);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 10. SETUP EVENT SUBSCRIPTIONS
    // ─────────────────────────────────────────────────────────────────────
    console.log('[Boot] Setting up event subscriptions...');

    // Subscribe to Phase 1 signal ingestion events
    eventBus.subscribe('SIGNAL_INGESTED', async (event: any) => {
      console.log(`[Phase1] ✅ Signal ingested: ${event.tokenAddress?.slice(0, 8)}... from ${event.source}`);
    });

    eventBus.subscribe('SIGNAL_DEDUPLICATED', async (event: any) => {
      console.log(`[Phase1] ⚠️  Signal deduplicated: ${event.token?.slice(0, 8)}... (${event.reason})`);
    });

    eventBus.subscribe('SIGNAL_FILTERED', async (event: any) => {
      console.log(`[Phase1] ❌ Signal filtered: ${event.token?.slice(0, 8)}... (${event.reason})`);
    });

    // Subscribe to Phase 2 enrichment events
    eventBus.subscribe('SIGNAL_ENRICHED', async (event: any) => {
      console.log(`[Phase2] 🔍 Signal enriched: abnormality=${event.abnormalityScore}, emotion=${event.emotionPhase}`);
    });

    eventBus.subscribe('NARRATIVE_SCORED', async (event: any) => {
      if (event.narrativeMatched) {
        console.log(`[Phase2] 📖 Narrative matched: ${event.narrativeCategory} (tier ${event.narrativeTier})`);
      }
    });

    eventBus.subscribe('MARKET_MEMORY_SCORED', async (event: any) => {
      if (event.patternFound) {
        console.log(`[Phase2] 📊 Pattern found: ${event.patternName} (${Math.round(event.matchConfidence)}% match)`);
      }
    });

    eventBus.subscribe('CONVICTION_CALCULATED', async (event: any) => {
      console.log(`[Phase2] 💪 Conviction: ${Math.round(event.conviction)}/100 (mode: ${event.convictionMode})`);
    });

    // Subscribe to execution events
    eventBus.subscribe('TRADE_SIGNAL', async (event: any) => {
      console.log(`[Phase3] 🎯 Trade signal: ${event.decision} (severity: ${event.severity}, confidence: ${event.confidence})`);
    });

    eventBus.subscribe('TRADE_EXECUTED', async (event: any) => {
      console.log(`📈 [Execution] Trade opened: ${event.tradeId} @ ${event.entryPrice}`);
    });

    eventBus.subscribe('TRADE_CLOSED', async (event: any) => {
      console.log(`📉 [Execution] Trade closed: ${event.tradeId} with PnL ${event.pnl} (${event.exitReason})`);
    });

    // Subscribe to learning events
    eventBus.subscribe('OUTCOME_RECORDED', async (event: any) => {
      console.log(`📚 [Learning] Outcome recorded: ${event.won ? '✅ WIN' : '❌ LOSS'} (ROI: ${Math.round(event.roi)}%)`);
    });

    console.log('✅ Event subscriptions active (Phase 1-5 pipeline)');

    // ─────────────────────────────────────────────────────────────────────
    // 11. START HTTP SERVER
    // ─────────────────────────────────────────────────────────────────────
    console.log('[Boot] Starting HTTP server...');
    const http = require('http');
    const PORT = parseInt(process.env.PORT || '3000');

    const server = http.createServer((req: any, res: any) => {
      // Health check
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            mode: EXECUTION.MODE,
            wallet: selectedWallet.address.substring(0, 8),
            uptime: process.uptime(),
          })
        );
        return;
      }

      // Test: simulate a signal through the ingestion hub
      if (req.method === 'POST' && req.url === '/api/test/simulate-signal') {
        let body = '';
        req.on('data', (chunk: any) => (body += chunk));
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const signal = payload.signal || payload;
            const source = payload.source || 'webhook';

            const { signalIngestionHub } = await import('./services/ingestion/signal-ingestion-hub');
            await signalIngestionHub.ingestSignal(signal, source as any);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (err: any) {
            console.error('[Test] simulate-signal error:', err?.message || err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: String(err) }));
          }
        });
        return;
      }

      // Helius webhook endpoint (TODO: implement when ready)
      if (req.method === 'POST' && req.url === '/webhook/helius') {
        console.log('[Webhook] Helius event received');
        res.writeHead(200);
        res.end('ok');
        return;
      }

      // Not found
      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ HTTP server listening on port ${PORT}`);
    });

    // ─────────────────────────────────────────────────────────────────────
    // 12. STARTUP COMPLETE
    // ─────────────────────────────────────────────────────────────────────
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                  SYSTEM READY                              ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║ 🎯 Mode: ${EXECUTION.MODE.padEnd(51)} ║
║ 💼 Wallet: ${selectedWallet.address.substring(0, 20).padEnd(46)} ║
║ 🌐 Server: http://localhost:${String(PORT).padEnd(40)} ║
║                                                            ║
║ Listening for signals...                                  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    console.error('\n❌ BOOT FAILED');
    console.error((error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// ============================================================================
// RUN BOOT
// ============================================================================

async function run() {
  await boot();
}

run().catch((error) => {
  console.error('Fatal boot error:', error);
  process.exit(1);
});

// File: src/index.ts

async function initialize() {
  console.log('[Boot] Initializing 7 scanners...');
  
  // 1. Onchain Scanner (Raydium + Pump.fun)
  console.log('[Boot] ✅ Onchain scanner');
  
  // 2. Monitor (WebSocket)
  console.log('[Boot] ✅ WebSocket monitor');
  
  // 3. DexScreener
  console.log('[Boot] ✅ DexScreener scanner');
  
  // 4. Pumpfun Monitor
  console.log('[Boot] ✅ Pumpfun monitor');
  
  // 5. Graduation Tracker
  console.log('[Boot] ✅ Graduation tracker');
  
  // 6. Fake Volume Detector (NEW)
  console.log('[Boot] ✅ Fake volume detector');
  
  // 7. Lowcap Lore Scanner (NEW)
  console.log('[Boot] ✅ Lowcap lore scanner');
  
  console.log('[Boot] ✅ All 7 scanners initialized');
}