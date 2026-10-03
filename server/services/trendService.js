import { XMLParser } from 'fast-xml-parser';
import { CONFIG } from '../config.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

class TrendService {
  constructor() {
    this.cache = {
      items: [],
      sources: {},
      lastFetchTime: null
    };
  }

  // Calculate Forge relevance based on creator appeal, keyword novelty, and engagement
  calculateForgeRelevance(title, snippet = '', metricCount = 0) {
    const text = `${title} ${snippet}`.toLowerCase();
    let score = 50;

    const viralHooks = [
      'breakthrough', 'ai', 'model', 'quantum', 'secret', 'launches', 'unveils',
      'crisis', 'shock', 'future', 'first time', 'billion', 'open source', 'robot',
      'nvidia', 'apple', 'google', 'meta', 'space', 'discovery', 'zero-day', 'leak'
    ];

    for (const hook of viralHooks) {
      if (text.includes(hook)) score += 6;
    }

    if (metricCount > 0) {
      score += Math.min(20, Math.floor(metricCount / 20));
    }

    // Keep score bounded between 45 and 99
    return Math.min(98, Math.max(45, score));
  }

  generateAngle(title, category) {
    const t = title.toLowerCase();
    if (t.includes('ai') || t.includes('llm') || t.includes('model') || t.includes('gpt')) {
      return 'The hidden creator workflow and what this means for your everyday efficiency.';
    }
    if (t.includes('security') || t.includes('hack') || t.includes('breach') || t.includes('bug')) {
      return 'Why this critical vulnerability matters to millions of users right now.';
    }
    if (t.includes('apple') || t.includes('google') || t.includes('meta') || t.includes('open')) {
      return 'The tectonic platform shift and who wins versus who gets displaced.';
    }
    if (category === 'Tech & Dev') {
      return 'Why developers and tech creators are actively arguing over this decision.';
    }
    return 'The core conflict behind the headline and the real-world takeaway in 30 seconds.';
  }

  async fetchHackerNews() {
    const sourceInfo = {
      id: 'hackernews',
      name: 'Hacker News (Algolia API)',
      status: 'pending',
      fetchedAt: new Date().toISOString(),
      itemCount: 0
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HN API returned HTTP ${res.status}`);
      const data = await res.json();
      const hits = data.hits || [];

      const items = hits.slice(0, 15).map((hit, index) => {
        const points = hit.points || 0;
        const comments = hit.num_comments || 0;
        const forgeRelevance = this.calculateForgeRelevance(hit.title, '', points + comments);

        return {
          id: `hn-${hit.objectID || index}`,
          title: hit.title || 'Untitled Tech Story',
          sourceName: 'Hacker News',
          sourceId: 'hackernews',
          sourceType: 'Public API',
          sourceUrl: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          retrievalTime: sourceInfo.fetchedAt,
          category: 'Tech & Dev',
          summary: `Discussion with ${points} points and ${comments} comments on Hacker News.`,
          videoAngle: this.generateAngle(hit.title, 'Tech & Dev'),
          metrics: {
            points,
            comments
          },
          forgeRelevance,
          isLive: true,
          isDemo: false
        };
      });

      sourceInfo.status = 'active';
      sourceInfo.itemCount = items.length;
      return { sourceInfo, items };
    } catch (err) {
      sourceInfo.status = 'error';
      sourceInfo.error = err.message;
      return { sourceInfo, items: [] };
    }
  }

  async fetchBBCTech() {
    const sourceInfo = {
      id: 'bbc_tech',
      name: 'BBC News Technology RSS',
      status: 'pending',
      fetchedAt: new Date().toISOString(),
      itemCount: 0
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('https://feeds.bbci.co.uk/news/technology/rss.xml', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`BBC RSS returned HTTP ${res.status}`);
      const xmlText = await res.text();
      const parsed = xmlParser.parse(xmlText);
      const rawItems = parsed?.rss?.channel?.item || [];
      const list = Array.isArray(rawItems) ? rawItems : [rawItems];

      const items = list.slice(0, 10).map((item, index) => {
        const title = item.title || 'BBC Tech Update';
        const description = item.description || '';
        const link = item.link || 'https://www.bbc.com/news/technology';
        const forgeRelevance = this.calculateForgeRelevance(title, description, 50);

        return {
          id: `bbc-${index}-${Date.now()}`,
          title,
          sourceName: 'BBC News Technology',
          sourceId: 'bbc_tech',
          sourceType: 'Public RSS Feed',
          sourceUrl: link,
          retrievalTime: sourceInfo.fetchedAt,
          category: 'World Tech',
          summary: description.replace(/<[^>]*>?/gm, '').trim() || 'BBC Technology dispatch.',
          videoAngle: this.generateAngle(title, 'World Tech'),
          metrics: null, // Truthful: RSS does not provide upvotes
          forgeRelevance,
          isLive: true,
          isDemo: false
        };
      });

      sourceInfo.status = 'active';
      sourceInfo.itemCount = items.length;
      return { sourceInfo, items };
    } catch (err) {
      sourceInfo.status = 'error';
      sourceInfo.error = err.message;
      return { sourceInfo, items: [] };
    }
  }

  async fetchGDELT() {
    const sourceInfo = {
      id: 'gdelt',
      name: 'GDELT Global News Feed',
      status: 'pending',
      fetchedAt: new Date().toISOString(),
      itemCount: 0
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        'https://api.gdeltproject.org/api/v2/doc/doc?query=technology&mode=artlist&format=json&maxrecords=10',
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error('GDELT rate-limited or non-JSON response');
      }

      const articles = data.articles || [];
      const items = articles.slice(0, 8).map((art, index) => {
        const title = art.title || 'Global News Event';
        const forgeRelevance = this.calculateForgeRelevance(title, art.domain || '', 30);

        return {
          id: `gdelt-${index}-${Date.now()}`,
          title,
          sourceName: art.domain ? `GDELT (${art.domain})` : 'GDELT Project',
          sourceId: 'gdelt',
          sourceType: 'Public Global News API',
          sourceUrl: art.url || 'https://www.gdeltproject.org',
          retrievalTime: sourceInfo.fetchedAt,
          category: 'Global Events',
          summary: `Documented by GDELT news tracking from ${art.domain || 'international press'}.`,
          videoAngle: this.generateAngle(title, 'Global Events'),
          metrics: null,
          forgeRelevance,
          isLive: true,
          isDemo: false
        };
      });

      sourceInfo.status = 'active';
      sourceInfo.itemCount = items.length;
      return { sourceInfo, items };
    } catch (err) {
      sourceInfo.status = 'rate_limited_or_offline';
      sourceInfo.error = err.message;
      return { sourceInfo, items: [] };
    }
  }

  getDemoItems() {
    const timestamp = new Date().toISOString();
    return [
      {
        id: 'demo-1',
        title: 'Open Source AI Models Surpass Closed Frontiers in Coding Benchmarks',
        sourceName: 'Sample Trend (Offline Fallback)',
        sourceId: 'demo_source',
        sourceType: 'Editorial Benchmark',
        sourceUrl: 'https://huggingface.co',
        retrievalTime: timestamp,
        category: 'Artificial Intelligence',
        summary: 'A new wave of local quantized weights allows developer laptops to match commercial cloud models.',
        videoAngle: 'Why running AI locally on your device is becoming the ultimate superpower for privacy and independence.',
        metrics: { points: 482, comments: 194 },
        forgeRelevance: 96,
        isLive: false,
        isDemo: true
      },
      {
        id: 'demo-2',
        title: 'Vertical Video Algorithms Prioritize Hook Density Over Watch Time',
        sourceName: 'Sample Trend (Offline Fallback)',
        sourceId: 'demo_source',
        sourceType: 'Creator Economy Analysis',
        sourceUrl: 'https://qoneqt.com',
        retrievalTime: timestamp,
        category: 'Social Video',
        summary: 'Recent algorithm adjustments on major video platforms reward videos with dynamic scene cuts every 4 seconds.',
        videoAngle: 'The exact 3-second kinetic typography formula that keeps viewers glued past the first swipe.',
        metrics: { points: 310, comments: 88 },
        forgeRelevance: 92,
        isLive: false,
        isDemo: true
      }
    ];
  }

  async getAllTrends(forceRefresh = false) {
    const now = Date.now();
    // Cache for 2 minutes unless forced
    if (!forceRefresh && this.cache.items.length > 0 && this.cache.lastFetchTime && now - new Date(this.cache.lastFetchTime).getTime() < 120000) {
      return {
        items: this.cache.items,
        sources: this.cache.sources,
        cached: true,
        lastFetchTime: this.cache.lastFetchTime
      };
    }

    console.log('[TrendService] Refreshing live sources in parallel...');
    const [hnResult, bbcResult, gdeltResult] = await Promise.all([
      this.fetchHackerNews(),
      this.fetchBBCTech(),
      this.fetchGDELT()
    ]);

    const sources = {
      hackernews: hnResult.sourceInfo,
      bbc_tech: bbcResult.sourceInfo,
      gdelt: gdeltResult.sourceInfo,
      reddit: {
        id: 'reddit',
        name: 'Reddit API',
        status: 'requires_credentials',
        note: 'OAuth credentials required by Reddit terms. Marked unavailable in Qoneqt Shots.'
      },
      x_twitter: {
        id: 'x_twitter',
        name: 'X (Twitter) API',
        status: 'requires_credentials',
        note: 'Paid developer plan required. Marked unavailable in Qoneqt Shots.'
      }
    };

    let allItems = [...hnResult.items, ...bbcResult.items, ...gdeltResult.items];

    if (allItems.length === 0) {
      console.warn('[TrendService] All live sources failed/timed out. Providing clearly labeled demo items.');
      allItems = this.getDemoItems();
    }

    // Sort by Forge Relevance descending
    allItems.sort((a, b) => b.forgeRelevance - a.forgeRelevance);

    this.cache = {
      items: allItems,
      sources,
      lastFetchTime: new Date().toISOString()
    };

    return {
      items: allItems,
      sources,
      cached: false,
      lastFetchTime: this.cache.lastFetchTime
    };
  }
}

export const trendService = new TrendService();
