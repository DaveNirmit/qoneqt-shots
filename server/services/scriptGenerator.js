import { ollamaService } from './ollamaService.js';
import { CONFIG } from '../config.js';

// Clean JSON text if wrapped in markdown code fence or has trailing commas
function cleanAndParseJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Empty or invalid text received from model');
  }

  let cleaned = text.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // Find start and end brackets
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Attempt minor repair: remove trailing commas before closing braces/brackets
    const repaired = cleaned
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    return JSON.parse(repaired);
  }
}

// Validate script schema structure
function validateScriptSchema(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Script data is not an object');
  }

  const title = (data.title || data.titleOptions?.[0] || 'Untitled Forge Reel').trim();
  const hook = (data.hook || '').trim();
  const concept = (data.concept || '').trim();
  const cta = (data.cta || data.callToAction || 'Follow for more insights.').trim();
  const caption = (data.caption || '').trim();
  const hashtags = Array.isArray(data.hashtags) ? data.hashtags : ['#QoneqtForge', '#TechTrends', '#Creator'];

  if (!Array.isArray(data.scenes) || data.scenes.length === 0) {
    throw new Error('Script does not contain a valid array of scenes');
  }

  let validScenes = data.scenes.map((scene, idx) => {
    return {
      id: scene.id || `scene-${idx + 1}`,
      sceneNumber: idx + 1,
      narration: (scene.narration || '').trim(),
      onScreenText: (scene.onScreenText || scene.text || '').trim(),
      duration: Math.max(3, Math.min(12, Number(scene.duration) || 5)),
      visualDescription: (scene.visualDescription || scene.visualDirection || 'Dynamic motion graphic with kinetic text').trim(),
      visualStyle: scene.visualStyle || 'kinetic_bold',
      edited: false
    };
  });

  // If model only returned 1 or 2 scenes, expand into structured 4-scene story arc
  if (validScenes.length < 3) {
    const s1 = validScenes[0];
    validScenes = [
      {
        id: 'scene-1',
        sceneNumber: 1,
        narration: hook || s1.narration || 'Stop scrolling. A major breakthrough just dropped.',
        onScreenText: (s1.onScreenText || 'BREAKTHROUGH\\nDROPPED').toUpperCase(),
        duration: 5,
        visualDescription: 'Kinetic bold typography on dark canvas with pulsing electric violet ring',
        visualStyle: 'kinetic_bold',
        edited: false
      },
      {
        id: 'scene-2',
        sceneNumber: 2,
        narration: s1.narration || concept || 'Traditional workflows are evaporating in real-time.',
        onScreenText: 'WORKFLOWS\\nEVAPORATING',
        duration: 6,
        visualDescription: 'Split screen kinetic motion with glowing cyan data accents and animated bar metrics',
        visualStyle: 'neon_cyber',
        edited: false
      },
      {
        id: 'scene-3',
        sceneNumber: 3,
        narration: 'Creators adapting right now are gaining 10x leverage over legacy stacks.',
        onScreenText: '10X LEVERAGE\\nNEW STACKS',
        duration: 6,
        visualDescription: 'Vibrant gradient mesh background with bold floating cards and staggered text reveal',
        visualStyle: 'sunset_glow',
        edited: false
      },
      {
        id: 'scene-4',
        sceneNumber: 4,
        narration: cta || 'Follow for more daily breakthroughs in creative tech.',
        onScreenText: 'ARE YOU READY?\\nFOLLOW FOR MORE',
        duration: 5,
        visualDescription: 'High contrast clean editorial card with pulsating call-to-action button badge',
        visualStyle: 'editorial_minimal',
        edited: false
      }
    ];
  }

  // Calculate total duration
  const totalDuration = validScenes.reduce((acc, s) => acc + s.duration, 0);

  return {
    title,
    titleOptions: Array.isArray(data.titleOptions) ? data.titleOptions : [title],
    concept,
    hook,
    cta,
    caption,
    hashtags,
    scenes: validScenes,
    totalDuration,
    generator: 'local-ollama',
    aiGenerated: true
  };
}

// High quality template fallback for offline / uninstalled model mode
export function getTemplateFallback(topic, options = {}) {
  const tone = options.tone || 'engaging';
  const duration = Number(options.duration) || 30;
  const sourceName = options.sourceName || 'Trend Hub';
  const sourceUrl = options.sourceUrl || '';

  const cleanTopic = topic.trim() || 'The Future of Creative Technology';

  return {
    title: `${cleanTopic}: What You Need To Know`,
    titleOptions: [
      `${cleanTopic}: What You Need To Know`,
      `The Unspoken Reality of ${cleanTopic}`,
      `Why Everyone Is Talking About ${cleanTopic}`
    ],
    concept: `A crisp breakdown of ${cleanTopic} and its immediate impact on creators and tech thinkers.`,
    hook: `Stop scrolling—this shift in ${cleanTopic} changes everything we took for granted.`,
    cta: `What is your take on this? Drop your thoughts below.`,
    caption: `Breaking down ${cleanTopic} in under a minute. Key takeaways and what comes next.`,
    hashtags: ['#QoneqtForge', '#CreatorStudio', '#TechBreakdown', '#FutureTech'],
    sourceAttribution: sourceUrl ? { name: sourceName, url: sourceUrl } : null,
    scenes: [
      {
        id: 'scene-1',
        sceneNumber: 1,
        narration: `Stop scrolling. A major shift is happening in ${cleanTopic}, and most people haven't noticed yet.`,
        onScreenText: `THE SHIFT IN\n${cleanTopic.toUpperCase()}`,
        duration: 5,
        visualDescription: 'Kinetic bold typography on dark charcoal canvas with electric violet pulsing ring',
        visualStyle: 'kinetic_bold',
        edited: false
      },
      {
        id: 'scene-2',
        sceneNumber: 2,
        narration: `Here is the core signal: traditional barriers are evaporating, leaving only speed, clarity, and genuine quality.`,
        onScreenText: 'BARRIERS: EVAPORATING\nQUALITY: ESSENTIAL',
        duration: 6,
        visualDescription: 'Split screen kinetic motion with glowing cyan data accents and animated bar metrics',
        visualStyle: 'neon_cyber',
        edited: false
      },
      {
        id: 'scene-3',
        sceneNumber: 3,
        narration: `Creators who adapt right now are seeing exponential leverage compared to those relying on legacy workflows.`,
        onScreenText: 'EXPONENTIAL LEVERAGE\nNEW WORKFLOWS',
        duration: 7,
        visualDescription: 'Vibrant gradient mesh background with bold floating cards and staggered text reveal',
        visualStyle: 'sunset_glow',
        edited: false
      },
      {
        id: 'scene-4',
        sceneNumber: 4,
        narration: `The real question isn't whether this changes the game—it is whether you are ready to lead it. Follow for more deep dives.`,
        onScreenText: 'ARE YOU READY?\nFOLLOW FOR MORE',
        duration: 6,
        visualDescription: 'High contrast clean editorial card with pulsating call-to-action button badge',
        visualStyle: 'editorial_minimal',
        edited: false
      }
    ],
    totalDuration: 24,
    generator: 'template-fallback',
    aiGenerated: false,
    notice: 'Generated using Qoneqt Shots Editorial Template (Local model was offline or bypassed).'
  };
}

class ScriptGenerator {
  async generateScript({
    topic,
    audience = 'Tech Enthusiasts & Creators',
    language = 'English',
    tone = 'dynamic, engaging, punchy',
    duration = 30,
    visualStyle = 'kinetic_bold',
    sourceContext = null,
    modelName = CONFIG.DEFAULT_MODEL
  }) {
    // Check if Ollama is accessible
    const status = await ollamaService.checkStatus();
    if (!status.online) {
      console.warn('Ollama runtime is offline. Using editorial template fallback.');
      return getTemplateFallback(topic, {
        tone,
        duration,
        sourceName: sourceContext?.name,
        sourceUrl: sourceContext?.url
      });
    }

    // Verify model installed
    const isInstalled = await ollamaService.isModelInstalled(modelName);
    if (!isInstalled) {
      console.warn(`Model ${modelName} is not installed locally. Using editorial template fallback.`);
      return getTemplateFallback(topic, {
        tone,
        duration,
        sourceName: sourceContext?.name,
        sourceUrl: sourceContext?.url
      });
    }

    const sceneCount = duration <= 20 ? 3 : duration <= 45 ? 4 : 5;

    let sourcePromptContext = '';
    if (sourceContext && sourceContext.title) {
      sourcePromptContext = `
ORIGINAL RESEARCH SOURCE (Retain truthfulness, do not hallucinate):
- Headline: ${sourceContext.title}
- Source: ${sourceContext.name || 'Verified Web'}
- URL: ${sourceContext.url || 'N/A'}
- Context / Snippet: ${sourceContext.snippet || 'Real current news article'}
`;
    }

    const systemPrompt = `You are an elite short-form video creator and scriptwriter for vertical videos (Reels, TikTok, Shorts).
Your scripts are written for speech, not essays.
CRITICAL RULES:
1. Opening hook must be sharp, specific, and hook the viewer in under 3 seconds.
2. Exactly ${sceneCount} ordered scenes.
3. Spoken narration must be natural, punchy, conversational, and fit the ${duration}-second total window.
4. On-screen text must be brief (3-6 words per line, max 2 lines) formatted with '\\n' for punchy kinetic display.
5. NEVER invent statistics, fake research institutions, or hallucinated quotes.
6. Target audience: ${audience}. Tone: ${tone}. Language: ${language}.
7. Return strictly valid JSON conforming to the schema below. No markdown outside JSON.`;

    const userPrompt = `Create a viral vertical video script about: "${topic}"
Target total video duration: ~${duration} seconds.
${sourcePromptContext}

Required JSON schema:
{
  "title": "Compelling video title",
  "titleOptions": ["Alternative 1", "Alternative 2", "Alternative 3"],
  "concept": "1-sentence core concept",
  "hook": "Opening 3-second hook for scene 1",
  "cta": "Call to action at the end",
  "caption": "Short social media post caption",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4"],
  "scenes": [
    {
      "sceneNumber": 1,
      "narration": "Exact words spoken by narrator for scene 1",
      "onScreenText": "BOLD 2-4 WORD\\nKINETIC HOOK",
      "duration": 5,
      "visualDescription": "Detailed visual layout and kinetic motion cues",
      "visualStyle": "${visualStyle}"
    }
  ]
}`;

    let lastError = null;
    // Retry up to 2 times if model produces invalid JSON
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[ScriptGenerator] Invoking ${modelName} (Attempt ${attempt}/2)...`);
        const result = await ollamaService.generate(modelName, userPrompt, systemPrompt, {
          format: 'json',
          temperature: 0.65,
          timeoutMs: 60000
        });

        const parsed = cleanAndParseJSON(result.response);
        const validated = validateScriptSchema(parsed);

        if (sourceContext && sourceContext.url) {
          validated.sourceAttribution = {
            name: sourceContext.name || 'Verified Source',
            url: sourceContext.url
          };
        }

        return validated;
      } catch (err) {
        console.warn(`[ScriptGenerator] Attempt ${attempt} failed:`, err.message);
        lastError = err;
      }
    }

    console.warn('[ScriptGenerator] Model output parsing failed after retries. Falling back to editorial template.');
    const fallback = getTemplateFallback(topic, {
      tone,
      duration,
      sourceName: sourceContext?.name,
      sourceUrl: sourceContext?.url
    });
    fallback.modelError = lastError?.message || 'Model output failed schema validation';
    return fallback;
  }

  async regenerateScene(sceneNumber, currentScene, projectContext, modelName = CONFIG.DEFAULT_MODEL) {
    const isOnline = (await ollamaService.checkStatus()).online;
    if (!isOnline) {
      return {
        ...currentScene,
        narration: `Here is a fresh take: ${currentScene.narration}`,
        onScreenText: `NEW PERSPECTIVE\n${currentScene.onScreenText.split('\n')[0] || 'UPDATED'}`,
        edited: true
      };
    }

    const prompt = `Regenerate Scene #${sceneNumber} for vertical video titled "${projectContext.title}".
Current scene narration: "${currentScene.narration}"
Current on-screen text: "${currentScene.onScreenText}"
Core video concept: "${projectContext.concept}"

Return JSON with:
{
  "narration": "punchy updated spoken narration for this scene",
  "onScreenText": "UPDATED PUNCHY\\n2-LINE TEXT",
  "duration": ${currentScene.duration || 5},
  "visualDescription": "fresh kinetic visual concept",
  "visualStyle": "${currentScene.visualStyle || 'kinetic_bold'}"
}`;

    try {
      const result = await ollamaService.generate(modelName, prompt, 'Output valid JSON only.', {
        format: 'json',
        temperature: 0.8,
        timeoutMs: 30000
      });
      const parsed = cleanAndParseJSON(result.response);
      return {
        id: currentScene.id,
        sceneNumber,
        narration: parsed.narration || currentScene.narration,
        onScreenText: parsed.onScreenText || currentScene.onScreenText,
        duration: parsed.duration || currentScene.duration || 5,
        visualDescription: parsed.visualDescription || currentScene.visualDescription,
        visualStyle: parsed.visualStyle || currentScene.visualStyle,
        edited: true
      };
    } catch (e) {
      return {
        ...currentScene,
        narration: `${currentScene.narration} (Refreshed)`,
        edited: true
      };
    }
  }
}

export const scriptGenerator = new ScriptGenerator();
