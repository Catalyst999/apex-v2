-- File path: supabase/migrations/event_pipeline_schema.sql
-- Delivery 2: Event Pipeline Schema
-- This migration adds event-driven architecture to Catalyst Apex Trader

-- ============================================================================
-- EVENT PIPELINE TABLES
-- ============================================================================

-- Events table (central event log for all signals)
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source VARCHAR(100),
  wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_wallet ON events(wallet_id);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);

-- Trades table (executed trades)
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) NOT NULL,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  entry_price DECIMAL(20, 10) NOT NULL,
  position_size DECIMAL(20, 10) NOT NULL,
  leverage DECIMAL(5, 2) DEFAULT 1.0,
  conviction DECIMAL(5, 2),
  status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
  entry_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  exit_price DECIMAL(20, 10),
  exit_timestamp TIMESTAMP WITH TIME ZONE,
  pnl DECIMAL(20, 10),
  pnl_percent DECIMAL(8, 4),
  reason VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet_id);
CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_timestamp DESC);

-- Outcomes table (trade outcomes for learning)
CREATE TABLE IF NOT EXISTS outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('WIN', 'LOSS', 'BREAK_EVEN')),
  pnl DECIMAL(20, 10) NOT NULL,
  learnings JSONB,
  confidence DECIMAL(5, 2),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcomes_trade ON outcomes(trade_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_wallet ON outcomes(wallet_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_outcome ON outcomes(outcome);
CREATE INDEX IF NOT EXISTS idx_outcomes_timestamp ON outcomes(timestamp DESC);

-- Event subscriptions table (for event bus subscriptions)
CREATE TABLE IF NOT EXISTS event_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  subscriber VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_type ON event_subscriptions(event_type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber ON event_subscriptions(subscriber);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON event_subscriptions(active);

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- Recent events view
CREATE OR REPLACE VIEW recent_events AS
SELECT
  id,
  type,
  payload,
  timestamp,
  source,
  wallet_id
FROM events
ORDER BY timestamp DESC
LIMIT 100;

-- Trade performance view
CREATE OR REPLACE VIEW trade_performance AS
SELECT
  t.token,
  t.wallet_id,
  COUNT(*) as total_trades,
  COUNT(CASE WHEN o.outcome = 'WIN' THEN 1 END) as wins,
  COUNT(CASE WHEN o.outcome = 'LOSS' THEN 1 END) as losses,
  ROUND(AVG(o.pnl), 4) as avg_pnl,
  ROUND(SUM(o.pnl), 4) as total_pnl,
  ROUND(AVG(o.confidence), 2) as avg_confidence
FROM trades t
LEFT JOIN outcomes o ON t.id = o.trade_id
WHERE t.status = 'CLOSED'
GROUP BY t.token, t.wallet_id;

-- Event frequency view
CREATE OR REPLACE VIEW event_frequency AS
SELECT
  type,
  COUNT(*) as count,
  MIN(timestamp) as first_seen,
  MAX(timestamp) as last_seen,
  EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 3600 as hours_span
FROM events
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY type
ORDER BY count DESC;</content>
<parameter name="filePath">c:\Users\user\apex-v2\apex-v2\supabase\migrations\event_pipeline_schema.sql