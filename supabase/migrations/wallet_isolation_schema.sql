-- File path: supabase/migrations/wallet_isolation_schema.sql
-- Delivery 1: Wallet Isolation Schema Update
-- This migration adds wallet isolation to Catalyst Apex Trader

-- ============================================================================
-- NEW TABLES FOR WALLET ISOLATION
-- ============================================================================

-- Wallets table (core multi-wallet support)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address VARCHAR(255) NOT NULL UNIQUE,
  strategy VARCHAR(50) NOT NULL CHECK (strategy IN ('conservative', 'aggressive', 'experimental')),
  tag VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);
CREATE INDEX IF NOT EXISTS idx_wallets_strategy ON wallets(strategy);
CREATE INDEX IF NOT EXISTS idx_wallets_is_active ON wallets(is_active);

-- Wallet risk profiles (strategy-based risk parameters)
CREATE TABLE IF NOT EXISTS wallet_risk_profiles (
  wallet_id UUID PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  max_position_usd DECIMAL(12, 2) NOT NULL,
  max_total_exposure_usd DECIMAL(12, 2) NOT NULL,
  max_leverage DECIMAL(3, 1) NOT NULL,
  max_positions INTEGER NOT NULL,
  stop_loss_percent DECIMAL(5, 2) NOT NULL,
  take_profit_percent DECIMAL(6, 2) NOT NULL,
  max_daily_loss_usd DECIMAL(12, 2) NOT NULL,
  current_daily_loss_usd DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Wallet analytics (performance tracking)
CREATE TABLE IF NOT EXISTS wallet_analytics (
  wallet_id UUID PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 4) DEFAULT 0,
  avg_win_usd DECIMAL(12, 2) DEFAULT 0,
  avg_loss_usd DECIMAL(12, 2) DEFAULT 0,
  profit_factor DECIMAL(8, 4) DEFAULT 0,
  total_pnl_usd DECIMAL(15, 2) DEFAULT 0,
  total_pnl_percent DECIMAL(8, 4) DEFAULT 0,
  sharpe_ratio DECIMAL(8, 4),
  max_drawdown DECIMAL(8, 4),
  current_streak VARCHAR(10) DEFAULT 'neutral' CHECK (current_streak IN ('wins', 'losses', 'neutral')),
  streak_count INTEGER DEFAULT 0,
  last_trade_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Wallet discoveries (discovered smart money wallets)
CREATE TABLE IF NOT EXISTS wallet_discoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovered_address VARCHAR(255) NOT NULL,
  confidence DECIMAL(3, 2) NOT NULL,
  reason VARCHAR(255),
  linked_to_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_discoveries_address ON wallet_discoveries(discovered_address);
CREATE INDEX IF NOT EXISTS idx_wallet_discoveries_linked ON wallet_discoveries(linked_to_wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_discoveries_confidence ON wallet_discoveries(confidence);

-- ============================================================================
-- UPDATES TO EXISTING INTELLIGENCE TABLES (Add wallet_id column)
-- ============================================================================

-- Update insider_momentum_signals
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'insider_momentum_signals') THEN
    ALTER TABLE insider_momentum_signals
      ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_insider_momentum_wallet ON insider_momentum_signals(wallet_id);
  END IF;
END
$$;

-- Update insider_momentum_analysis
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'insider_momentum_analysis') THEN
    ALTER TABLE insider_momentum_analysis
      ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_insider_analysis_wallet ON insider_momentum_analysis(wallet_id);
  END IF;
END
$$;

-- Update reverse_engineering_patterns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reverse_engineering_patterns') THEN
    ALTER TABLE reverse_engineering_patterns
      ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_reverse_engineering_wallet ON reverse_engineering_patterns(wallet_id);
  END IF;
END
$$;

-- Update bull_run_analysis
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bull_run_analysis') THEN
    ALTER TABLE bull_run_analysis
      ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_bull_run_wallet ON bull_run_analysis(wallet_id);
  END IF;
END
$$;

-- Update market_memory_patterns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'market_memory_patterns') THEN
    ALTER TABLE market_memory_patterns
      ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_market_memory_wallet ON market_memory_patterns(wallet_id);
  END IF;
END
$$;

-- Update pattern_library
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pattern_library') THEN
    ALTER TABLE pattern_library
      ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_pattern_library_wallet ON pattern_library(wallet_id);
  END IF;
END
$$;

-- Update positions (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'positions') THEN
    ALTER TABLE positions
      ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet_id);
  END IF;
END
$$;

-- ============================================================================
-- FUNCTION: Update wallet analytics on trade completion
-- ============================================================================

CREATE OR REPLACE FUNCTION update_wallet_analytics()
RETURNS TRIGGER AS $$
DECLARE
  total_trades_val INTEGER;
  winning_trades_val INTEGER;
  losing_trades_val INTEGER;
  win_rate_val DECIMAL(5,4);
  avg_win_val DECIMAL(12,2);
  avg_loss_val DECIMAL(12,2);
  profit_factor_val DECIMAL(8,4);
  total_pnl_val DECIMAL(15,2);
  total_win_val DECIMAL(15,2);
  total_loss_val DECIMAL(15,2);
  last_trade_time_val TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Calculate aggregates for the wallet (assuming positions table has pnl_usd and created_at columns)
  SELECT
    COUNT(*),
    COUNT(CASE WHEN pnl_usd > 0 THEN 1 END),
    COUNT(CASE WHEN pnl_usd < 0 THEN 1 END),
    CASE WHEN COUNT(*) > 0 THEN COUNT(CASE WHEN pnl_usd > 0 THEN 1 END)::DECIMAL / COUNT(*) ELSE 0 END,
    COALESCE(AVG(CASE WHEN pnl_usd > 0 THEN pnl_usd END), 0),
    COALESCE(AVG(CASE WHEN pnl_usd < 0 THEN pnl_usd END), 0),
    SUM(pnl_usd),
    SUM(CASE WHEN pnl_usd > 0 THEN pnl_usd ELSE 0 END),
    SUM(CASE WHEN pnl_usd < 0 THEN ABS(pnl_usd) ELSE 0 END),
    MAX(created_at)
  INTO total_trades_val, winning_trades_val, losing_trades_val, win_rate_val, avg_win_val, avg_loss_val, total_pnl_val, total_win_val, total_loss_val, last_trade_time_val
  FROM positions
  WHERE wallet_id = NEW.wallet_id;
  
  -- Calculate profit factor
  profit_factor_val := CASE WHEN total_loss_val > 0 THEN total_win_val / total_loss_val ELSE 0 END;
  
  -- Insert or update wallet_analytics
  INSERT INTO wallet_analytics (wallet_id, total_trades, winning_trades, losing_trades, win_rate, avg_win_usd, avg_loss_usd, profit_factor, total_pnl_usd, last_trade_time, updated_at)
  VALUES (NEW.wallet_id, total_trades_val, winning_trades_val, losing_trades_val, win_rate_val, avg_win_val, avg_loss_val, profit_factor_val, total_pnl_val, last_trade_time_val, NOW())
  ON CONFLICT (wallet_id) DO UPDATE SET
    total_trades = EXCLUDED.total_trades,
    winning_trades = EXCLUDED.winning_trades,
    losing_trades = EXCLUDED.losing_trades,
    win_rate = EXCLUDED.win_rate,
    avg_win_usd = EXCLUDED.avg_win_usd,
    avg_loss_usd = EXCLUDED.avg_loss_usd,
    profit_factor = EXCLUDED.profit_factor,
    total_pnl_usd = EXCLUDED.total_pnl_usd,
    last_trade_time = EXCLUDED.last_trade_time,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Update wallet analytics on position changes
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'positions') THEN
    CREATE TRIGGER update_wallet_analytics_trigger
      AFTER INSERT OR UPDATE ON positions
      FOR EACH ROW
      EXECUTE FUNCTION update_wallet_analytics();
  END IF;
END
$$;

-- ============================================================================
-- TRIGGER: Refresh wallet updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW
  EXECUTE FUNCTION refresh_wallet_updated_at();

CREATE TRIGGER wallet_risk_profile_updated_at
  BEFORE UPDATE ON wallet_risk_profiles
  FOR EACH ROW
  EXECUTE FUNCTION refresh_wallet_updated_at();

CREATE TRIGGER wallet_analytics_updated_at
  BEFORE UPDATE ON wallet_analytics
  FOR EACH ROW
  EXECUTE FUNCTION refresh_wallet_updated_at();

-- ============================================================================
-- SEED DATA (Optional: Remove in production)
-- ============================================================================

-- Uncomment to create default wallets for testing:
-- INSERT INTO wallets (address, strategy, tag, is_active) VALUES
--   ('default_wallet_a', 'conservative', 'default', true),
--   ('default_wallet_b', 'aggressive', 'default', true),
--   ('default_wallet_c', 'experimental', 'default', true)
-- ON CONFLICT (address) DO NOTHING;

-- ============================================================================
-- GRANTS (Update these if using RLS)
-- ============================================================================

-- If using Row Level Security (RLS), add appropriate policies here
-- GRANT ALL ON wallets TO authenticated;
-- GRANT ALL ON wallet_risk_profiles TO authenticated;
-- GRANT ALL ON wallet_analytics TO authenticated;
-- GRANT ALL ON wallet_discoveries TO authenticated;