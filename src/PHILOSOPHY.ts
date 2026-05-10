/**
 * APEX TRADER PHILOSOPHY LAYER
 * 
 * This is the doctrine that shapes every system decision
 * If a module doesn't align with this, it's removed
 * 
 * From Integration 1: "Apex needs a philosophy layer"
 * This is it.
 */

export const APEX_PHILOSOPHY = {
  // Core beliefs
  coreBeliefs: [
    'Attention precedes price',
    'Narratives matter more than indicators',
    'Abnormality creates asymmetry',
    'Speed beats perfection',
    'Survival > prediction',
    'Conviction is behavioral',
    'Crowded trades lose edge',
    'Momentum is psychological',
    'Liquidity has intent',
    'Missed runners teach more than winners',
  ],

  // Signal generation doctrine
  signalGeneration: {
    principle: 'Signals detect BEHAVIOR, not price patterns',
    focus: 'wallet clustering, holder patterns, liquidity movement, social psychology',
    avoid: 'technical indicators, RSI, MACD, moving averages',
    truth: 'On-chain behavior reveals intent before price moves',
  },

  // Entry doctrine
  entry: {
    principle: 'Asymmetry > probability',
    riskRewardMinimum: 2,
    example: '10% win prob with 200x upside beats 80% win prob with 1.5x upside',
    bestEntry: 'Pre-momentum accumulation phase (ignition)',
    worstEntry: 'After public narrative is hot',
  },

  // Risk doctrine
  risk: {
    principle: 'Survival first, profits second',
    maxDrawdown: '25%',
    maxExposurePercent: '80%',
    maxSinglePosition: '30%',
    truth: 'Position size determines emotion, not conviction',
  },

  // Exit doctrine
  exit: {
    principle: 'Let winners run, cut losers fast',
    profitTaking: 'Scaled (25%, 35%, 25%, 15% at levels)',
    stopPlacement: 'Based on pattern failure time',
    truth: 'Most people exit winners too early, losses too late',
  },

  // Timing doctrine
  timing: {
    principle: 'Market regime determines rules',
    mania: 'Loosen filters, accept lower conviction, take profits faster',
    chop: 'Tighten filters, only best signals, reduce position size',
    trending: 'Medium tension, hold winners longer',
    dump: 'Avoid trading, wait for dry powder opportunities',
    sleeping: 'Conservative, wait for narrative shift',
  },

  // Intelligence doctrine
  intelligence: {
    principle: 'Multiple systems voting > single system deciding',
    systems: [
      'Dormant wallet accumulation',
      'Whale clustering detection',
      'Narrative momentum',
      'Bullrun phase detection',
      'Insider/insider behavior',
      'Abnormality scoring',
      'Liquidity analysis',
      'Social velocity',
      'Holder behavior',
    ],
    finalDecision:
      'Consensus between 3+ independent systems with regime weighting',
  },

  // Learning doctrine
  learning: {
    principle: 'Every trade is a learning event',
    track: [
      'Why we entered',
      'Why we exited',
      'What worked',
      'What failed',
      'How this differs from similar trades',
      'Personal edge patterns',
    ],
    improve: 'Continuous adaptation based on historical edge',
  },

  // Execution doctrine
  execution: {
    principle: 'Hardcoded systems, not AI',
    ai: 'Enhances understanding, never makes decisions',
    deterministic: 'All critical paths are fully determined, no randomness',
    predictable: 'System behavior is testable and reproducible',
  },

  // Psychological doctrine
  psychology: {
    principle: 'The market is emotional, not rational',
    observations: [
      'Retail buys after >3% pump (FOMO)',
      'Holders become emotional after 50% loss (surrender)',
      'Influencers are paid to pump (follow money)',
      'Whales are buying 48 hours before announcements',
      'Coordinated behavior is visible in clustering',
    ],
  },

  // Game theory doctrine
  gameTheory: {
    principle: 'Every trade is PvP, not vs market',
    otherPlayers: [
      'Bundlers (pre-loaded with 20-40% supply)',
      'Snipers (MEV bots at block level)',
      'Copy traders (watching smart wallets)',
      'Influencers (being paid to hype)',
      'Insiders (information advantage)',
      'Retail (the exit liquidity)',
    ],
    positioning:
      'We position ahead of recognition, exit before crowding',
  },

  // The moat
  competitiveAdavantage: {
    notTechnical: 'Everyone has access to RSI and MACD',
    notSpeed: 'Snipers are faster',
    notCapital: 'Whales have more money',
    isWhat: [
      'Understanding pre-momentum psychology',
      'Detecting abnormality before crowds',
      'Asymmetric thinking (high upside, low downside)',
      'Regime-specific behavior adaptation',
      'Personal edge recognition and amplification',
    ],
  },

  // The truth about this market
  marketTruth: {
    observation1:
      'By the time you see a signal, smart money has 48+ hours of positioning',
    observation2:
      'Most retail losses come from FOMO buying hot charts',
    observation3:
      'Winners move BEFORE the narrative becomes public',
    observation4: 'Liquidity spikes precede major moves (supply prep)',
    implication:
      'We trade behavior change, not price change. Speed of accumulation, not size of move.',
  },
};

/**
 * ALIGNMENT CHECK
 * Every module must answer these questions:
 */
export const ALIGNMENT_QUESTIONS = [
  '❓ Does this detect BEHAVIOR before price moves?',
  '❓ Is this asymmetric (more upside than downside)?',
  '❓ Does this help with SURVIVAL not just profits?',
  '❓ Is this hardcoded or does it enhance hardcoded?',
  '❓ Does this work in EVERY regime or is it adaptive?',
  '❓ Would this be profitable if we did it MANUALLY?',
  '❓ Does this build a MOAT or just follow everyone else?',
  '❓ Is this based on GAME THEORY or wishful thinking?',
];

/**
 * CONFIG THAT IMPLEMENTS PHILOSOPHY
 */
export const APEX_CONFIG = {
  signal: {
    minConvictionBase: 65,
    riskRewardMinimum: 2,
    asymmetryRequired: true,
    adaptiveFiltering: true,
  },

  risk: {
    maxDrawdown: 0.25,
    maxPortfolioExposure: 0.8,
    maxSinglePosition: 0.3,
    maxConcurrentPositions: 5,
  },

  regime: {
    updateIntervalMs: 300000, // 5 minutes
    confirmationThreshold: 0.6, // 60% confidence to switch
  },

  ai: {
    dailyTokenBudget: 50000,
    monthlyTokenBudget: 1500000,
    minConvictionForAI: 75,
    minSignalScoreForAI: 70,
  },

  learning: {
    trackWindowMs: 24 * 60 * 60 * 1000, // 24 hours
    minTradesForPattern: 3,
    minTradesForRegimePattern: 10,
  },

  thresholds: {
    minConvictionBaseline: 65,
    minROITarget: 10,
    maxHoldTimeBaseline: 60 * 60 * 1000, // 1 hour
    refreshInterval: 5 * 60 * 1000, // 5 minutes
  },
};

/**
 * DOCTRINE VALIDATION
 * Make sure modules follow the philosophy
 */
export function validatePhilosophy(systemDescription: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for alignment
  if (
    !systemDescription.includes('behavior') &&
    !systemDescription.includes('accumulation') &&
    !systemDescription.includes('asymmetry')
  ) {
    issues.push('System does not mention behavior detection, accumulation, or asymmetry');
  }

  if (systemDescription.includes('RSI') || systemDescription.includes('MACD') || systemDescription.includes('moving average')) {
    issues.push('System uses technical indicators (forbidden)');
  }

  if (!systemDescription.includes('hardcoded') && !systemDescription.includes('deterministic')) {
    issues.push('System is not hardcoded/deterministic (may use randomness)');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

console.log(`
╔════════════════════════════════════════════════════════════╗
║  APEX TRADER PHILOSOPHY INITIALIZED                       ║
║  Core: Behavior > Price | Asymmetry > Probability          ║
║  Speed > Perfection | Survival > Prediction                ║
╚════════════════════════════════════════════════════════════╝
`);