import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

class ProjectStore {
  constructor() {
    this.projectsDir = CONFIG.STORAGE.PROJECTS_DIR;
    this.initStore();
  }

  initStore() {
    if (!fs.existsSync(this.projectsDir)) {
      fs.mkdirSync(this.projectsDir, { recursive: true });
    }
    // Demo seeding disabled: the studio shows only projects the user creates.
  }

  seedDemoProjects() {
    const demos = [
      {
        id: 'demo-local-ai-revolution',
        isDemo: true,
        title: 'The Local AI Revolution: Goodbye Cloud Subscriptions',
        concept: 'Why running small language models on your personal machine beats expensive cloud APIs for creator privacy and speed.',
        hook: 'What if you never had to pay another monthly subscription or enter an API key to build AI content?',
        cta: 'Save this reel and start running open models on your local machine today.',
        caption: 'Zero API keys. Zero credit cards. The local AI revolution is happening right on your machine with Qoneqt Shots. #LocalAI #OpenSource #TechReels',
        hashtags: ['#LocalAI', '#OpenSource', '#CreatorEconomy', '#PrivacyFirst'],
        audience: 'Tech Creators & Developers',
        language: 'English',
        tone: 'dynamic, authoritative, inspiring',
        visualStyle: 'kinetic_bold',
        sourceAttribution: {
          name: 'Hacker News Community Discussions',
          url: 'https://news.ycombinator.com'
        },
        createdAt: '2026-09-28T10:00:00.000Z',
        updatedAt: '2026-09-28T10:00:00.000Z',
        totalDuration: 22,
        status: 'ready_to_export',
        scenes: [
          {
            id: 'scene-1',
            sceneNumber: 1,
            narration: 'What if you never had to pay another subscription or leak your ideas to a cloud server again?',
            onScreenText: 'ZERO SUBSCRIPTIONS\nZERO LEAKED DATA',
            duration: 5,
            visualDescription: 'Kinetic bold typography on deep ink canvas with electric violet pulsing core',
            visualStyle: 'kinetic_bold',
            edited: false
          },
          {
            id: 'scene-2',
            sceneNumber: 2,
            narration: 'Modern open models now generate studio-grade scripts directly inside your laptop RAM in under two seconds.',
            onScreenText: 'STUDIO SCRIPTS\nIN 2 SECONDS',
            duration: 5,
            visualDescription: 'Dual neon cyber card with glowing cyan data streams and animated metric counter',
            visualStyle: 'neon_cyber',
            edited: false
          },
          {
            id: 'scene-3',
            sceneNumber: 3,
            narration: 'No internet connection needed. No rate limits. Complete creative ownership of your studio assets.',
            onScreenText: '100% OFFLINE\nFULL OWNERSHIP',
            duration: 6,
            visualDescription: 'Sunset glow gradient with bold floating glass badges and kinetic reveal',
            visualStyle: 'sunset_glow',
            edited: false
          },
          {
            id: 'scene-4',
            sceneNumber: 4,
            narration: 'The creators winning the next decade are the ones who control their own stack. Follow to stay ahead.',
            onScreenText: 'CONTROL YOUR STACK\nFOLLOW FOR MORE',
            duration: 6,
            visualDescription: 'Minimalist editorial finish with pulsing call-to-action button outline',
            visualStyle: 'editorial_minimal',
            edited: false
          }
        ]
      },
      {
        id: 'demo-hook-mastery',
        isDemo: true,
        title: 'The 3-Second Rule: Hook Mastery for Vertical Video',
        concept: 'The exact visual and psychological trigger that stops thumb scrolling in the first three seconds.',
        hook: 'Your first three seconds are costing you 80% of your views—here is the exact fix.',
        cta: 'Try this visual pattern in your next reel and watch your retention double.',
        caption: 'Stop losing viewers on the first swipe. Master the 3-second kinetic hook formula. #CreatorHacks #VideoEditing #GrowthTips',
        hashtags: ['#CreatorTips', '#ViralReels', '#VideoHooks', '#ContentStrategy'],
        audience: 'Short-Form Creators',
        language: 'English',
        tone: 'punchy, tactical, energetic',
        visualStyle: 'neon_cyber',
        sourceAttribution: null,
        createdAt: '2026-09-25T14:30:00.000Z',
        updatedAt: '2026-09-25T14:30:00.000Z',
        totalDuration: 20,
        status: 'ready_to_export',
        scenes: [
          {
            id: 'scene-1',
            sceneNumber: 1,
            narration: 'Your first three seconds are costing you 80% of your audience. Here is why.',
            onScreenText: 'THE 3-SECOND\nVIEWER LEAK',
            duration: 5,
            visualDescription: 'High contrast electric violet screen with rapid kinetic punch-in zoom',
            visualStyle: 'neon_cyber',
            edited: false
          },
          {
            id: 'scene-2',
            sceneNumber: 2,
            narration: 'Never start with a generic question. Start with an urgent contradiction or an unexpected visual movement.',
            onScreenText: 'NO GENERIC QUESTIONS\nCONTRADICT FIRST',
            duration: 5,
            visualDescription: 'Bold typography with strikethrough animation on bad habits',
            visualStyle: 'kinetic_bold',
            edited: false
          },
          {
            id: 'scene-3',
            sceneNumber: 3,
            narration: 'Keep on-screen text under six words per flash. Viewers read kinetic captions 3 times faster than voice.',
            onScreenText: 'MAX 6 WORDS\nPER SCENE FLASH',
            duration: 5,
            visualDescription: 'Emerald green highlight boxes around kinetic typography tokens',
            visualStyle: 'sunset_glow',
            edited: false
          },
          {
            id: 'scene-4',
            sceneNumber: 4,
            narration: 'Stack kinetic movement with immediate value. Try this in Qoneqt Shots right now.',
            onScreenText: 'STACK THE HOOK\nCREATE IN FORGE',
            duration: 5,
            visualDescription: 'Studio badge with animated glow ring and call to action',
            visualStyle: 'editorial_minimal',
            edited: false
          }
        ]
      }
    ];

    for (const demo of demos) {
      const filePath = path.join(this.projectsDir, `${demo.id}.json`);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(demo, null, 2), 'utf-8');
      }
    }
  }

  listProjects() {
    const files = fs.readdirSync(this.projectsDir);
    const projects = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = fs.readFileSync(path.join(this.projectsDir, file), 'utf-8');
        const project = JSON.parse(content);
        projects.push({
          id: project.id,
          title: project.title || 'Untitled Project',
          concept: project.concept || '',
          scenesCount: project.scenes?.length || 0,
          totalDuration: project.totalDuration || 0,
          visualStyle: project.visualStyle || 'kinetic_bold',
          createdAt: project.createdAt || new Date().toISOString(),
          updatedAt: project.updatedAt || project.createdAt,
          isDemo: Boolean(project.isDemo),
          status: project.status || 'draft',
          hasAttribution: Boolean(project.sourceAttribution),
          thumbnail: project.scenes?.find(s => s.imageUrl)?.imageUrl || null,
          exportUrl: project.exportUrl || null
        });
      } catch (err) {
        console.warn(`[ProjectStore] Could not read ${file}:`, err.message);
      }
    }

    // Sort by updatedAt descending
    projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return projects;
  }

  getProject(id) {
    const filePath = path.join(this.projectsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  saveProject(project) {
    if (!project.id) {
      project.id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }
    const now = new Date().toISOString();
    project.createdAt = project.createdAt || now;
    project.updatedAt = now;

    // Recalculate total duration
    if (Array.isArray(project.scenes)) {
      project.totalDuration = project.scenes.reduce((acc, s) => acc + (Number(s.duration) || 5), 0);
    }

    const filePath = path.join(this.projectsDir, `${project.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8');
    return project;
  }

  duplicateProject(id) {
    const orig = this.getProject(id);
    if (!orig) throw new Error('Project not found');

    const duplicate = JSON.parse(JSON.stringify(orig));
    duplicate.id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    duplicate.title = `${orig.title} (Copy)`;
    duplicate.isDemo = false;
    duplicate.createdAt = new Date().toISOString();
    duplicate.updatedAt = duplicate.createdAt;

    this.saveProject(duplicate);
    return duplicate;
  }

  deleteProject(id) {
    const filePath = path.join(this.projectsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}

export const projectStore = new ProjectStore();
