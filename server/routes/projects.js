import express from 'express';
import { projectStore } from '../services/projectStore.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const list = projectStore.listProjects();
    res.json({ projects: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const project = projectStore.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const projectData = req.body;
    if (!projectData.title) {
      return res.status(400).json({ error: 'Project title is required' });
    }
    const saved = projectStore.saveProject(projectData);
    res.json({ success: true, project: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/duplicate', (req, res) => {
  try {
    const duplicated = projectStore.duplicateProject(req.params.id);
    res.json({ success: true, project: duplicated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const success = projectStore.deleteProject(req.params.id);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
