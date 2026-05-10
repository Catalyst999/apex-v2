# DEPLOYMENT_CHECKLIST - CATALYST APEX v2.0

Complete checklist for deploying Hybrid RPC + Revival Engine

---

## 🔍 PRE-DEPLOYMENT AUDIT

### Repository State
- [ ] All 25 files present
  - [ ] 7 RPC adapter files
  - [ ] 10 Revival engine modules
  - [ ] 3 Config/state patches applied
  - [ ] 1 Telegram commands file
  - [ ] 4 Documentation files

### Code Quality
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] No console warnings about missing modules
- [ ] All imports resolve correctly
- [ ] No unused variables or imports

### Environment Setup
- [ ] `.env` file created from ENVIRONMENT_TEMPLATE.md
- [ ] All required keys populated
  - [ ] HELIUS_API_KEY set
  - [ ] SUPABASE_URL and SUPABASE_SERVICE_KEY set
  - [ ] REDIS_URL configured
  - [ ] TELEGRAM_BOT_TOKEN set
- [ ] SYSTEM_MODE set to 'shadow' for initial testing

### Dependencies
- [ ] `npm install` completed successfully
- [ ] No peer dependency warnings
- [ ] Redis service available
  - [ ] Running locally or on remote
  - [ ] Connection test successful
- [ ] Supabase project configured
  - [ ] Project created
  - [ ] API keys generated

---

## 📋 PHASE 1: HYBRID RPC LAYER DEPLOYMENT

### Files Deployed
- [ ] `public-rpc-adapter.ts` copied to `src/services/rpc/`
- [ ] `helius-websocket-monitor.ts` copied
- [ ] `helius-rpc-enrichment.ts` copied
- [ ] `dexscreener-adapter.ts` copied
- [ ] `raydium-intelligence.ts` copied
- [ ] `runtime-cache.ts` copied
- [ ] `rpc-orchestrator.ts` copied

### Integration Complete
- [ ] Added HYBRID_RPC config to `src/core/config.ts`
- [ ] Imported `rpcOrchestrator` in main server file
- [ ] RPC initialization called during startup
- [ ] Old RPC calls replaced with orchestrator methods

### Testing
- [ ] Server starts without RPC errors
- [ ] `getTransaction()` calls work through orchestrator
- [ ] Circuit breaker logs appear on startup
- [ ] No 429 rate limit errors in logs
- [ ] RPC metrics endpoint available

**Phase 1 Status:** ✅ PASS / ⏳ IN PROGRESS / ❌ BLOCKED

---

## ⚙️ PHASE 2: CONFIG & STATE UPDATES

### Config Patches Applied
- [ ] `HYBRID_RPC` section added to `src/core/config.ts`
- [ ] `SYSTEM` section added to config
- [ ] `REVIVAL_ENGINE` section added to config
- [ ] All config values reading from `.env` correctly

### State Updates Applied
- [ ] `RevivalCandidate` interface exists in `runtime-state.ts`
- [ ] `private revivalCandidates` Map initialized
- [ ] Revival methods implemented:
  - [ ] `addRevivalCandidate()`
  - [ ] `getRevivalCandidate()`
  - [ ] `updateRevivalCandidate()`
  - [ ] `updateRevivalLifecycle()`
  - [ ] `updateRevivalEscalation()`
  - [ ] `getAllRevivalCandidates()`
  - [ ] `getRevivalCandidatesByState()`
  - [ ] `getActiveRevivalCandidates()`
  - [ ] `removeRevivalCandidate()`
  - [ ] `cleanupExpiredRevivalCandidates()`
  - [ ] `getRevivalStats()`
- [ ] `revival` object in `getFullState()` method

### Event Orchestrator Updates
- [ ] `revivalEvent()` method exists
- [ ] Takes 4 parameters: type, token, payload, priority
- [ ] Dispatches to 'REVIVAL_EVENT' event type

### Testing
- [ ] TypeScript compilation clean
- [ ] Config values accessible
- [ ] State methods callable
- [ ] Events dispatching correctly

**Phase 2 Status:** ✅ PASS / ⏳ IN PROGRESS / ❌ BLOCKED

---

## 🧠 PHASE 3: REVIVAL ENGINE DEPLOYMENT

### All 10 Modules Present
- [ ] `dormancy-detector.ts` in revival-engine folder
- [ ] `reactivation-velocity.ts`
- [ ] `wallet-coordination.ts`
- [ ] `liquidity-trust-scorer.ts`
- [ ] `attention-ignition.ts`
- [ ] `lifecycle-state-machine.ts`
- [ ] `revival-watchlist.ts`
- [ ] `behavioral-interpreter.ts`
- [ ] `signal-escalation.ts`
- [ ] `revival-engine.ts` (main orchestrator)

### Initialization
- [ ] Revival engine imported in main server
- [ ] `revivalEngine.initialize()` called on startup
- [ ] Subscribes to SIGNAL_DETECTED event
- [ ] Subscribes to MARKET_DATA_UPDATED event

### Configuration
- [ ] ENABLE_REVIVAL_ENGINE set correctly
- [ ] DORMANCY_THRESHOLD_DAYS configured
- [ ] COORDINATION_THRESHOLD set appropriately
- [ ] IGNITION_THRESHOLD configured

### Testing
- [ ] Revival engine initializes without errors
- [ ] All 10 modules importable
- [ ] No TypeScript compilation errors
- [ ] Engine logs appear on startup

**Phase 3 Status:** ✅ PASS / ⏳ IN PROGRESS / ❌ BLOCKED

---

## 💬 PHASE 4: TELEGRAM INTEGRATION

### File Deployed
- [ ] `revival-commands.ts` copied to `src/services/telegram/modules/`

### Integration
- [ ] Commands registered in `src/services/telegram/bot.ts`
- [ ] `registerRevivalCommands()` called during bot init
- [ ] All 6 commands available:
  - [ ] `/revivals` - Show active candidates
  - [ ] `/deadcharts` - Show dormant tokens
  - [ ] `/reactivation` - Check velocity
  - [ ] `/ignition` - Show ignition alerts
  - [ ] `/revival_watchlist` - Manage watchlist
  - [ ] `/revival_lifecycle` - Track lifecycle

### Testing
- [ ] Telegram bot token valid
- [ ] Bot responding to commands
- [ ] `/revivals` command returns data or "no candidates"
- [ ] Events flowing through event bus
- [ ] Bot sending alerts correctly

**Phase 4 Status:** ✅ PASS / ⏳ IN PROGRESS / ❌ BLOCKED

---

## 💾 PHASE 5: DATABASE SCHEMA DEPLOYMENT

### Schema Migration Applied
- [ ] Migration file exists: `supabase/migrations/revival_engine_schema.sql`
- [ ] Migration executed successfully
- [ ] All 7 tables created:
  - [ ] `revival_candidates`
  - [ ] `dormancy_history`
  - [ ] `reactivation_events`
  - [ ] `wallet_coordination_patterns`
  - [ ] `attention_ignition_events`
  - [ ] `lifecycle_transitions`
  - [ ] `revival_analytics`

### Table Verification
- [ ] Each table has correct columns
- [ ] Primary keys configured
- [ ] Foreign keys set up
- [ ] Indexes created for performance
- [ ] Constraints applied

### Security
- [ ] Row Level Security (RLS) enabled on all tables
- [ ] Service role has full access
- [ ] Public role limited appropriately
- [ ] Policies tested and working

### Views Created
- [ ] `active_revivals` view available
- [ ] `high_asymmetry_revivals` view available

**Phase 5 Status:** ✅ PASS / ⏳ IN PROGRESS / ❌ BLOCKED

---

## 🧪 SYSTEM INTEGRATION TESTING

### Compilation & Build
- [ ] `npx tsc --noEmit` returns 0 errors
- [ ] `npm run build` completes successfully
- [ ] No build warnings

### Startup Sequence
- [ ] Server starts without errors
- [ ] All modules initialize in correct order:
  1. [ ] RPC orchestrator
  2. [ ] Runtime state
  3. [ ] Event orchestrator
  4. [ ] Revival engine
  5. [ ] Telegram bot
- [ ] No missing dependencies logged

### Runtime State
- [ ] Runtime state initializes
- [ ] All state Maps created
- [ ] Event listeners registered
- [ ] Cleanup loops start

### Event Flow
- [ ] Events dispatch through orchestrator
- [ ] Revival events received by listeners
- [ ] State updates trigger correctly
- [ ] Telegram commands receive events

### Data Persistence
- [ ] Data saved to Supabase
- [ ] Queries return results
- [ ] No SQL errors in logs

---

## 🎯 FUNCTIONAL TESTING

### RPC Layer
- [ ] `rpcOrchestrator.getTransaction()` works
- [ ] Fallback to public RPC on failure
- [ ] Circuit breaker trips at threshold
- [ ] Request deduplication working
- [ ] Cooldown respected between requests

### Revival Engine
- [ ] Dormancy detection working
- [ ] Velocity detection identifies spikes
- [ ] Wallet coordination analyzed
- [ ] Liquidity trust scored
- [ ] Ignition events detected
- [ ] Lifecycle states transition correctly

### Event System
- [ ] SIGNAL_DETECTED events trigger analysis
- [ ] REVIVAL_EVENT dispatches correctly
- [ ] Event payload includes all fields
- [ ] Subscribers receive events

### Telegram
- [ ] Bot responds to commands
- [ ] `/revivals` shows candidates
- [ ] `/deadcharts` shows dormant tokens
- [ ] `/lifecycle` shows state transitions
- [ ] Alerts sending successfully

### Database
- [ ] Records inserted successfully
- [ ] Queries return correct data
- [ ] Updates work properly
- [ ] Views available

---

## 📊 PERFORMANCE BASELINE

Measure before going live:

- [ ] **RPC Latency:** _____ ms (target: <1000ms)
- [ ] **429 Errors:** _____ per day (target: 0)
- [ ] **Memory Usage:** _____ MB (target: <500MB)
- [ ] **CPU Usage:** _____ % (target: <20%)
- [ ] **Event Throughput:** _____ events/sec
- [ ] **Database Query Time:** _____ ms

---

## 🚨 SHADOW MODE TESTING (SYSTEM_MODE=shadow)

Before switching to paper trading:

- [ ] Run for 24 hours
- [ ] No crashes or memory leaks
- [ ] Event processing stable
- [ ] RPC requests under limit
- [ ] Database queries completing
- [ ] Logs clean (no repeated errors)

---

## 📄 DOCUMENTATION VERIFICATION

- [ ] INTEGRATION_GUIDE.md exists and complete
- [ ] ENVIRONMENT_TEMPLATE.md has all variables
- [ ] README.md updated with revival features
- [ ] Code comments clear and helpful
- [ ] Architecture diagram matches implementation

---

## ☑️ FINAL GO-LIVE CHECKLIST

Before production deployment:

- [ ] All 5 phases complete
- [ ] All tests passing
- [ ] Performance baseline measured
- [ ] No critical bugs found
- [ ] 24-hour stability test passed
- [ ] Team trained on system
- [ ] Monitoring alerts configured
- [ ] Backup plan documented
- [ ] Rollback procedure tested
- [ ] Stakeholder approval obtained

---

## 🔴 BLOCKERS & ISSUES

### Critical Issues Found:
1. ___________________________________ (Phase __)
2. ___________________________________ (Phase __)
3. ___________________________________ (Phase __)

### Resolution:
- [ ] Issue #1 resolved
- [ ] Issue #2 resolved
- [ ] Issue #3 resolved

---

## ✅ SIGN-OFF

| Role | Name | Date | Signature |
|------|------|------|-----------|
| **Developer** | ________________ | ________ | ________ |
| **QA** | ________________ | ________ | ________ |
| **DevOps** | ________________ | ________ | ________ |
| **Lead** | ________________ | ________ | ________ |

---

## 📅 DEPLOYMENT TIMELINE

- **Phase 1 Start:** ________________
- **Phase 1 Complete:** ________________
- **Phase 2 Start:** ________________
- **Phase 2 Complete:** ________________
- **Phase 3 Start:** ________________
- **Phase 3 Complete:** ________________
- **Phase 4 Start:** ________________
- **Phase 4 Complete:** ________________
- **Phase 5 Start:** ________________
- **Phase 5 Complete:** ________________
- **Go-Live:** ________________

---

## 📞 SUPPORT CONTACTS

- **Technical Issues:** _________________________________
- **Database Issues:** _________________________________
- **Telegram Issues:** _________________________________
- **RPC Issues:** _________________________________
- **Emergency Escalation:** _________________________________

---

**Deployment Status:** [ ] NOT STARTED [ ] IN PROGRESS [ ] COMPLETE [ ] FAILED

**Last Updated:** ________________

**Next Review:** ________________
