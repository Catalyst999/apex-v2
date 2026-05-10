# CATALYST APEX - HYBRID RPC + REVIVAL ENGINE INTEGRATION GUIDE

**Complete step-by-step integration for Phases 1-5**

---

## 📋 TABLE OF CONTENTS

1. Pre-Integration Checklist
2. Phase 1: Hybrid RPC Layer Integration
3. Phase 2: Config & State Updates
4. Phase 3: Revival Engine Integration
5. Phase 4: Telegram Integration
6. Phase 5: Database Schema
7. Verification & Testing
8. Monitoring & Troubleshooting

---

## ✅ PRE-INTEGRATION CHECKLIST

Before starting, verify:

- [ ] All source files copied to correct locations
- [ ] `npm install` completed
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] `.env` file has required variables (see ENVIRONMENT_TEMPLATE.md)
- [ ] Redis service running
- [ ] Supabase project configured
- [ ] Node.js version 18+

---

## 🔌 PHASE 1: HYBRID RPC LAYER INTEGRATION

### Files to Deploy
```
src/services/rpc/
├── public-rpc-adapter.ts
├── helius-websocket-monitor.ts
├── helius-rpc-enrichment.ts
├── dexscreener-adapter.ts
├── raydium-intelligence.ts
├── runtime-cache.ts
└── rpc-orchestrator.ts
```

### Integration Steps

#### 1.1 Add RPC Initialization to `src/index.ts` (or main server file)

```typescript
// After other imports
import { rpcOrchestrator } from './services/rpc/rpc-orchestrator';

// In your server startup:
async function initializeRPC() {
  console.log('[Server] Initializing Hybrid RPC layer...');
  // RPC orchestrator auto-initializes on import
  console.log('[Server] ✓ Hybrid RPC layer ready');
}

// Call this in main():
await initializeRPC();
```

#### 1.2 Replace Old RPC Calls with Orchestrator

**Before:**
```typescript
const connection = new Connection(RPC_URL);
const tx = await connection.getTransaction(signature);
```

**After:**
```typescript
import { rpcOrchestrator } from '../services/rpc/rpc-orchestrator';

const tx = await rpcOrchestrator.getTransaction(signature);
```

#### 1.3 Verify RPC Layer

```bash
# Check that RPC orchestrator initializes without errors
npx ts-node -e "import { rpcOrchestrator } from './src/services/rpc/rpc-orchestrator'; console.log('RPC OK')"
```

✅ **Phase 1 Complete** when:
- [ ] No TypeScript errors
- [ ] RPC orchestrator initializes
- [ ] Circuit breaker present in logs

---

## ⚙️ PHASE 2: CONFIG & STATE UPDATES

### 2.1 Update `src/core/config.ts`

Add these sections after existing config exports:

```typescript
// ============================================================================
// HYBRID RPC CONFIGURATION
// ============================================================================

export const HYBRID_RPC = {
  // Public RPC (fallback, background scanning)
  PUBLIC_RPC_URL: process.env.PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
  
  // Helius Websocket (real-time monitoring)
  HELIUS_WEBSOCKET_ENABLED: process.env.HELIUS_WEBSOCKET_ENABLED !== 'false',
  
  // Helius RPC (selective enrichment)
  HELIUS_ENRICHMENT_ENABLED: process.env.HELIUS_ENRICHMENT_ENABLED !== 'false',
  HELIUS_ENRICHMENT_CONVICTION_THRESHOLD: parseFloat(process.env.HELIUS_CONVICTION_THRESHOLD || '75'),
  
  // DexScreener (market data)
  DEXSCREENER_ENABLED: process.env.DEXSCREENER_ENABLED !== 'false',
  
  // RPC request throttling
  RPC_COOLDOWN_MS: parseInt(process.env.RPC_COOLDOWN_MS || '500'),
  RPC_MAX_RETRIES: parseInt(process.env.RPC_MAX_RETRIES || '3'),
  RPC_BATCH_SIZE: parseInt(process.env.RPC_BATCH_SIZE || '10'),
  RPC_CONCURRENT_LIMIT: parseInt(process.env.RPC_CONCURRENT_LIMIT || '3'),
  
  // Request urgency routing
  URGENT_TIMEOUT_MS: parseInt(process.env.URGENT_TIMEOUT_MS || '5000'),
  BACKGROUND_TIMEOUT_MS: parseInt(process.env.BACKGROUND_TIMEOUT_MS || '30000'),
  
  // Circuit breaker
  CIRCUIT_BREAKER_COOLDOWN_MS: parseInt(process.env.CIRCUIT_BREAKER_MS || '60000'),
  CIRCUIT_BREAKER_TRIP_THRESHOLD: parseInt(process.env.CIRCUIT_BREAKER_TRIPS || '5'),
};

// ============================================================================
// SYSTEM MODE & TRADING CONFIGURATION
// ============================================================================

export const SYSTEM = {
  // System mode: shadow (local testing), paper (simulation), live (real)
  SYSTEM_MODE: (process.env.SYSTEM_MODE || 'shadow') as 'shadow' | 'paper' | 'live',
  
  // Paper trading (simulated execution)
  ENABLE_PAPER_TRADING: process.env.ENABLE_PAPER_TRADING === 'true',
  ENABLE_AUTO_TRADING: process.env.ENABLE_AUTO_TRADING === 'true',
  
  // Risk limits
  MAX_POSITION_SIZE: parseFloat(process.env.MAX_POSITION_SIZE || '1'),
  MAX_DAILY_LOSS_PERCENT: parseFloat(process.env.MAX_DAILY_LOSS_PERCENT || '5'),
};

// ============================================================================
// REVIVAL ENGINE CONFIGURATION
// ============================================================================

export const REVIVAL_ENGINE = {
  // Master enable/disable
  ENABLE_REVIVAL_ENGINE: process.env.ENABLE_REVIVAL_ENGINE !== 'false',
  
  // Dormancy detection
  DORMANCY_THRESHOLD_DAYS: parseInt(process.env.DORMANCY_THRESHOLD_DAYS || '7'),
  MAX_DORMANCY_DAYS: parseInt(process.env.MAX_DORMANCY_DAYS || '180'),
  
  // Reactivation velocity
  VELOCITY_CHECK_INTERVAL_MS: parseInt(process.env.VELOCITY_CHECK_INTERVAL || '5000'),
  VELOCITY_BURST_THRESHOLD: parseFloat(process.env.VELOCITY_BURST_THRESHOLD || '2.0'),
  
  // Wallet coordination
  MIN_COORDINATOR_WALLETS: parseInt(process.env.MIN_COORDINATOR_WALLETS || '3'),
  COORDINATION_SCORE_THRESHOLD: parseFloat(process.env.COORDINATION_THRESHOLD || '65'),
  
  // Liquidity trust
  LIQUIDITY_BACKING_MIN_PERCENT: parseFloat(process.env.LIQUIDITY_BACKING_MIN || '50'),
  
  // Attention ignition
  IGNITION_SCORE_THRESHOLD: parseFloat(process.env.IGNITION_THRESHOLD || '70'),
  
  // Watchlist management
  MAX_REVIVAL_CANDIDATES: parseInt(process.env.MAX_REVIVAL_CANDIDATES || '500'),
  CANDIDATE_TTL_MS: parseInt(process.env.CANDIDATE_TTL_MS || '3600000'), // 1 hour
};
```

### 2.2 Update `src/core/state/runtime-state.ts`

Verify the file has:
- [ ] `RevivalCandidate` interface exists
- [ ] `private revivalCandidates: Map<string, RevivalCandidate>` field
- [ ] All revival candidate methods (get, update, add, remove, cleanup)
- [ ] `revival` object in `getFullState()`

✅ **Phase 2 Complete** when:
- [ ] Config exports all sections
- [ ] State has revival methods
- [ ] event-orchestrator has revivalEvent()
- [ ] No TypeScript errors

---

## 🧠 PHASE 3: REVIVAL ENGINE INTEGRATION

### Files to Deploy
```
src/services/intelligence/revival-engine/
├── dormancy-detector.ts
├── reactivation-velocity.ts
├── wallet-coordination.ts
├── liquidity-trust-scorer.ts
├── attention-ignition.ts
├── lifecycle-state-machine.ts
├── revival-watchlist.ts
├── behavioral-interpreter.ts
├── signal-escalation.ts
└── revival-engine.ts
```

### 3.1 Initialize Revival Engine in `src/index.ts`

```typescript
import { revivalEngine } from './services/intelligence/revival-engine/revival-engine';

async function initializeIntelligence() {
  console.log('[Server] Initializing Revival Engine...');
  await revivalEngine.initialize();
  console.log('[Server] ✓ Revival Engine ready');
}

// Call in main():
await initializeIntelligence();
```

### 3.2 Subscribe to Revival Events in `src/core/routing/event-orchestrator.ts`

The revival engine already subscribes to:
- `SIGNAL_DETECTED` - analyzes new signals
- `MARKET_DATA_UPDATED` - checks for velocity changes

No additional integration needed if using event orchestrator.

### 3.3 Verify Revival Engine

```bash
# Check revival engine initializes
npx ts-node -e "import { revivalEngine } from './src/services/intelligence/revival-engine/revival-engine'; revivalEngine.initialize().then(() => console.log('Revival OK'))"
```

✅ **Phase 3 Complete** when:
- [ ] Revival engine initializes
- [ ] All 10 submodules importable
- [ ] No TypeScript errors

---

## 💬 PHASE 4: TELEGRAM INTEGRATION

### 4.1 Copy File
```
src/services/telegram/modules/revival-commands.ts
```

### 4.2 Register Commands in `src/services/telegram/bot.ts`

Add to bot initialization:

```typescript
import { registerRevivalCommands } from './modules/revival-commands';

// In bot setup:
await registerRevivalCommands(bot);
```

### 4.3 Verify Commands

Available commands:
- `/revivals` - Show active revival candidates
- `/deadcharts` - View dormant token watchlist
- `/reactivation` - Check reactivation velocity
- `/ignition` - Show attention ignition alerts
- `/revival_watchlist` - Manage revival watchlist
- `/revival_lifecycle` - Track lifecycle stages

✅ **Phase 4 Complete** when:
- [ ] `/revivals` command responds
- [ ] Events flowing through event bus
- [ ] Telegram alerts sending

---

## 💾 PHASE 5: DATABASE SCHEMA

### 5.1 Run Supabase Migration

```bash
# Apply schema migration
supabase migration up --file supabase/migrations/revival_engine_schema.sql

# Or manually in Supabase SQL editor:
# Copy contents of supabase/migrations/revival_engine_schema.sql
# Paste into Supabase SQL editor
# Execute
```

### 5.2 Verify Tables Created

```sql
-- In Supabase SQL editor
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema='public' 
AND table_name LIKE 'revival%';
```

Expected tables:
- [ ] `revival_candidates`
- [ ] `dormancy_history`
- [ ] `reactivation_events`
- [ ] `wallet_coordination_patterns`
- [ ] `attention_ignition_events`
- [ ] `lifecycle_transitions`
- [ ] `revival_analytics`

### 5.3 Enable Row Level Security (RLS)

```sql
-- In each revival table:
ALTER TABLE revival_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dormancy_history ENABLE ROW LEVEL SECURITY;
-- ... etc for all tables

-- Create policy for authenticated users:
CREATE POLICY "Service role full access" ON revival_candidates
  FOR ALL USING (auth.role() = 'service_role');
```

✅ **Phase 5 Complete** when:
- [ ] All 7 tables created
- [ ] RLS enabled
- [ ] Service role has access

---

## 🧪 VERIFICATION & TESTING

### V1: Compilation Check
```bash
npx tsc --noEmit
# Should complete with 0 errors
```

### V2: RPC Layer Testing

```bash
# Test RPC orchestrator
curl http://localhost:3000/health

# Should show RPC metrics
```

### V3: Revival Engine Testing

```bash
# Test via Telegram (if bot running):
/revivals

# Should list any revival candidates
```

### V4: Database Testing

```bash
# Insert test revival candidate
INSERT INTO revival_candidates (token, dormancy_score, lifecycle_state)
VALUES ('SOL', 75, 'DORMANT');

# Query should return result
SELECT * FROM revival_candidates LIMIT 1;
```

### V5: Event Flow Testing

```bash
# Monitor logs for event flow:
tail -f logs/app.log | grep -i "revival"

# Should see events:
# [RevivalEngine] Analyzing token...
# [RuntimeState] Revival candidate added...
# [EventOrch] REVIVAL_EVENT dispatched...
```

---

## 🔍 MONITORING & TROUBLESHOOTING

### M1: Revival Engine Not Initializing

**Issue:** Revival engine logs don't appear on startup

**Solution:**
1. Check `ENABLE_REVIVAL_ENGINE` in .env (should be 'true')
2. Verify `src/index.ts` calls `revivalEngine.initialize()`
3. Check console for errors

### M2: High RPC Latency

**Issue:** RPC requests taking >5 seconds

**Solution:**
1. Check `CIRCUIT_BREAKER_TRIPS` in logs
2. Verify `RPC_CONCURRENT_LIMIT` isn't too high
3. Consider enabling only critical RPC providers

### M3: No Revival Candidates

**Issue:** `/revivals` command returns empty list

**Solution:**
1. Verify `DORMANCY_THRESHOLD_DAYS` is reasonable (7-30)
2. Check `dormancy_history` table for recent data
3. Run manual dormancy detection:
   ```typescript
   const candidates = await dormancyDetector.getDormancyCandidates(50);
   console.log(candidates);
   ```

### M4: Telegram Commands Not Responding

**Issue:** `/revivals` command doesn't respond

**Solution:**
1. Verify bot token is correct in .env
2. Check `revival-commands.ts` is registered in bot.ts
3. Verify event bus is receiving events
4. Check Redis connection

### M5: Database Errors

**Issue:** "relation 'revival_candidates' does not exist"

**Solution:**
1. Verify migration was run: `supabase migration list`
2. Check migration file exists and ran successfully
3. Try manual table creation from schema file

---

## 📊 MONITORING QUERIES

### System Health

```sql
-- Check revival candidates by state
SELECT lifecycle_state, COUNT(*) as count
FROM revival_candidates
WHERE expires_at > NOW()
GROUP BY lifecycle_state;

-- Most recent revival events
SELECT token, type, created_at
FROM reactivation_events
ORDER BY created_at DESC
LIMIT 10;

-- Active coordination patterns
SELECT token, coordinator_count, coordination_score
FROM wallet_coordination_patterns
WHERE detected_at > NOW() - INTERVAL '1 hour'
ORDER BY coordination_score DESC;
```

### RPC Performance

```bash
# Monitor RPC requests
curl http://localhost:3000/rpc/metrics

# Expected metrics:
# - Total requests
# - 429 errors (should be 0)
# - Avg latency
# - Circuit breaker status
```

### Revival Analytics

```sql
-- Revival conversion rate
SELECT 
  COUNT(DISTINCT token) as total_analyzed,
  COUNT(DISTINCT CASE WHEN lifecycle_state = 'EXPLODING' THEN token END) as exploded,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN lifecycle_state = 'EXPLODING' THEN token END) / 
        COUNT(DISTINCT token), 2) as conversion_percent
FROM revival_candidates
WHERE created_at > NOW() - INTERVAL '7 days';
```

---

## ✅ GO-LIVE CHECKLIST

Before switching to `SYSTEM_MODE=paper` or `live`:

- [ ] All phases integrated
- [ ] TypeScript compiles clean
- [ ] RPC layer working (no 429s)
- [ ] Revival engine detecting candidates
- [ ] Telegram commands responding
- [ ] Database populated with test data
- [ ] Events flowing through system
- [ ] No critical errors in logs
- [ ] Paper trading tested
- [ ] Risk limits configured
- [ ] Monitoring dashboard active

---

## 📞 TROUBLESHOOTING CONTACTS

- **RPC Issues:** Check Helius API status
- **Database Issues:** Check Supabase status
- **Telegram Issues:** Check bot token validity
- **Revival Logic Issues:** Review DEVELOPMENT_RULES.md

---

**Integration Date:** ________________  
**Integrated By:** ________________  
**Status:** ✅ Complete / ⏳ In Progress / ❌ Failed

---

For detailed environment setup, see: **ENVIRONMENT_TEMPLATE.md**  
For deployment verification, see: **DEPLOYMENT_CHECKLIST.md**
