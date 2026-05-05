-- File path: supabase/migrations/signal_gateway_schema.sql
-- Delivery 3: Signal Gateway / Pre-filter Schema
-- Deterministic token filtering to reduce AI load by 70-80%

-- ============================================================================
-- GATEWAY DECISIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS gateway_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(255) NOT NULL,
  token_symbol VARCHAR(50),
  passed BOOLEAN NOT NULL,
  reason VARCHAR(255) NOT NULL,
  abnormality_score DECIMAL(5, 2), -- 0-100, higher = more abnormal (interesting)
  checks_failed JSONB, -- List of checks that failed
  liquidity_usd DECIMAL(15, 2),
  holders_count INTEGER,
  token_age_minutes INTEGER,
  whale_percent DECIMAL(5, 2),
  volume_acceleration DECIMAL(8, 4),
  decision_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_token ON gateway_decisions(token_address);
CREATE INDEX IF NOT EXISTS idx_gateway_passed ON gateway_decisions(passed);
CREATE INDEX IF NOT EXISTS idx_gateway_timestamp ON gateway_decisions(decision_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gateway_symbol ON gateway_decisions(token_symbol);

-- ============================================================================
-- FILTERED TOKENS TABLE (Tracking blocked tokens)
-- ============================================================================

CREATE TABLE IF NOT EXISTS filtered_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(255) NOT NULL UNIQUE,
  symbol VARCHAR(50),
  failure_reasons JSONB NOT NULL,
  failure_count INTEGER DEFAULT 1,
  first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_filtered_address ON filtered_tokens(token_address);
CREATE INDEX IF NOT EXISTS idx_filtered_symbol ON filtered_tokens(token_symbol);

-- ============================================================================
-- GATEWAY STATISTICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS gateway_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_bucket TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_decisions INTEGER DEFAULT 0,
  passed_count INTEGER DEFAULT 0,
  blocked_count INTEGER DEFAULT 0,
  unique_tokens INTEGER DEFAULT 0,
  pass_rate DECIMAL(5, 2) DEFAULT 0,
  avg_abnormality_score DECIMAL(5, 2) DEFAULT 0,
  avg_processing_time_ms DECIMAL(10, 3) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stats_date ON gateway_statistics(date_bucket DESC);

-- ============================================================================
-- GATEWAY PERFORMANCE TABLE (Detailed metrics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS gateway_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name VARCHAR(100) NOT NULL,
  failure_count INTEGER DEFAULT 0,
  total_checks INTEGER DEFAULT 0,
  failure_rate DECIMAL(5, 2) DEFAULT 0,
  date_bucket TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perf_check ON gateway_performance(check_name);
CREATE INDEX IF NOT EXISTS idx_perf_date ON gateway_performance(date_bucket DESC);

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- Gateway summary view
CREATE OR REPLACE VIEW gateway_summary AS
SELECT
  COUNT(*) as total_decisions,
  COUNT(CASE WHEN passed THEN 1 END) as passed_count,
  COUNT(CASE WHEN NOT passed THEN 1 END) as blocked_count,
  COUNT(DISTINCT token_address) as unique_tokens,
  ROUND(100.0 * COUNT(CASE WHEN passed THEN 1 END) / COUNT(*), 1) as pass_rate,
  ROUND(AVG(COALESCE(abnormality_score, 0)), 2) as avg_abnormality_score
FROM gateway_decisions
WHERE decision_timestamp > NOW() - INTERVAL '24 hours';

-- Failures by reason
CREATE OR REPLACE VIEW gateway_failures_by_reason AS
SELECT
  reason,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM gateway_decisions WHERE NOT passed AND decision_timestamp > NOW() - INTERVAL '24 hours'), 1) as percent
FROM gateway_decisions
WHERE passed = FALSE
AND decision_timestamp > NOW() - INTERVAL '24 hours'
GROUP BY reason
ORDER BY count DESC;

-- Most abnormal tokens (candidates for analysis)
CREATE OR REPLACE VIEW gateway_abnormal_tokens AS
SELECT
  token_address,
  token_symbol,
  abnormality_score,
  reason,
  liquidity_usd,
  holders_count,
  token_age_minutes,
  decision_timestamp
FROM gateway_decisions
WHERE passed = TRUE
AND abnormality_score > 70
ORDER BY abnormality_score DESC
LIMIT 100;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update gateway statistics
CREATE OR REPLACE FUNCTION update_gateway_statistics()
RETURNS void AS $$
BEGIN
  INSERT INTO gateway_statistics (total_decisions, passed_count, blocked_count, unique_tokens, pass_rate, avg_abnormality_score)
  SELECT
    COUNT(*),
    COUNT(CASE WHEN passed THEN 1 END),
    COUNT(CASE WHEN NOT passed THEN 1 END),
    COUNT(DISTINCT token_address),
    ROUND(100.0 * COUNT(CASE WHEN passed THEN 1 END) / COUNT(*), 2),
    ROUND(AVG(COALESCE(abnormality_score, 0)), 2)
  FROM gateway_decisions
  WHERE decision_timestamp > NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Function to track filtered tokens
CREATE OR REPLACE FUNCTION track_filtered_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.passed = FALSE THEN
    INSERT INTO filtered_tokens (token_address, symbol, failure_reasons)
    VALUES (NEW.token_address, NEW.token_symbol, NEW.checks_failed)
    ON CONFLICT (token_address)
    DO UPDATE SET
      failure_count = failure_count + 1,
      last_seen = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to track filtered tokens
DROP TRIGGER IF EXISTS gateway_track_filtered ON gateway_decisions;
CREATE TRIGGER gateway_track_filtered
AFTER INSERT ON gateway_decisions
FOR EACH ROW
EXECUTE FUNCTION track_filtered_token();
