# ENVIRONMENT TEMPLATE - CATALYST APEX HYBRID RPC + REVIVAL ENGINE

Copy this template to `.env` and fill in your values.

---

## 📡 SOLANA RPC CONFIGURATION

```env
# Primary RPC URL (public free tier)
RPC_URL=https://api.mainnet-beta.solana.com

# WebSocket RPC URL
WS_RPC_URL=wss://api.mainnet-beta.solana.com

# For public RPC (used as fallback)
PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
```

---

## 🔑 HELIUS CONFIGURATION

```env
# Helius API Key (from https://www.helius.dev/)
HELIUS_API_KEY=your_helius_api_key_here

# Enable Helius features
HELIUS_WEBSOCKET_ENABLED=true
HELIUS_ENRICHMENT_ENABLED=true
HELIUS_ENRICHMENT_CONVICTION_THRESHOLD=75

# Optional: Helius webhook secret
HELIUS_WEBHOOK_SECRET=your_webhook_secret_here
```

**Cost Estimate:** $0.50-2.00/month for revival detection

---

## 🎯 HYBRID RPC THROTTLING

```env
# Request cooldown between calls (ms)
RPC_COOLDOWN_MS=500

# Max retries per request
RPC_MAX_RETRIES=3

# Batch size for multi-requests
RPC_BATCH_SIZE=10

# Concurrent request limit
RPC_CONCURRENT_LIMIT=3

# Request timeouts (ms)
URGENT_TIMEOUT_MS=5000
BACKGROUND_TIMEOUT_MS=30000

# Circuit breaker settings
CIRCUIT_BREAKER_MS=60000
CIRCUIT_BREAKER_TRIPS=5
```

**Goal:** Zero 429 rate limit errors

---

## 📊 DEXSCREENER CONFIGURATION

```env
# Enable DexScreener market data layer
DEXSCREENER_ENABLED=true

# DexScreener API rate limit
DEXSCREENER_RATE_LIMIT=300
```

---

## 💾 DATABASE CONFIGURATION

```env
# Supabase Project URL
SUPABASE_URL=https://your-project.supabase.co

# Supabase Anon Key (public)
SUPABASE_ANON_KEY=your_anon_key_here

# Supabase Service Key (private - keep secret!)
SUPABASE_SERVICE_KEY=your_service_key_here
```

**Setup:**
1. Create Supabase project at https://supabase.com
2. Get URL and keys from Project Settings > API
3. Run migrations: `supabase migration up`

---

## 🔴 REDIS CONFIGURATION

```env
# Redis URL (required for job queues)
REDIS_URL=redis://localhost:6379

# Or for managed Redis:
# REDIS_URL=redis://username:password@your-redis-host:6379
```

**Local Setup:**
```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or install locally
brew install redis  # macOS
# Then: redis-server
```

---

## 🤖 TELEGRAM CONFIGURATION

```env
# Telegram Bot Token (from @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Telegram Channel IDs for alerts
TELEGRAM_ALERT_CHANNEL_ID=your_channel_id_here

# Optional: Admin user ID for restricted commands
TELEGRAM_ADMIN_ID=your_user_id_here
```

**Setup:**
1. Message @BotFather on Telegram
2. /newbot
3. Copy token to TELEGRAM_BOT_TOKEN

---

## 🧠 REVIVAL ENGINE CONFIGURATION

```env
# Enable/disable revival engine
ENABLE_REVIVAL_ENGINE=true

# Dormancy detection (days)
DORMANCY_THRESHOLD_DAYS=7
MAX_DORMANCY_DAYS=180

# Reactivation velocity checking
VELOCITY_CHECK_INTERVAL=5000
VELOCITY_BURST_THRESHOLD=2.0

# Wallet coordination detection
MIN_COORDINATOR_WALLETS=3
COORDINATION_THRESHOLD=65

# Liquidity trust scoring
LIQUIDITY_BACKING_MIN=50

# Attention ignition threshold
IGNITION_THRESHOLD=70

# Watchlist management
MAX_REVIVAL_CANDIDATES=500
CANDIDATE_TTL_MS=3600000
```

---

## 🏃 SYSTEM MODE & TRADING

```env
# System mode: shadow (local testing), paper (simulation), live (real)
SYSTEM_MODE=shadow

# Paper trading (simulated execution)
ENABLE_PAPER_TRADING=false
ENABLE_AUTO_TRADING=false

# Risk limits
MAX_POSITION_SIZE=1
MAX_DAILY_LOSS_PERCENT=5

# Dry run mode (log but don't execute)
DRY_RUN=true
```

---

## 🔐 SOLANA KEYPAIR

```env
# Option 1: Keypair JSON string (from Phantom export)
# SOLANA_KEYPAIR_SECRET=[1,2,3,...]

# Option 2: Path to keypair file
# SOLANA_KEYPAIR_PATH=/path/to/id.json

# Option 3: Public key only (for monitoring, no trading)
# SOLANA_KEYPAIR_PUBLIC=YourPublicKeyHere
```

**⚠️ IMPORTANT:** Never commit keypair secrets to git!

---

## 🌐 SERVER CONFIGURATION

```env
# Server port
PORT=3000

# Server host
HOST=0.0.0.0

# Node environment
NODE_ENV=development

# Public URL (for webhooks, logging)
PUBLIC_URL=http://localhost:3000
```

---

## 📡 WEBHOOK CONFIGURATION

```env
# Enable webhook receivers
ENABLE_WEBHOOKS=true

# Helius webhook port
HELIUS_WEBHOOK_PORT=3000

# Verify webhook signatures
VERIFY_WEBHOOK_SIGNATURES=true
```

---

## 📊 ANALYTICS & LOGGING

```env
# Log level: error, warn, info, debug, trace
LOG_LEVEL=info

# Enable detailed RPC logging
DEBUG_RPC=false

# Enable revival engine debugging
DEBUG_REVIVAL_ENGINE=false

# Sentry error tracking (optional)
# SENTRY_DSN=https://...@sentry.io/...
```

---

## 🔍 MONITORING CONFIGURATION

```env
# Enable health check endpoint
ENABLE_HEALTH_CHECK=true

# Health check interval (ms)
HEALTH_CHECK_INTERVAL=60000

# Metrics collection
COLLECT_METRICS=true

# Prometheus metrics port
METRICS_PORT=9090
```

---

## 🎓 AI MODEL CONFIGURATION

```env
# Anthropic API Key (for Claude)
ANTHROPIC_API_KEY=your_key_here

# Token budgets (per day)
HAIKU_TOKEN_LIMIT=100000
GROK_TOKEN_LIMIT=50000
```

---

## 🛡️ SECURITY

```env
# API Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS_PER_MINUTE=60

# CORS Origins
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# JWT Secret (for API auth)
JWT_SECRET=your_jwt_secret_key_here

# CSRF Token Secret
CSRF_SECRET=your_csrf_secret_here
```

---

## ✅ VALIDATION CHECKLIST

Before running:

- [ ] `HELIUS_API_KEY` is set and valid
- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` configured
- [ ] `REDIS_URL` points to running Redis instance
- [ ] `TELEGRAM_BOT_TOKEN` is valid
- [ ] `SOLANA_KEYPAIR_*` configured (for trading)
- [ ] `SYSTEM_MODE` is `shadow` for initial testing
- [ ] `PORT` is not already in use
- [ ] All required environment variables present

---

## 🚀 INITIALIZATION COMMAND

```bash
# Verify all env vars are set:
node -e "
const required = [
  'HELIUS_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'REDIS_URL',
  'TELEGRAM_BOT_TOKEN'
];

const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ Missing required env vars:', missing);
  process.exit(1);
}

console.log('✅ All required env vars present');
"
```

---

## 📝 EXAMPLE .env FILE

```env
# RPC
RPC_URL=https://api.mainnet-beta.solana.com
WS_RPC_URL=wss://api.mainnet-beta.solana.com
PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com

# Helius
HELIUS_API_KEY=abc123xyz
HELIUS_WEBSOCKET_ENABLED=true
HELIUS_ENRICHMENT_ENABLED=true

# Database
SUPABASE_URL=https://myproject.supabase.co
SUPABASE_ANON_KEY=public_key
SUPABASE_SERVICE_KEY=secret_key

# Redis
REDIS_URL=redis://localhost:6379

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# Revival Engine
ENABLE_REVIVAL_ENGINE=true
DORMANCY_THRESHOLD_DAYS=7
COORDINATION_THRESHOLD=65

# System
SYSTEM_MODE=shadow
DRY_RUN=true
PORT=3000
LOG_LEVEL=info
```

---

## 🆘 COMMON ISSUES

### "Cannot find environment variable X"
**Solution:** Add to .env file and restart server

### "Helius API key invalid"
**Solution:** Get new key from https://www.helius.dev/dashboard/apikeys

### "Redis connection refused"
**Solution:** Start Redis: `redis-server` or `docker run -d -p 6379:6379 redis`

### "Supabase connection failed"
**Solution:** Verify URL and keys are correct, check firewall/VPN

### "Telegram bot not responding"
**Solution:** Verify token is correct, ensure bot is not running elsewhere

---

## 🔐 SECURITY NOTES

⚠️ **CRITICAL:**
- Never commit `.env` file to git
- Never share SUPABASE_SERVICE_KEY
- Never share SOLANA_KEYPAIR_SECRET
- Rotate API keys quarterly
- Use `.env.local` for development

✅ **Best Practices:**
- Use different keys for dev/staging/production
- Enable IP whitelisting on Supabase
- Monitor API usage for unauthorized access
- Keep Node.js and dependencies updated

---

**Last Updated:** May 2026  
**Version:** 2.0.0 (Hybrid RPC + Revival Engine)
