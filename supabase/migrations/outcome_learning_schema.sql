-- File path: supabase/migrations/outcome_learning_schema.sql
-- Delivery 4: Outcome Learning / Feedback Loop Schema
-- System learns from trade results to improve over time

-- ============================================================================
-- TRADE OUTCOMES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  token_address VARCHAR(255) NOT NULL,
  token_symbol VARCHAR(50),
  
  -- Entry Info
  entry_price DECIMAL(20, 10) NOT NULL,
  entry_conviction DECIMAL(5, 2) NOT NULL,
  entry_mode VARCHAR(50) NOT NULL, -- CONSERVATIVE|AGGRESSIVE|EXPERIMENTAL
  entry_signals JSONB, -- Array of signal types that fired
  entry_timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Market Context
  emotion_state VARCHAR(50), -- CALM|FOMO|FEAR|UNCERTAIN
  market_regime VARCHAR(50), -- HEALTHY|WARMING|COLD
  narrative_context VARCHAR(255),
  abnormality_score DECIMAL(5, 2),
  
  -- Exit Info
  exit_price DECIMAL(20, 10),
  exit_reason VARCHAR(100), -- take_profit_hit|stop_loss_hit|manual|timeout
  exit_timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Outcome
  pnl DECIMAL(20, 10),
  pnl_percent DECIMAL(8, 4),
  hold_time_seconds INTEGER,
  win BOOLEAN, -- true if pnl > 0
  
  -- False Signal Detection
  false_liquidity_signal BOOLEAN DEFAULT false,
  fake_social_signal BOOLEAN DEFAULT false,
  whale_exit_detected BOOLEAN DEFAULT false,
  manipulation_detected BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcomes_wallet ON trade_outcomes(wallet_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_token ON trade_outcomes(token_address);
CREATE INDEX IF NOT EXISTS idx_outcomes_win ON trade_outcomes(win);
CREATE INDEX IF NOT EXISTS idx_outcomes_timestamp ON trade_outcomes(created_at DESC);

-- ============================================================================
-- SIGNAL CORRELATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS signal_correlation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  signal_type VARCHAR(100) NOT NULL,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 4) DEFAULT 0, -- 0.0 to 1.0
  avg_pnl DECIMAL(20, 10) DEFAULT 0,
  avg_hold_time DECIMAL(10, 2) DEFAULT 0,
  latest_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_corr_wallet ON signal_correlation(wallet_id);
CREATE INDEX IF NOT EXISTS idx_signal_corr_signal ON signal_correlation(signal_type);
CREATE INDEX IF NOT EXISTS idx_signal_corr_winrate ON signal_correlation(win_rate DESC);

-- ============================================================================
-- ANTI-PATTERNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS anti_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  pattern_type VARCHAR(100) NOT NULL, -- false_liquidity|fake_social|whale_exit|manipulation
  frequency INTEGER DEFAULT 1,
  total_loss DECIMAL(20, 10) DEFAULT 0,
  avg_loss DECIMAL(20, 10) DEFAULT 0,
  tokens_affected VARCHAR(255)[], -- Array of token addresses
  description TEXT,
  first_detected TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_detected TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_antipattern_wallet ON anti_patterns(wallet_id);
CREATE INDEX IF NOT EXISTS idx_antipattern_type ON anti_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_antipattern_loss ON anti_patterns(total_loss DESC);

-- ============================================================================
-- FALSE SIGNALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS false_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  token_address VARCHAR(255) NOT NULL,
  token_symbol VARCHAR(50),
  signal_type VARCHAR(100) NOT NULL,
  reason VARCHAR(255),
  pnl DECIMAL(20, 10),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_falsesig_wallet ON false_signals(wallet_id);
CREATE INDEX IF NOT EXISTS idx_falsesig_token ON false_signals(token_address);
CREATE INDEX IF NOT EXISTS idx_falsesig_type ON false_signals(signal_type);

-- ============================================================================
-- LEARNING STATISTICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS learning_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  date_bucket TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  
  win_rate DECIMAL(5, 4) DEFAULT 0,
  profit_factor DECIMAL(8, 4) DEFAULT 0, -- avg win / avg loss
  avg_win DECIMAL(20, 10) DEFAULT 0,
  avg_loss DECIMAL(20, 10) DEFAULT 0,
  total_pnl DECIMAL(20, 10) DEFAULT 0,
  
  conviction_multiplier DECIMAL(5, 2) DEFAULT 1.0,
  confidence_threshold DECIMAL(5, 2) DEFAULT 50,
  
  false_signals_detected INTEGER DEFAULT 0,
  anti_patterns_triggered INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stats_wallet ON learning_statistics(wallet_id);
CREATE INDEX IF NOT EXISTS idx_stats_date ON learning_statistics(date_bucket DESC);

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- Learning summary view
CREATE OR REPLACE VIEW learning_summary AS
SELECT
  wallet_id,
  COUNT(*) as total_trades,
  COUNT(CASE WHEN win THEN 1 END) as wins,
  COUNT(CASE WHEN NOT win THEN 1 END) as losses,
  ROUND(CAST(COUNT(CASE WHEN win THEN 1 END) AS NUMERIC) / COUNT(*), 4) as win_rate,
  ROUND(AVG(COALESCE(pnl, 0)), 2) as avg_pnl,
  ROUND(SUM(COALESCE(pnl, 0)), 2) as total_pnl,
  ROUND(AVG(hold_time_seconds), 0) as avg_hold_time
FROM trade_outcomes
GROUP BY wallet_id;

-- Signal effectiveness view
CREATE OR REPLACE VIEW signal_effectiveness AS
SELECT
  signal_type,
  total_trades,
  winning_trades,
  losing_trades,
  ROUND(win_rate * 100, 1) as win_rate_percent,
  ROUND(avg_pnl, 4) as avg_pnl,
  ROUND(avg_hold_time, 0) as avg_hold_time_sec
FROM signal_correlation
WHERE wallet_id IS NOT NULL
ORDER BY win_rate DESC;

-- Anti-pattern impact view
CREATE OR REPLACE VIEW anti_pattern_impact AS
SELECT
  pattern_type,
  COUNT(*) as occurrences,
  SUM(frequency) as total_frequency,
  ROUND(AVG(total_loss), 2) as avg_loss_per_pattern,
  ROUND(SUM(total_loss), 2) as total_loss_impact
FROM anti_patterns
GROUP BY pattern_type
ORDER BY total_loss_impact DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update signal correlation after trade outcome
CREATE OR REPLACE FUNCTION update_signal_correlation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.entry_signals IS NOT NULL THEN
    FOR i IN 1..jsonb_array_length(NEW.entry_signals) LOOP
      INSERT INTO signal_correlation (wallet_id, signal_type, total_trades, winning_trades, losing_trades, win_rate, avg_pnl)
      VALUES (
        NEW.wallet_id,
        NEW.entry_signals ->> (i - 1),
        1,
        CASE WHEN NEW.win THEN 1 ELSE 0 END,
        CASE WHEN NOT NEW.win THEN 1 ELSE 0 END,
        CASE WHEN NEW.win THEN 1.0 ELSE 0.0 END,
        COALESCE(NEW.pnl, 0)
      )
      ON CONFLICT DO UPDATE SET
        total_trades = total_trades + 1,
        winning_trades = winning_trades + CASE WHEN NEW.win THEN 1 ELSE 0 END,
        losing_trades = losing_trades + CASE WHEN NOT NEW.win THEN 1 ELSE 0 END,
        win_rate = (winning_trades + CASE WHEN NEW.win THEN 1 ELSE 0 END)::NUMERIC / (total_trades + 1),
        avg_pnl = (avg_pnl * total_trades + COALESCE(NEW.pnl, 0)) / (total_trades + 1),
        updated_at = NOW();
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to track anti-patterns
CREATE OR REPLACE FUNCTION track_anti_patterns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.false_liquidity_signal THEN
    INSERT INTO anti_patterns (wallet_id, pattern_type, total_loss, description)
    VALUES (NEW.wallet_id, 'false_liquidity', COALESCE(ABS(NEW.pnl), 0), 'False liquidity signal: ' || NEW.token_symbol)
    ON CONFLICT (id) DO UPDATE SET frequency = frequency + 1, total_loss = total_loss + COALESCE(NEW.pnl, 0);
  END IF;
  
  IF NEW.fake_social_signal THEN
    INSERT INTO anti_patterns (wallet_id, pattern_type, total_loss, description)
    VALUES (NEW.wallet_id, 'fake_social', COALESCE(ABS(NEW.pnl), 0), 'Fake social signal: ' || NEW.token_symbol)
    ON CONFLICT (id) DO UPDATE SET frequency = frequency + 1, total_loss = total_loss + COALESCE(NEW.pnl, 0);
  END IF;
  
  IF NEW.whale_exit_detected THEN
    INSERT INTO anti_patterns (wallet_id, pattern_type, total_loss, description)
    VALUES (NEW.wallet_id, 'whale_exit', COALESCE(ABS(NEW.pnl), 0), 'Whale exit detected: ' || NEW.token_symbol)
    ON CONFLICT (id) DO UPDATE SET frequency = frequency + 1, total_loss = total_loss + COALESCE(NEW.pnl, 0);
  END IF;
  
  IF NEW.manipulation_detected THEN
    INSERT INTO anti_patterns (wallet_id, pattern_type, total_loss, description)
    VALUES (NEW.wallet_id, 'manipulation', COALESCE(ABS(NEW.pnl), 0), 'Manipulation detected: ' || NEW.token_symbol)
    ON CONFLICT (id) DO UPDATE SET frequency = frequency + 1, total_loss = total_loss + COALESCE(NEW.pnl, 0);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS trigger_signal_correlation ON trade_outcomes;
CREATE TRIGGER trigger_signal_correlation
AFTER INSERT ON trade_outcomes
FOR EACH ROW
EXECUTE FUNCTION update_signal_correlation();

DROP TRIGGER IF EXISTS trigger_anti_patterns ON trade_outcomes;
CREATE TRIGGER trigger_anti_patterns
AFTER INSERT ON trade_outcomes
FOR EACH ROW
EXECUTE FUNCTION track_anti_patterns();
