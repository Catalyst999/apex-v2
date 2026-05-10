-- File: supabase/migrations/revival_engine_schema.sql
-- Revival Engine Database Schema
-- Stores revival candidate history, patterns, and analytics

CREATE TABLE IF NOT EXISTS revival_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(255) NOT NULL UNIQUE,
  token_symbol VARCHAR(50),
  
  -- Scoring
  dormancy_score DECIMAL(5, 2),
  reactivation_velocity DECIMAL(5, 2),
  wallet_coordination_score DECIMAL(5, 2),
  liquidity_trust_score DECIMAL(5, 2),
  attention_ignition_score DECIMAL(5, 2),
  escalation_level INTEGER DEFAULT 0,
  asymmetry_rating DECIMAL(5, 2),
  
  -- Lifecycle
  lifecycle_state VARCHAR(20) CHECK (lifecycle_state IN ('DEAD', 'DORMANT', 'REACTIVATING', 'IGNITING', 'EXPLODING', 'EXHAUSTION')),
  
  -- Timestamps
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revival_token ON revival_candidates(token_address);
CREATE INDEX IF NOT EXISTS idx_revival_state ON revival_candidates(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_revival_escalation ON revival_candidates(escalation_level DESC);

-- Dormancy history (track how long tokens have been dead)
CREATE TABLE IF NOT EXISTS dormancy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(255) NOT NULL,
  dormancy_score DECIMAL(5, 2),
  days_silent INTEGER,
  volume_24h DECIMAL(20, 2),
  holder_change INTEGER,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dormancy_token ON dormancy_history(token_address);
CREATE INDEX IF NOT EXISTS idx_dormancy_recorded ON dormancy_history(recorded_at DESC);

-- Reactivation events
CREATE TABLE IF NOT EXISTS reactivation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(255) NOT NULL,
  velocity_score DECIMAL(5, 2),
  volume_spike DECIMAL(8, 4),
  buy_burst INTEGER,
  holder_acceleration INTEGER,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reactivation_token ON reactivation_events(token_address);
CREATE INDEX IF NOT EXISTS idx_reactivation_occurred ON reactivation_events(occurred_at DESC);

-- Wallet coordination patterns
CREATE TABLE IF NOT EXISTS wallet_coordination_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(255) NOT NULL,
  wallet_count INTEGER,
  coordination_score DECIMAL(5, 2),
  similar_amounts_count INTEGER,
  avg_buy_amount DECIMAL(20, 8),
  confidence DECIMAL(3, 2),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coordination_token ON wallet_coordination_patterns(token_address);
CREATE INDEX IF NOT EXISTS idx_coordination_score ON wallet_coordination_patterns(coordination_score DESC);

-- Attention ignition events
CREATE TABLE IF NOT EXISTS attention_ignition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(255) NOT NULL,
  ignition_score DECIMAL(5, 2),
  telegram_velocity DECIMAL(8, 4),
  twitter_velocity DECIMAL(8, 4),
  dexscreener_velocity DECIMAL(8, 4),
  search_velocity DECIMAL(8, 4),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ignition_token ON attention_ignition_events(token_address);
CREATE INDEX IF NOT EXISTS idx_ignition_score ON attention_ignition_events(ignition_score DESC);
CREATE INDEX IF NOT EXISTS idx_ignition_detected ON attention_ignition_events(detected_at DESC);

-- Lifecycle state transitions
CREATE TABLE IF NOT EXISTS lifecycle_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(255) NOT NULL,
  from_state VARCHAR(20),
  to_state VARCHAR(20),
  trigger VARCHAR(255),
  transitioned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_token ON lifecycle_transitions(token_address);
CREATE INDEX IF NOT EXISTS idx_lifecycle_to_state ON lifecycle_transitions(to_state);

-- Revival analytics
CREATE TABLE IF NOT EXISTS revival_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(255) NOT NULL,
  date_bucket DATE DEFAULT CURRENT_DATE,
  
  times_detected INTEGER DEFAULT 0,
  times_ignited INTEGER DEFAULT 0,
  times_exploded INTEGER DEFAULT 0,
  
  avg_escalation_level DECIMAL(5, 2),
  max_escalation_level INTEGER,
  
  avg_hold_time INTEGER,
  success_rate DECIMAL(5, 2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(token_address, date_bucket)
);

CREATE INDEX IF NOT EXISTS idx_analytics_token ON revival_analytics(token_address);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON revival_analytics(date_bucket DESC);

-- Views

CREATE OR REPLACE VIEW active_revivals AS
SELECT
  token_address,
  token_symbol,
  lifecycle_state,
  escalation_level,
  dormancy_score,
  attention_ignition_score,
  last_updated
FROM revival_candidates
WHERE lifecycle_state IN ('REACTIVATING', 'IGNITING', 'EXPLODING')
ORDER BY escalation_level DESC;

CREATE OR REPLACE VIEW revival_candidates_by_state AS
SELECT
  lifecycle_state,
  COUNT(*) as count,
  AVG(escalation_level) as avg_escalation,
  MAX(escalation_level) as max_escalation,
  MIN(escalation_level) as min_escalation
FROM revival_candidates
GROUP BY lifecycle_state;

CREATE OR REPLACE VIEW high_asymmetry_revivals AS
SELECT
  token_address,
  token_symbol,
  lifecycle_state,
  escalation_level,
  asymmetry_rating,
  last_updated
FROM revival_candidates
WHERE asymmetry_rating > 75
ORDER BY asymmetry_rating DESC
LIMIT 50;