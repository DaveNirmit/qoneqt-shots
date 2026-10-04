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

// ---------------------------------------------------------------------------
// Brief: the local model turns the creator's rough words into a clear, on-topic plan.
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set(['that', 'this', 'with', 'from', 'your', 'about', 'what', 'when', 'make', 'video', 'into', 'have',
  'they', 'them', 'their', 'there', 'just', 'like', 'some', 'more', 'much', 'very', 'really', 'want', 'does', 'will', 'would',
  'could', 'should', 'funny', 'useful', 'short', 'reel', 'shot', 'please', 'also', 'explain', 'explained', 'tell', 'show']);
const contentWords = (s) => new Set((String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 3 && !STOP_WORDS.has(w)));

// True when the brief talks about at least one of the creator's own content words (or a close form of it).
function isOnTopic(script, topic) {
  const asked = contentWords(topic);
  if (!asked.size) return true;
  const body = [...contentWords([script.title, script.concept, ...(script.keyPoints || [])].join(' '))];
  return [...asked].some((w) => body.some((b) => b === w || b.startsWith(w.slice(0, 5)) || w.startsWith(b.slice(0, 5))));
}

const wordCount = (s) => (String(s || '').match(/\S+/g) || []).length;
// About 2.5 spoken words per second, plus a short pause.
const secondsFor = (text) => Math.max(4, Math.min(15, Math.round(wordCount(text) / 2.5 + 0.8)));
const shortText = (text) => {
  const clause = String(text || '').split(/[,:;.!?]/)[0].trim();
  return clause.split(/\s+/).slice(0, 7).join(' ');
};

function scenesFromPoints(hook, points, cta) {
  return [hook, ...points, cta].filter(Boolean).map((line, idx) => ({
    id: `scene-${idx + 1}`,
    sceneNumber: idx + 1,
    narration: line,
    onScreenText: shortText(line),
    duration: secondsFor(line),
    visualDescription: line,
    visualStyle: 'kinetic_bold',
    edited: false
  }));
}

const normalizeTags = (tags) => {
  const list = (Array.isArray(tags) ? tags : String(tags || '').split(/[\s,]+/))
    .map((t) => String(t).replace(/[^A-Za-z0-9_]/g, ''))
    .filter((t) => t.length > 1)
    .map((t) => `#${t}`);
  return [...new Set(list)].slice(0, 7);
};

// Validate and normalise the brief. Throws when it is too thin to be useful (the caller retries).
function validateScriptSchema(data) {
  if (!data || typeof data !== 'object') throw new Error('Script data is not an object');

  const title = String(data.title || data.titleOptions?.[0] || '').trim();
  if (!title) throw new Error('Brief has no title');

  // A call to action is not a key point: keep it out of the list (it has its own cta field).
  const isCta = (p) => /^(follow|subscribe|like|share|comment|don't forget|dont forget)\b|follow (us|me|for)/i.test(p);
  let keyPoints = (Array.isArray(data.keyPoints) ? data.keyPoints : [])
    .map((p) => String(p || '').trim())
    .filter((p) => wordCount(p) >= 3 && !isCta(p))
    .slice(0, 6);
  if (keyPoints.length < 2 && Array.isArray(data.scenes)) {
    keyPoints = data.scenes.map((s) => String(s?.narration || '').trim()).filter((p) => wordCount(p) >= 3).slice(0, 6);
  }
  if (keyPoints.length < 2) throw new Error('Brief has too few key points');

  const hook = String(data.hook || '').trim();
  const cta = String(data.cta || data.callToAction || '').trim() || 'Follow for more.';
  const scenes = scenesFromPoints(hook, keyPoints, cta);
  const hashtags = normalizeTags(data.hashtags);

  return {
    title,
    titleOptions: Array.isArray(data.titleOptions) && data.titleOptions.length ? data.titleOptions : [title],
    concept: String(data.concept || '').trim(),
    audience: String(data.audience || '').trim(),
    creatorNotes: String(data.creatorNotes || '').trim(),
    hook,
    cta,
    caption: String(data.caption || '').trim(),
    hashtags: hashtags.length ? hashtags : ['#QoneqtShots'],
    keyPoints,
    scenes,
    totalDuration: scenes.reduce((n, s) => n + s.duration, 0),
    generator: 'local-ollama',
    aiGenerated: true
  };
}

// Offline fallback: an honest outline the scene writer (Gemini) can fill in. It makes no claims of its own.
export function getTemplateFallback(topic, options = {}) {
  const sourceName = options.sourceName || 'Trend Hub';
  const sourceUrl = options.sourceUrl || '';
  const subject = String(topic || '').trim().replace(/\s+/g, ' ') || 'Something worth knowing';
  const title = subject.length > 60 ? `${subject.slice(0, 57).trim()}...` : subject.charAt(0).toUpperCase() + subject.slice(1);
  const keyPoints = [
    `What ${subject} is, explained in one simple sentence.`,
    `Why ${subject} matters in everyday life.`,
    `The most common misunderstanding about ${subject}.`,
    `One practical thing you can do about ${subject} today.`
  ];
  const hook = `Here is something about ${subject} most people never think about.`;
  const cta = 'Follow for more short explainers like this.';
  const scenes = scenesFromPoints(hook, keyPoints, cta);
  return {
    title,
    titleOptions: [title],
    concept: `A short, clear explainer about ${subject}.`,
    audience: 'everyday Qoneqt viewers',
    creatorNotes: '',
    hook,
    cta,
    caption: `A quick, clear look at ${subject}. What would you add?`,
    hashtags: ['#QoneqtShots', '#Explained', '#LearnOnQoneqt'],
    keyPoints,
    sourceAttribution: sourceUrl ? { name: sourceName, url: sourceUrl } : null,
    scenes,
    totalDuration: scenes.reduce((n, s) => n + s.duration, 0),
    generator: 'template-fallback',
    aiGenerated: false,
    notice: 'Outline only: the local model was offline, so the scene writer fills in the content.'
  };
}

const BRIEF_EXAMPLE = `{"title":"Why Your Phone Dies in the Cold","concept":"Cold weather slows the chemistry inside a phone battery, so it reports less charge, and keeping it warm fixes most of it.","audience":"Everyday phone users","creatorNotes":"Keep it simple and practical.","hook":"Ever had your phone die at 30 percent on a cold day?","keyPoints":["Phones run on lithium-ion batteries that work through chemical reactions.","Cold slows those reactions, so the battery cannot deliver power as easily.","The phone reads that as a low charge and can shut down early to protect itself.","Most of the charge comes back once the phone warms up again.","Keep it in an inside pocket and avoid charging it while it is freezing."],"cta":"Follow for more everyday tech explained in under a minute.","caption":"Your battery is not broken, it is just cold. Here is what happens inside and the easy fix. Has this happened to you?","hashtags":["#PhoneTips","#TechExplained","#WinterHacks","#Battery","#LifeHacks"]}`;

class ScriptGenerator {
  async generateScript({
    topic,
    audience = 'everyday Qoneqt viewers',
    language = 'English',
    tone = 'Informative',
    duration = 30,
    visualStyle = 'kinetic_bold',
    sourceContext = null,
    modelName = CONFIG.DEFAULT_MODEL
  }) {
    const fallback = () => getTemplateFallback(topic, { tone, duration, sourceName: sourceContext?.name, sourceUrl: sourceContext?.url });

    const status = await ollamaService.checkStatus();
    if (!status.online) {
      console.warn('Ollama runtime is offline. Using the outline fallback.');
      return fallback();
    }
    if (!(await ollamaService.isModelInstalled(modelName))) {
      console.warn(`Model ${modelName} is not installed locally. Using the outline fallback.`);
      return fallback();
    }

    const pointCount = duration <= 20 ? 3 : duration <= 45 ? 4 : 5;
    const source = sourceContext?.title
      ? `\nThe idea comes from this real news story. Stay faithful to it and do not add facts it does not support:\n- Headline: ${sourceContext.title}\n- Source: ${sourceContext.name || 'news'}\n- Snippet: ${sourceContext.snippet || ''}\n`
      : '';

    const systemPrompt = `You are a script editor for short vertical videos on Qoneqt, a social media platform.
A creator typed a rough idea, possibly with typos or extra instructions. Understand what they really want and turn it into a clear, accurate brief.
Rules:
- Stay on the creator's exact subject. Do not drift to artificial intelligence, technology or content creation unless the creator asked about that.
- creatorNotes: any style wishes the creator wrote (for example "make it funny", "for students"). Empty if none.
- keyPoints: ${pointCount} short, specific, true statements a viewer will learn, in a logical order (what it is or the problem, why it happens, what to do). Plain words. Never invent numbers, studies or quotes.
- hook: one spoken sentence of at most 14 words that makes a viewer stop scrolling: a question or a surprising true fact.
- cta: one short spoken sentence asking viewers to follow, comment or try it.
- caption: 2 or 3 sentences for the post, ending with a question for the comments.
- hashtags: 5 relevant hashtags with no spaces.
- Tone: ${tone}. Audience: ${audience}. Language: ${language}.
Return only JSON with the keys title, concept, audience, creatorNotes, hook, keyPoints, cta, caption, hashtags.`;

    const basePrompt = `Example. For the idea "my phone dies so fast when its cold outside??" a good brief is:
${BRIEF_EXAMPLE}

Now the real one.
Creator's idea: "${topic}"
Video length: about ${duration} seconds.${source}
Write the JSON brief for this idea.`;

    let lastError = null;
    let userPrompt = basePrompt;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[ScriptGenerator] Invoking ${modelName} (attempt ${attempt}/3)...`);
        const result = await ollamaService.generate(modelName, userPrompt, systemPrompt, {
          format: 'json',
          temperature: attempt === 1 ? 0.5 : 0.7,
          timeoutMs: 60000,
          maxTokens: 900
        });
        const validated = validateScriptSchema(cleanAndParseJSON(result.response));
        if (!isOnTopic(validated, topic)) {
          throw new Error(`Brief drifted off topic ("${validated.title}")`);
        }
        if (sourceContext?.url) validated.sourceAttribution = { name: sourceContext.name || 'Source', url: sourceContext.url };
        return validated;
      } catch (err) {
        console.warn(`[ScriptGenerator] Attempt ${attempt} failed:`, err.message);
        lastError = err;
        userPrompt = `${basePrompt}\n\nYour previous answer was not usable (${err.message}). Write about exactly this subject: "${topic}".`;
      }
    }

    console.warn('[ScriptGenerator] The local model could not produce a usable brief. Using the outline fallback.');
    const out = fallback();
    out.modelError = lastError?.message || 'Model output failed validation';
    return out;
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
