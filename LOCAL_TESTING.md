# Local Phase-to-Phase Testing (Condensed)

Quick guide to run full local tests for Phases 1-5.

Prereqs
- Node.js >= 18
- supabase CLI (optional for local DB)

1) Start local Supabase (optional, for DB end-to-end)

```bash
supabase start
# copy SUPABASE_URL and SUPABASE_ANON_KEY to .env.local
cp .env.example .env.local
# update .env.local accordingly
```

2) Install deps & build

```bash
npm install
npm run build:backend
```

3) Dev server

```bash
npm run dev
```

4) Run single test ingest (simulate lowcap-lore):

```powershell
$env:SUPABASE_SERVICE_KEY='test'; $env:SUPABASE_URL='https://example.supabase.co'; npx ts-node -P tsconfig.backend.json scripts/test-ingest.ts
```

5) Run stress test (100 signals):

```powershell
$env:SUPABASE_SERVICE_KEY='test'; $env:SUPABASE_URL='https://example.supabase.co'; npx ts-node -P tsconfig.backend.json scripts/stress-test-ingest.ts 100
```

6) Simulate a signal over HTTP

```bash
npm run test:http -- lowcap-lore
```

If you prefer curl, use:

```bash
curl -X POST http://localhost:3000/api/test/simulate-signal \
  -H "Content-Type: application/json" \
  -d '{"source":"lowcap-lore","signal":{"pair":{"chainId":"solana","pairAddress":"FAKE_PAIR_1","baseToken":{"address":"FAKE_MINT_1","name":"FakeToken1","symbol":"FT1"},"quoteToken":{"symbol":"USDC"},"priceUsd":"0.01","fdv":5000,"marketCap":8001,"priceChange":{"m5":0,"h1":0,"h6":0,"h24":2},"txns":{"m5":{"buys":5,"sells":1},"h1":{"buys":10,"sells":2}},"volume":{"m5":500,"h1":1200,"h24":3000},"liquidity":{"usd":5000},"pairCreatedAt":1234567890,"deployer":"FAKE_DEPLOYER","holders":{"count":5,"topPercent":0.05}},"lore":{"score":70,"tier":1,"hasStrongLore":true,"narrativeName":"test","loreFactors":["short name"],"skipBundleCheck":false,"suggestedSize":"micro"},"isPreBonding":true,"ageMinutes":1,"mcap":8001,"reason":"HTTP test","confidence":78}}}'
```

7) Check the running server health

```bash
curl http://localhost:3000/health
```

---

## Phase-by-phase localhost testing

### Phase 1: Ingestion

1. Start the backend:

```powershell
npm run dev
```

2. Send a test signal:

```powershell
npm run test:ingest
```

3. Verify the hub prints messages like:
- `[Hub] ✅ Normalized lowcap-lore signal`
- `[Hub] ✅ Deduped lowcap-lore signal`
- `[Gateway] ❌ BLOCK` or pass messages

4. For source coverage, use the HTTP helper:

```powershell
npm run test:http -- dexscreener
npm run test:http -- pumpfun
npm run test:http -- fake-volume
npm run test:http -- onchain
npm run test:http -- monitor
```

### Phase 2: Intelligence

1. Leave the backend running.
2. Submit a Phase 1 signal with `test:ingest`, `test:stress`, or `test:http`.
3. Watch for Phase 2 log events:
- `[Phase2] 🔍 Signal enriched`
- `[Phase2] 📖 Narrative matched`
- `[Phase2] 📊 Pattern found`
- `[Phase2] 💪 Conviction:`

If these appear, Phase 2 enrichment is active.

### Phase 3: Execution / Monitoring

1. Ensure a wallet exists in Supabase and the backend is running.
2. If the system has trading enabled, watch for:
- `[Phase3] 🎯 Trade signal:`
- `📈 [Execution] Trade opened:`

If trading is disabled or no wallet is present, Phase 3 may not trigger locally.

### Phase 4: Telegram integration

- The current boot sequence prints `Telegram bot (skipped - not yet integrated)`.
- Phase 4 is not active in this local test environment yet.

### Phase 5: Database schema validation

1. Start Supabase locally (optional):

```bash
supabase start
```

2. Check that tables exist in the local Supabase project:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%wallet%';
```

3. Validate that the `wallets` table can be read by the backend.

---

Notes
- Tests use dummy SUPABASE env values if you don't want to run local Supabase. EventBus calls will still attempt to write to the configured `SUPABASE_URL` and may fail if it is unreachable.
- The stress test now generates source-specific payloads for `dexscreener`, `pumpfun`, `lowcap-lore`, `fake-volume`, `onchain`, and `monitor`, so normalization exercises the main Phase 1 paths.
- Gateway/filter may block many fake tokens by design, especially with fake payload data. Use the HTTP route or test script to iterate quickly.

---

## Localhost testing checklist

Use this checklist to validate each step locally.

- [ ] ✅ Phase 1: 5 scanners → hub
  - Run `npm run dev` and use `npm run test:stress -- 100`.
  - Confirm logs show normalization and deduplication for `dexscreener`, `pumpfun`, `lowcap-lore`, `fake-volume`, `onchain`, and `monitor`.

- [ ] ✅ Phase 2: Enrichment + conviction
  - Submit a Phase 1 signal and watch logs for `[Phase2] 🔍 Signal enriched`, `[Phase2] 💪 Conviction:`, or any narrative/pattern event output.

- [ ] ✅ Phase 3: All modes + risk
  - Ensure the backend can load a wallet from Supabase and that `EXECUTION` mode is configured.
  - Confirm if trading is enabled, logs include `[Phase3] 🎯 Trade signal:` or execution risk events.

- [ ] ✅ Phase 4: Blockchain paths (simulated)
  - Use `npm run test:http -- monitor` to simulate on-chain monitor signal flow.
  - Use `test:http` with `dexscreener`, `pumpfun`, `fake-volume`, and `onchain` to validate path coverage.

- [ ] ✅ Phase 5: Learning loop
  - Watch for any learning-related event logs once Phase 2 signals are emitted, such as outcome or learning processor messages.

- [ ] ✅ Database: All tables + data
  - If using local Supabase, verify the `wallets` table and any Phase 5/learning tables exist.
  - Confirm the backend can successfully connect to Supabase.

- [ ] ✅ Integration: End-to-end flow
  - Start the backend, send a test signal, and verify it progresses from ingestion through enrichment and event emission.

- [ ] ✅ Stress test: 100+ trades
  - Use `npm run test:stress -- 100`.
  - Confirm the backend processes 100 source-specific test signals without uncaught normalization crashes.

- [ ] ✅ Error handling: Graceful
  - Confirm the test scripts report connection or Supabase issues cleanly and do not crash silently.

- [ ] ✅ Ready for cloud
  - Run `npm run build:backend` and ensure `tsc` succeeds.
  - Confirm the HTTP test helper works once the backend is running.

