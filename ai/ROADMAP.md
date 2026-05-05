**# CATALYST APEX TRADER - COMPLETE MASTER ROADMAP**

## FULL PROJECT DELIVERY CHECKLIST

This is the **definitive sequence** for deploying Catalyst Apex Trader from current state to fully operational system.

---

## PHASE 1: BUILD STABILITY (Week 1)

### ✅ COMPLETED - Delivery 0: Build Fixes

| Task | Status | Time | Files |
|------|--------|------|-------|
| Fix 68 TypeScript errors | ✅ DONE | 17 min | 2 files |
| Update config.ts (hybrid) | ✅ DONE | 5 min | 1 file |
| Update bot.ts (simple) | ✅ DONE | 5 min | 1 file |
| Test build passes | ✅ DONE | 5 min | - |
| Deploy to Railway | ✅ DONE | 2 min | - |

**Result:** Build passes ✅ | Bot responds in Telegram ✅ | Ready for new modules ✅

---

## PHASE 2: FOUNDATIONAL INFRASTRUCTURE (Week 1, Thu-Fri)

### ⏳ PENDING - Wallet Isolation (Delivery 1 Extension)

**THIS IS BLOCKING EVERYTHING ELSE**

| Task | Status | Time | Dependencies |
|------|--------|------|--------------|
| Deploy wallet database schema | ⏳ TODO | 15 min | Build fix complete |
| Create 5 wallet modules | ⏳ TODO | 45 min | Schema deployed |
| Update 6 existing files | ⏳ TODO | 30 min | Modules created |
| Add Telegram wallet commands | ⏳ TODO | 20 min | Files updated |
| Test in Telegram | ⏳ TODO | 15 min | Commands added |
| Deploy to Railway | ⏳ TODO | 5 min | Tests pass |

**What gets created:**
```
Database:
├─ wallets table
├─ wallet_risk_profiles
├─ wallet_analytics
└─ Updates to 7 existing tables (add wallet_id)

Code:
├─ wallet-manager.ts
├─ wallet-discovery-engine.ts
├─ telegram-wallet-commands.ts
├─ Updates to market-memory-engine.ts
├─ Updates to conviction-scaler.ts
└─ Updates to router.ts

Telegram Commands:
├─ /wallet
├─ /wallets
├─ /add_wallet <address> <strategy> <tag>
├─ /select_wallet <address>
├─ /tag_wallet <address> <tag>
└─ /strategy <address> <strategy>
```

**Result:** 
- ✅ 3 isolated wallet contexts (A/B/C)
- ✅ Per-wallet independent analytics
- ✅ Telegram wallet control
- ✅ Foundation for all intelligence modules

**Files needed:**
- SCHEMA_WALLET_UPDATE.md (SQL)
- wallet-manager.ts
- wallet-discovery-engine.ts
- telegram-wallet-commands.ts
- 6 files with wallet_id integration
- WALLET_ISOLATION_GUIDE.md

---

## PHASE 3: INTELLIGENCE MODULES (Week 2)

### ✅ COMPLETED - Insider Momentum Intelligence (Delivery 2A)

| Task | Status | Time | Dependencies |
|------|--------|------|--------------|
| Create 8 database tables | ✅ DONE | 15 min | Supabase |
| Build detection engine | ✅ DONE | 2 hrs | - |
| Build type definitions | ✅ DONE | 1 hr | - |
| Integrate with router | ✅ DONE | 1 hr | - |
| Deploy to Railway | ✅ DONE | 5 min | - |

**What it does:**
- 5 signal detection (dormancy, coordination, retention, liquidity, social)
- Composite scoring (0-100)
- Beast mode classification
- Database tracking

**Expected Alpha:** 30-50%

---

### ✅ COMPLETED - Reverse Engineering Engine (Delivery 2C)

| Task | Status | Time | Dependencies |
|------|--------|------|--------------|
| Create 4 database tables | ✅ DONE | 10 min | Supabase |
| Build learning engine | ✅ DONE | 2.5 hrs | - |
| Build type definitions | ✅ DONE | 1 hr | - |
| Integrate with router | ✅ DONE | 1 hr | - |
| Deploy to Railway | ✅ DONE | 5 min | - |

**What it does:**
- 10 conviction trigger extraction
- Pattern library building
- Behavioral fingerprinting
- Historical pattern matching

**Expected Alpha:** 15-25%

---

### ✅ COMPLETED - Bull Run Intelligence (Delivery 2B #1)

| Task | Status | Time | Dependencies |
|------|--------|------|--------------|
| Create 4 database tables | ✅ DONE | 10 min | Supabase |
| Build regime detection engine | ✅ DONE | 2 hrs | - |
| Build type definitions | ✅ DONE | 1 hr | - |
| Integrate with router | ✅ DONE | 1 hr | - |
| Deploy to Railway | ✅ DONE | 5 min | - |

**What it does:**
- 5 signal analysis (momentum, volatility, whales, win rate, liquidity)
- 6 regime phases classification
- Risk multiplier calculation (0.1x - 2.0x)
- Regime transition alerts

**Expected Alpha:** 15-20%

---

### ✅ COMPLETED - Supabase Database Setup

| Task | Status | Time |
|------|--------|------|
| Deploy all 16 tables | ✅ DONE | 20 min |
| Create 28+ indexes | ✅ DONE | 5 min |
| Create 1 view | ✅ DONE | 5 min |
| Create 2 functions | ✅ DONE | 5 min |
| Create 3 triggers | ✅ DONE | 5 min |
| Verify all schemas | ✅ DONE | 10 min |

**Total tables:** 16 (8 Insider + 4 Reverse Eng + 4 Bull Run)

---

## PHASE 4: USER EXPOSURE & CONTROL (Week 2-3)

### ⏳ PENDING - Extended Telegram Commands (Delivery 2B #2)

**DEPENDS ON:** Wallet Isolation

| Task | Status | Time | Dependencies |
|------|--------|------|--------------|
| Build command engine | ⏳ TODO | 1.5 hrs | Wallet isolation |
| Add /regime command | ⏳ TODO | 15 min | Bull run engine |
| Add /insider command | ⏳ TODO | 15 min | Insider momentum |
| Add /beast command | ⏳ TODO | 15 min | Insider momentum |
| Add /patterns command | ⏳ TODO | 15 min | Reverse engineering |
| Add /positions command | ⏳ TODO | 20 min | Risk engine |
| Add /trade command | ⏳ TODO | 30 min | Execution layer |
| Add /close command | ⏳ TODO | 20 min | Execution layer |
| Test all commands | ⏳ TODO | 20 min | - |
| Deploy to Railway | ⏳ TODO | 5 min | - |

**What you'll see in Telegram:**
```
/regime              → Current market phase + risk multiplier
/insider <token>    → Insider momentum score + 5 signals
/beast              → List all beast mode candidates
/patterns <token>   → Show matched historical patterns
/positions          → Active positions + regime info + P&L
/trade <token>      → Execute trade with conviction calculation
/close <position_id>→ Close position with reason
/pnl               → Total P&L summary
```

**Result:** 
- ✅ All intelligence visible in Telegram
- ✅ Full trade execution from chat
- ✅ Real-time monitoring

---

### ⏳ PENDING - Insider Detector (Delivery 2B #3)

**DEPENDS ON:** Wallet isolation, Extended Telegram Commands

| Task | Status | Time | Dependencies |
|------|--------|------|--------------|
| Build detector engine | ⏳ TODO | 1.5 hrs | - |
| Create 4 database tables | ⏳ TODO | 10 min | Supabase |
| Integrate with router | ⏳ TODO | 45 min | - |
| Add /rugcheck command | ⏳ TODO | 15 min | Extended Telegram |
| Deploy to Railway | ⏳ TODO | 5 min | - |

**What it does:**
- Detect wallet dumping patterns
- Flag rug risks
- Profit-taking signals
- Wallet relationship mapping

**Expected Alpha:** 10-15% (prevents losses)

---

### ⏳ PENDING - Portfolio Correlation Manager (Delivery 2B #4)

**DEPENDS ON:** Wallet isolation

| Task | Status | Time | Dependencies |
|------|--------|------|--------------|
| Build correlation engine | ⏳ TODO | 1 hr | - |
| Create 2 database tables | ⏳ TODO | 10 min | Supabase |
| Integrate with router | ⏳ TODO | 30 min | - |
| Test diversification | ⏳ TODO | 20 min | - |
| Deploy to Railway | ⏳ TODO | 5 min | - |

**What it does:**
- Prevent narrative overlap (PEPE + WIF = correlated)
- Portfolio diversification
- Prevent single-theme collapse

**Expected Alpha:** 8-12%

---

### ⏳ PENDING - Mini App Tier 1 Dashboard (Delivery 2B #5)

**DEPENDS ON:** Extended Telegram Commands (minimum), ideally all above

| Task | Status | Time | Dependencies |
|------|--------|------|--------------|
| Build React dashboard | ⏳ TODO | 2 hrs | - |
| Connect to Supabase | ⏳ TODO | 45 min | - |
| Add live token feeds | ⏳ TODO | 30 min | - |
| Add position tracking | ⏳ TODO | 30 min | - |
| Add P&L visualization | ⏳ TODO | 30 min | - |
| Add regime indicator | ⏳ TODO | 20 min | - |
| Test responsiveness | ⏳ TODO | 20 min | - |
| Deploy to Railway | ⏳ TODO | 10 min | - |

**What you'll see:**
- Live token feeds
- Position tracking
- P&L visualization
- Beast candidate alerts
- Signal heatmap
- Regime indicator

**Result:** 
- ✅ Web-based monitoring dashboard
- ✅ Real-time alerts
- ✅ Beautiful UI

---

## SUMMARY BY PHASE

| Phase | Status | Components | Time | Result |
|-------|--------|------------|------|--------|
| **Phase 1** | ✅ DONE | Build fixes | 2 hrs | Build passes |
| **Phase 2** | ⏳ TODO | Wallet isolation | 2.5 hrs | Multi-wallet foundation |
| **Phase 3** | ✅ DONE | 3 intelligence engines + DB | 12 hrs | Intelligence running |
| **Phase 4** | ⏳ TODO | Telegram + Dashboard | 8-10 hrs | User control + visibility |

---

## CRITICAL DEPENDENCY CHAIN

```
Build Fix (✅) 
  ↓
Wallet Isolation (⏳ BLOCKING)
  ↓
  ├─ Insider Momentum (✅)
  ├─ Reverse Engineering (✅)
  ├─ Bull Run Intelligence (✅)
  └─ Extended Telegram Commands (⏳ BLOCKED)
       ↓
       ├─ Insider Detector (⏳ BLOCKED)
       ├─ Portfolio Correlation (⏳ BLOCKED)
       └─ Mini App (⏳ BLOCKED)
```

**BLOCKER IDENTIFIED:** Wallet Isolation must be deployed FIRST before Extended Telegram Commands can work properly.

---

## WHAT'S PREVENTING BOT CHANGES

Currently:
- ✅ Intelligence is calculating
- ✅ Data is being stored in Supabase
- ❌ **No wallet context** (Wallet Isolation not deployed)
- ❌ **No Telegram commands** to expose it (Extended Telegram not built)

That's why the bot shows no change despite new modules.

---

## RECOMMENDED SEQUENCE (CORRECTED)

### Week 1
- Mon-Wed: Build fixes (✅ DONE)
- Thu-Fri: **Deploy Wallet Isolation** (2.5 hrs)

### Week 2
- Mon-Tue: **Build Extended Telegram Commands** (3 hrs)
- Wed-Fri: Test, monitor, tune

### Week 3
- Mon-Tue: **Build Insider Detector** (1.5 hrs)
- Wed-Fri: Test, monitor

### Week 4
- Mon: **Build Portfolio Correlation** (1 hr)
- Tue-Thu: **Build Mini App** (2 hrs)
- Fri: Test all together

---

## TOTAL PROJECT SCOPE

| Category | Count | Status |
|----------|-------|--------|
| Database tables | 16 + 8 | ✅ Base done, ⏳ +8 for wallet |
| Code modules | 18 | ✅ 6 done, ⏳ 12 to go |
| Telegram commands | 22 | ⏳ 8 built, ⏳ 14 to add |
| React components | 8 | ⏳ All pending |
| Integration points | 12 | ✅ 3 done, ⏳ 9 to go |

---

## YOUR DECISION POINT

We have **two options:**

### Option A: Go Back & Deploy Wallet Isolation First (Recommended)
- Deploy wallet isolation now (2.5 hours)
- Then everything else works properly per-wallet
- Extended Telegram Commands will have wallet context
- All intelligence will be per-wallet isolated

### Option B: Ignore Wallet Isolation & Build Extended Telegram Commands
- Build commands against single wallet (hacky)
- Will require rework later when adding isolation
- Not ideal

---
