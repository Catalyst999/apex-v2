// File path: src/services/gateway/pre-filter-rules.ts
/**
 * PRE-FILTER RULES
 * Hardcoded deterministic checks (ZERO AI)
 * Reduces AI load by 70-80% by filtering garbage before analysis
 */

export interface PreFilterCheckResult {
  passed: boolean;
  reason: string;
  severity: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL';
}

export interface PreFilterConfig {
  // Liquidity checks
  minLiquidityUSD: number;
  minLiquidityDepthUSD: number;

  // Holder checks
  minHolderCount: number;
  maxHolderConcentration: number; // % for top holder

  // Volume checks
  minVolumeM5USD: number;
  minVolumeH1USD: number;

  // Age checks
  minTokenAgeSeconds: number; // reject brand new tokens

  // Security checks
  enableDeployerCheck: boolean;
  enableBundleDetection: boolean;

  // Blacklist
  blacklistedDeployers: string[];
  blacklistedTokens: string[];

  // Thresholds
  abnormalityThreshold: number; // what counts as abnormal
}

export const DEFAULT_CONFIG: PreFilterConfig = {
  minLiquidityUSD: 5000,
  minLiquidityDepthUSD: 2000,
  minHolderCount: 50,
  maxHolderConcentration: 0.35, // top holder can't be >35%
  minVolumeM5USD: 500,
  minVolumeH1USD: 2000,
  minTokenAgeSeconds: 300, // 5 minutes old minimum
  enableDeployerCheck: true,
  enableBundleDetection: true,
  blacklistedDeployers: [],
  blacklistedTokens: [],
  abnormalityThreshold: 0.65,
};

// ─── HARDCODED PRE-FILTER CHECKS ────────────────────────────────────────

export class PreFilterRules {
  private config: PreFilterConfig;

  constructor(config: Partial<PreFilterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * CHECK 1: Liquidity Threshold
   * Reject tokens with insufficient liquidity
   */
  checkLiquidity(liquidityUSD: number, depthUSD: number): PreFilterCheckResult {
    if (liquidityUSD < this.config.minLiquidityUSD) {
      return {
        passed: false,
        reason: `Liquidity too low: $${liquidityUSD} < $${this.config.minLiquidityUSD}`,
        severity: 'HARD_FAIL',
      };
    }

    if (depthUSD < this.config.minLiquidityDepthUSD) {
      return {
        passed: false,
        reason: `Depth insufficient: $${depthUSD} < $${this.config.minLiquidityDepthUSD}`,
        severity: 'HARD_FAIL',
      };
    }

    return {
      passed: true,
      reason: `Liquidity OK: $${liquidityUSD}`,
      severity: 'PASS',
    };
  }

  /**
   * CHECK 2: Holder Distribution
   * Reject tokens with whale concentration
   */
  checkHolderDistribution(
    holderCount: number,
    topHolderPercent: number
  ): PreFilterCheckResult {
    if (holderCount < this.config.minHolderCount) {
      return {
        passed: false,
        reason: `Too few holders: ${holderCount} < ${this.config.minHolderCount}`,
        severity: 'HARD_FAIL',
      };
    }

    if (topHolderPercent > this.config.maxHolderConcentration * 100) {
      return {
        passed: false,
        reason: `Whale concentration: ${topHolderPercent.toFixed(1)}% > ${
          this.config.maxHolderConcentration * 100
        }%`,
        severity: 'HARD_FAIL',
      };
    }

    return {
      passed: true,
      reason: `Holders OK: ${holderCount}, top holder ${topHolderPercent.toFixed(1)}%`,
      severity: 'PASS',
    };
  }

  /**
   * CHECK 3: Volume Acceleration
   * Reject tokens with suspiciously high volume
   */
  checkVolumeAcceleration(
    volumeM5USD: number,
    volumeH1USD: number,
    volumeM30USD: number
  ): PreFilterCheckResult {
    if (volumeM5USD < this.config.minVolumeM5USD) {
      return {
        passed: false,
        reason: `M5 volume too low: $${volumeM5USD} < $${this.config.minVolumeM5USD}`,
        severity: 'SOFT_FAIL',
      };
    }

    if (volumeH1USD < this.config.minVolumeH1USD) {
      return {
        passed: false,
        reason: `H1 volume too low: $${volumeH1USD} < $${this.config.minVolumeH1USD}`,
        severity: 'SOFT_FAIL',
      };
    }

    // Check for pump pattern (M5 >> H1)
    const volumeRatio = volumeM5USD / Math.max(volumeH1USD, 1);
    if (volumeRatio > 2.5) {
      return {
        passed: false,
        reason: `Suspicious volume spike: M5/H1 ratio = ${volumeRatio.toFixed(2)}`,
        severity: 'SOFT_FAIL',
      };
    }

    return {
      passed: true,
      reason: `Volume OK: M5 $${volumeM5USD}, H1 $${volumeH1USD}`,
      severity: 'PASS',
    };
  }

  /**
   * CHECK 4: Token Age
   * Reject brand new tokens (too risky)
   */
  checkTokenAge(createdAtTimestamp: number): PreFilterCheckResult {
    const ageSeconds = Math.floor(Date.now() / 1000) - createdAtTimestamp;

    if (ageSeconds < this.config.minTokenAgeSeconds) {
      return {
        passed: false,
        reason: `Token too new: ${Math.floor(ageSeconds / 60)} min < ${Math.floor(
          this.config.minTokenAgeSeconds / 60
        )} min`,
        severity: 'HARD_FAIL',
      };
    }

    return {
      passed: true,
      reason: `Token age OK: ${Math.floor(ageSeconds / 60)} minutes`,
      severity: 'PASS',
    };
  }

  /**
   * CHECK 5: Deployer Blacklist
   * Reject known scammer/rug deployers
   */
  checkDeployerReputation(deployerAddress: string): PreFilterCheckResult {
    if (!this.config.enableDeployerCheck) {
      return {
        passed: true,
        reason: 'Deployer check disabled',
        severity: 'PASS',
      };
    }

    if (this.config.blacklistedDeployers.includes(deployerAddress.toLowerCase())) {
      return {
        passed: false,
        reason: `Deployer blacklisted: ${deployerAddress}`,
        severity: 'HARD_FAIL',
      };
    }

    return {
      passed: true,
      reason: `Deployer OK`,
      severity: 'PASS',
    };
  }

  /**
   * CHECK 6: Token Blacklist
   * Reject known rug/scam tokens
   */
  checkTokenBlacklist(tokenAddress: string): PreFilterCheckResult {
    if (this.config.blacklistedTokens.includes(tokenAddress.toLowerCase())) {
      return {
        passed: false,
        reason: `Token blacklisted: ${tokenAddress}`,
        severity: 'HARD_FAIL',
      };
    }

    return {
      passed: true,
      reason: 'Token not blacklisted',
      severity: 'PASS',
    };
  }

  /**
   * CHECK 7: Buy/Sell Ratio
   * Reject tokens with unnatural ratios (pump schemes)
   */
  checkBuySellRatio(buysM5: number, sellsM5: number): PreFilterCheckResult {
    const totalTxns = buysM5 + sellsM5;
    if (totalTxns === 0) {
      return {
        passed: false,
        reason: 'No transactions in M5',
        severity: 'SOFT_FAIL',
      };
    }

    const buyPercent = (buysM5 / totalTxns) * 100;

    // Too many buys = pump scheme or fake volume
    if (buyPercent > 95) {
      return {
        passed: false,
        reason: `Unnatural buy ratio: ${buyPercent.toFixed(1)}% (likely pump)`,
        severity: 'SOFT_FAIL',
      };
    }

    // Too many sells = dump or panic
    if (buyPercent < 5) {
      return {
        passed: false,
        reason: `Unnatural sell ratio: ${(100 - buyPercent).toFixed(1)}% sells`,
        severity: 'SOFT_FAIL',
      };
    }

    return {
      passed: true,
      reason: `Buy/sell ratio OK: ${buyPercent.toFixed(1)}% buys`,
      severity: 'PASS',
    };
  }

  /**
   * CHECK 8: Price Stability
   * Reject tokens with extreme volatility
   */
  checkPriceStability(priceChangePercent: number): PreFilterCheckResult {
    const absChange = Math.abs(priceChangePercent);

    // More than 500% change in M5 = likely manipulation
    if (absChange > 500) {
      return {
        passed: false,
        reason: `Extreme volatility: ${priceChangePercent.toFixed(1)}% M5 change`,
        severity: 'SOFT_FAIL',
      };
    }

    return {
      passed: true,
      reason: `Price stability OK: ${priceChangePercent.toFixed(1)}% M5`,
      severity: 'PASS',
    };
  }

  /**
   * CHECK 9: Social Validation
   * Reject if zero social signals (need some confirmation)
   */
  checkSocialPresence(mentionCount: number, engagementScore: number): PreFilterCheckResult {
    if (mentionCount === 0 && engagementScore === 0) {
      return {
        passed: false,
        reason: 'Zero social signals (isolated pump)',
        severity: 'SOFT_FAIL',
      };
    }

    return {
      passed: true,
      reason: `Social signals present: ${mentionCount} mentions, ${engagementScore} engagement`,
      severity: 'PASS',
    };
  }

  /**
   * RUN ALL CHECKS
   */
  runAllChecks(token: any): {
    passed: boolean;
    checks: Array<{ name: string; result: PreFilterCheckResult }>;
    failureCount: number;
    reasonsSummary: string;
  } {
    const checks: Array<{ name: string; result: PreFilterCheckResult }> = [];
    let failureCount = 0;

    // Run all checks
    checks.push({
      name: 'Liquidity',
      result: this.checkLiquidity(token.liquidity?.usd || 0, token.liquidity?.depth || 0),
    });

    checks.push({
      name: 'Holders',
      result: this.checkHolderDistribution(token.holders?.count || 0, token.holders?.topPercent || 0),
    });

    checks.push({
      name: 'Volume',
      result: this.checkVolumeAcceleration(
        token.volume?.m5 || 0,
        token.volume?.h1 || 0,
        token.volume?.m30 || 0
      ),
    });

    checks.push({
      name: 'Age',
      result: this.checkTokenAge(token.createdAt || Math.floor(Date.now() / 1000)),
    });

    checks.push({
      name: 'Deployer',
      result: this.checkDeployerReputation(token.deployer || ''),
    });

    checks.push({
      name: 'Blacklist',
      result: this.checkTokenBlacklist(token.address || ''),
    });

    checks.push({
      name: 'BuySellRatio',
      result: this.checkBuySellRatio(token.buys?.m5 || 0, token.sells?.m5 || 0),
    });

    checks.push({
      name: 'Price',
      result: this.checkPriceStability(token.priceChange?.m5 || 0),
    });

    checks.push({
      name: 'Social',
      result: this.checkSocialPresence(token.social?.mentions || 0, token.social?.engagement || 0),
    });

    // Count failures
    for (const check of checks) {
      if (!check.result.passed) {
        failureCount++;
      }
    }

    // HARD_FAIL = reject immediately
    const hardFails = checks.filter((c) => c.result.severity === 'HARD_FAIL' && !c.result.passed);
    const passed = hardFails.length === 0 && failureCount <= 2; // allow 2 soft fails

    const reasonsSummary = checks
      .filter((c) => !c.result.passed)
      .map((c) => `${c.name}: ${c.result.reason}`)
      .join(' | ');

    return {
      passed,
      checks,
      failureCount,
      reasonsSummary,
    };
  }
}

export const preFilterRules = new PreFilterRules();