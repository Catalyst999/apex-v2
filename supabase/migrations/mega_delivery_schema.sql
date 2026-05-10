-- File path: supabase/migrations/mega_delivery_schema.sql
-- MEGA DELIVERIES D8-D12 DATABASE SCHEMA
-- Complete trading infrastructure

-- ─────────────────────────────────────────────────────────────────────
-- D8: POSITION MANAGEMENT
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS position_scaling_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  position_id VARCHAR(100),
  action VARCHAR(20), -- SCALE_UP, SCALE_DOWN
  size_change NUMERIC(15, 2),
  new_entry_price NUMERIC(18, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trailing_stop_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  position_id VARCHAR(100),
  old_stop NUMERIC(18, 8),
  new_stop NUMERIC(18, 8),
  price_at_update NUMERIC(18, 8),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_position_scaling_history_position_id ON position_scaling_history(position_id);
CREATE INDEX IF NOT EXISTS idx_position_scaling_history_created_at ON position_scaling_history(created_at);
CREATE INDEX IF NOT EXISTS idx_trailing_stop_updates_position_id ON trailing_stop_updates(position_id);

-- ─────────────────────────────────────────────────────────────────────
-- D9: TRADING JOURNAL & LEARNING
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trading_journal (
  id VARCHAR(100) PRIMARY KEY,
  wallet_id VARCHAR(100),
  token VARCHAR(100),
  entry_price NUMERIC(18, 8),
  exit_price NUMERIC(18, 8),
  position_size NUMERIC(15, 2),
  pnl NUMERIC(15, 2),
  pnl_percent NUMERIC(5, 2),
  hold_time_minutes INT,
  entry_signals TEXT[],
  entry_conviction INT,
  regime VARCHAR(50),
  narrative VARCHAR(100),
  exit_reason VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id VARCHAR(100),
  summary_date DATE,
  trades_count INT,
  win_rate NUMERIC(5, 2),
  total_pnl NUMERIC(15, 2),
  key_insights JSONB,
  recommendations JSONB,
  ai_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_trading_journal_wallet_id ON trading_journal(wallet_id);
CREATE INDEX IF NOT EXISTS idx_trading_journal_token ON trading_journal(token);
CREATE INDEX IF NOT EXISTS idx_trading_journal_created_at ON trading_journal(created_at);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_wallet_id ON daily_summaries(wallet_id);

-- ─────────────────────────────────────────────────────────────────────
-- D10: PORTFOLIO RISK MANAGEMENT
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS correlation_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token1 VARCHAR(100),
  token2 VARCHAR(100),
  correlation_score NUMERIC(5, 2),
  risk_level VARCHAR(20), -- LOW, MEDIUM, HIGH
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drawdown_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id VARCHAR(100),
  peak_value NUMERIC(15, 2),
  trough_value NUMERIC(15, 2),
  drawdown_percent NUMERIC(5, 2),
  severity VARCHAR(20), -- MINOR, MODERATE, SEVERE, CATASTROPHIC
  recovery_days INT,
  recovered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_correlation_analysis_tokens ON correlation_analysis(token1, token2);
CREATE INDEX IF NOT EXISTS idx_drawdown_events_wallet_id ON drawdown_events(wallet_id);
CREATE INDEX IF NOT EXISTS idx_drawdown_events_severity ON drawdown_events(severity);

-- ─────────────────────────────────────────────────────────────────────
-- D11: IGNITION DETECTION
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ignition_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token VARCHAR(100),
  ignition_score NUMERIC(5, 2),
  silent_accumulation BOOLEAN,
  wallet_clustering BOOLEAN,
  liquidity_prep BOOLEAN,
  holder_retention BOOLEAN,
  social_acceleration BOOLEAN,
  estimated_breakout_days INT,
  confidence NUMERIC(5, 2),
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ignition_signals_token ON ignition_signals(token);
CREATE INDEX IF NOT EXISTS idx_ignition_signals_score ON ignition_signals(ignition_score);

-- ─────────────────────────────────────────────────────────────────────
-- D12: UI & MONITORING
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mini_app_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id VARCHAR(100),
  wallet_id VARCHAR(100),
  session_data JSONB,
  last_action_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dashboard_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type VARCHAR(50),
  data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mini_app_sessions_user_id ON mini_app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_events_event_type ON dashboard_events(event_type);
CREATE INDEX IF NOT EXISTS idx_dashboard_events_created_at ON dashboard_events(created_at);

-- ─────────────────────────────────────────────────────────────────────
-- FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_portfolio_metrics(wallet_id_param UUID)
RETURNS TABLE (
  total_capital NUMERIC,
  total_value NUMERIC,
  total_pnl NUMERIC,
  win_rate NUMERIC,
  open_positions INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(position_size * leverage), 0)::NUMERIC as total_capital,
    COALESCE(SUM(position_size * (current_price / entry_price)), 0)::NUMERIC as total_value,
    COALESCE(SUM((current_price - entry_price) * position_size), 0)::NUMERIC as total_pnl,
    COALESCE(
      100.0 * COUNT(CASE WHEN current_price > entry_price THEN 1 END) / 
      NULLIF(COUNT(*), 0), 0
    )::NUMERIC as win_rate,
    COUNT(*)::INT as open_positions
  FROM active_positions
  WHERE wallet_id = wallet_id_param AND status = 'OPEN';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_drawdown(wallet_id_param UUID)
RETURNS NUMERIC AS $$
DECLARE
  peak_val NUMERIC;
  current_val NUMERIC;
BEGIN
  SELECT COALESCE(MAX(peak_value), 100) INTO peak_val
  FROM drawdown_events
  WHERE wallet_id = wallet_id_param;
  
  SELECT COALESCE(SUM(position_size * current_price / entry_price), 100) INTO current_val
  FROM active_positions
  WHERE wallet_id = wallet_id_param AND status = 'OPEN';
  
  RETURN ((peak_val - current_val) / peak_val * 100);
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW trading_performance AS
SELECT
  wallet_id,
  DATE(created_at) as trade_date,
  COUNT(*) as trades,
  SUM(CASE WHEN pnl_percent > 0 THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC * 100 as win_rate,
  SUM(pnl) as daily_pnl,
  AVG(pnl_percent) as avg_pnl_percent
FROM trading_journal
GROUP BY wallet_id, DATE(created_at)
ORDER BY trade_date DESC;

CREATE OR REPLACE VIEW portfolio_health AS
SELECT
  COALESCE(ap.wallet_id::text, dd.wallet_id::text) as wallet_id,
  COUNT(DISTINCT ap.id) as open_positions,
  COALESCE(dd.severity, 'HEALTHY') as current_drawdown_severity,
  COALESCE(dd.drawdown_percent, 0) as current_drawdown_percent
FROM active_positions ap
FULL OUTER JOIN drawdown_events dd
  ON ap.wallet_id::text = dd.wallet_id::text
  AND dd.recovered_at IS NULL
WHERE ap.status = 'OPEN' OR dd.recovered_at IS NULL
GROUP BY COALESCE(ap.wallet_id::text, dd.wallet_id::text), dd.severity, dd.drawdown_percent;

-- ─────────────────────────────────────────────────────────────────────
-- INDEXES FOR PERFORMANCE
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_journal_wallet_date ON trading_journal(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ignition_detected ON ignition_signals(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_correlation_risk ON correlation_analysis(risk_level, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawdown_wallet_severity ON drawdown_events(wallet_id, severity);
