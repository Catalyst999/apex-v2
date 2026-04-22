// src/services/social/x-scanner.ts
// Catalyst Apex Trader v2.1 — X (Twitter) Social Signal Scanner
//
// Uses X API free tier to detect social velocity around tokens.
// Free tier: 500k tweets/month read, search endpoint available.
//
// What we measure:
// - Tweet count about token in last hour
// - Engagement velocity (likes + retweets per tweet)
// - Whether credible accounts are posting
// - Narrative momentum (multiple people posting independently)

import axios from "axios";
import { X_API } from "../../core/config";

export interface XSignal {
  tokenAddress:     string;
  tweetCount:       number;    // tweets in last hour
  engagementScore:  number;    // avg likes + retweets per tweet
  velocityScore:    number;    // 0-100 composite social score
  isOrganic:        boolean;   // true = multiple independent posters
  topTweet:         string;    // text of most engaged tweet
  narrativeWords:   string[];  // most common words in tweets
  found:            boolean;
}

// ─── X API client ─────────────────────────────────────────────────────────────

async function searchTweets(query: string, maxResults = 20): Promise<any[]> {
  try {
    if (!X_API.bearerToken) return [];

    const res = await axios.get(
      "https://api.twitter.com/2/tweets/search/recent",
      {
        headers: {
          Authorization: `Bearer ${X_API.bearerToken}`,
        },
        params: {
          query:        `${query} -is:retweet lang:en`,
          max_results:  Math.min(maxResults, 100),
          "tweet.fields": "public_metrics,created_at,author_id",
          expansions:   "author_id",
        },
        timeout: 10000,
      }
    );

    return res.data?.data ?? [];
  } catch (err: any) {
    // Rate limit or auth error — fail silently, don't block trade pipeline
    if (err.response?.status === 429) {
      console.warn("⚠️  X API rate limit hit — skipping social scan");
    } else if (err.response?.status === 401) {
      console.warn("⚠️  X API auth error — check X_BEARER_TOKEN");
    }
    return [];
  }
}

// ─── Social velocity analyzer ─────────────────────────────────────────────────

export async function scanXForToken(
  tokenAddress: string,
  tokenName:    string,
  tokenSymbol:  string,
): Promise<XSignal> {
  const empty: XSignal = {
    tokenAddress,
    tweetCount:      0,
    engagementScore: 0,
    velocityScore:   0,
    isOrganic:       false,
    topTweet:        "",
    narrativeWords:  [],
    found:           false,
  };

  if (!X_API.bearerToken) return empty;

  try {
    // Search by contract address first (most specific)
    let tweets = await searchTweets(tokenAddress, 20);

    // If no results by address, search by ticker
    if (tweets.length === 0 && tokenSymbol.length <= 6) {
      tweets = await searchTweets(`$${tokenSymbol}`, 20);
    }

    // If still nothing, search by name
    if (tweets.length === 0 && tokenName.length >= 3) {
      tweets = await searchTweets(`"${tokenName}" solana`, 10);
    }

    if (tweets.length === 0) return empty;

    // ── Analyze tweets ────────────────────────────────────────────────────────

    // Count unique authors
    const authors = new Set(tweets.map((t: any) => t.author_id));

    // Calculate engagement
    let totalEngagement = 0;
    let topEngagement   = 0;
    let topTweet        = "";

    for (const tweet of tweets) {
      const metrics = tweet.public_metrics ?? {};
      const engagement = (metrics.like_count ?? 0) +
                         (metrics.retweet_count ?? 0) +
                         (metrics.reply_count ?? 0);
      totalEngagement += engagement;

      if (engagement > topEngagement) {
        topEngagement = engagement;
        topTweet      = tweet.text ?? "";
      }
    }

    const avgEngagement = tweets.length > 0 ? totalEngagement / tweets.length : 0;

    // Extract narrative words (most common meaningful words)
    const wordFreq = new Map<string, number>();
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "to", "of", "in",
      "and", "or", "but", "for", "on", "at", "by", "with", "this", "that",
      "it", "its", "be", "has", "have", "had", "will", "would", "could",
      "just", "get", "got", "going", "now", "new", "one", "can", "not",
    ]);

    for (const tweet of tweets) {
      const words = (tweet.text ?? "")
        .toLowerCase()
        .split(/\s+/)
        .map((w: string) => w.replace(/[^a-z0-9$]/g, ""))
        .filter((w: string) => w.length >= 3 && !stopWords.has(w));

      for (const word of words) {
        wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
      }
    }

    const narrativeWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    // ── Organic check ──────────────────────────────────────────────────────
    // Organic = multiple different authors, not all from same account
    const isOrganic = authors.size >= 3 &&
                      authors.size / tweets.length >= 0.5;

    // ── Velocity score (0-100) ────────────────────────────────────────────
    // Combines tweet count, engagement, and organic diversity
    const tweetScore      = Math.min(40, tweets.length * 2);
    const engagementScore = Math.min(40, avgEngagement * 2);
    const organicScore    = isOrganic ? 20 : 0;
    const velocityScore   = Math.round(tweetScore + engagementScore + organicScore);

    console.log(`   🐦 X: ${tweets.length} tweets, ${authors.size} authors, velocity ${velocityScore}/100`);

    return {
      tokenAddress,
      tweetCount:      tweets.length,
      engagementScore: Math.round(avgEngagement),
      velocityScore,
      isOrganic,
      topTweet:        topTweet.slice(0, 200),
      narrativeWords,
      found:           true,
    };

  } catch (err: any) {
    console.error("❌ X scan error:", err.message);
    return empty;
  }
}

// ─── Narrative velocity scanner ───────────────────────────────────────────────
// Scans X for a narrative keyword to detect forming metas
// Used by crime pump detector to find coordinated community pushes

export async function scanNarrativeVelocity(keyword: string): Promise<{
  tweetCount:    number;
  velocity:      number;
  isForming:     boolean;
  topEngagement: number;
}> {
  try {
    const tweets = await searchTweets(`${keyword} solana memecoin`, 50);
    if (tweets.length === 0) return { tweetCount: 0, velocity: 0, isForming: false, topEngagement: 0 };

    const totalEngagement = tweets.reduce((sum: number, t: any) => {
      const m = t.public_metrics ?? {};
      return sum + (m.like_count ?? 0) + (m.retweet_count ?? 0);
    }, 0);

    const topEngagement = Math.max(...tweets.map((t: any) => {
      const m = t.public_metrics ?? {};
      return (m.like_count ?? 0) + (m.retweet_count ?? 0);
    }));

    const velocity   = Math.min(100, tweets.length * 2 + topEngagement);
    const isForming  = tweets.length >= 5 && topEngagement >= 10;

    return { tweetCount: tweets.length, velocity, isForming, topEngagement };
  } catch {
    return { tweetCount: 0, velocity: 0, isForming: false, topEngagement: 0 };
  }
}