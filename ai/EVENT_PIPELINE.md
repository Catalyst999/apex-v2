# EVENT PIPELINE

# CORE FLOW

New Token
→ Signal Gateway
→ Liquidity Analysis
→ Wallet Analysis
→ Social Analysis
→ Narrative Analysis
→ Regime Context
→ Conviction Engine
→ Risk Engine
→ Trade Decision
→ Execution
→ Outcome Logging
→ Memory Update

---

# EVENT TYPES

## Token Events
- token_detected
- liquidity_spike
- volume_acceleration
- breakout_detected

## Wallet Events
- whale_entry
- insider_cluster
- dormant_wallet_active

## Social Events
- narrative_expansion
- influencer_rotation
- social_velocity_spike

## Risk Events
- rug_risk
- whale_exit
- liquidity_collapse

---

# GOAL

Modules should communicate through signals/events instead of direct dependency chains.