const express = require('express');
const { Task, Project, User } = require('../models');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/tasks - Get all tasks (filtered by user role)
router.get('/', auth, async (req, res) => {
  try {
    const { projectId, status, assignedTo } = req.query;
    let query = {};
    
    // Filter by project
    if (projectId) {
      query.projectId = projectId;
    }
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by assigned user
    if (assignedTo) {
      query.assignedTo = assignedTo;
    }
    
    // Workers can only see tasks assigned to them
    if (req.user.role === 'worker') {
      query.assignedTo = req.user._id;
    }
    
    const tasks = await Task.find(query)
      .populate('projectId', 'nama lokasi')
      .populate('assignedTo', 'fullName role')
      .populate('assignedBy', 'fullName')
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();
    
    res.json(tasks);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/tasks/my - Get current user's tasks for today
router.get('/my', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tasks = await Task.find({
      assignedTo: req.user._id,
      status: { $in: ['pending', 'in_progress'] },
    })
      .populate('projectId', 'nama lokasi')
      .sort({ priority: -1, dueDate: 1 })
      .lean();
    
    res.json(tasks);
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/tasks/:id - Get single task
router.get('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('projectId', 'nama lokasi')
      .populate('assignedTo', 'fullName role')
      .populate('assignedBy', 'fullName')
      .lean();
    
    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }
    
    res.json(task);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/tasks - Create task (owner, director, supervisor)
router.post('/', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const { title, description, projectId, assignedTo, priority, dueDate } = req.body;
    
    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }
    
    // Verify assigned user exists (if provided)
    if (assignedTo) {
      const user = await User.findById(assignedTo);
      if (!user) {
        return res.status(404).json({ msg: 'Assigned user not found' });
      }
    }
    
    const task = new Task({
      title,
      description,
      projectId,
      assignedTo: assignedTo || undefined,
      assignedBy: req.user._id,
      priority: priority || 'normal',
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    
    await task.save();
    
    // Populate for response
    await task.populate('projectId', 'nama lokasi');
    await task.populate('assignedTo', 'fullName role');
    await task.populate('assignedBy', 'fullName');
    
    res.status(201).json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }
    
    // Workers can only update status of their own tasks
    if (req.user.role === 'worker') {
      if (task.assignedTo?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ msg: 'Not authorized' });
      }
      // Workers can only update status
      const { status } = req.body;
      if (status) {
        task.status = status;
        if (status === 'completed') {
          task.completedAt = new Date();
        }
      }
    } else {
      // Supervisors and above can update anything
      const { title, description, assignedTo, status, priority, dueDate, notes } = req.body;
      
      if (title) task.title = title;
      if (description !== undefined) task.description = description;
      if (assignedTo !== undefined) task.assignedTo = assignedTo || undefined;
      if (status) {
        task.status = status;
        if (status === 'completed') {
          task.completedAt = new Date();
        }
      }
      if (priority) task.priority = priority;
      if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : undefined;
      if (notes !== undefined) task.notes = notes;
    }
    
    await task.save();
    
    // Populate for response
    await task.populate('projectId', 'nama lokasi');
    await task.populate('assignedTo', 'fullName role');
    await task.populate('assignedBy', 'fullName');
    
    res.json(task);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/tasks/:id/assign - Assign task to user
router.put('/:id/assign', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const { assignedTo } = req.body;
    
    // Verify user exists
    if (assignedTo) {
      const user = await User.findById(assignedTo);
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }
    }
    
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { 
        $set: { 
          assignedTo: assignedTo || undefined,
          assignedBy: req.user._id,
        } 
      },
      { new: true }
    )
      .populate('projectId', 'nama lokasi')
      .populate('assignedTo', 'fullName role')
      .populate('assignedBy', 'fullName');
    
    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }
    
    res.json(task);
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/tasks/:id/status - Quick status update
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }
    
    // Workers can only update their own tasks
    if (req.user.role === 'worker' && task.assignedTo?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    
    task.status = status;
    if (status === 'completed') {
      task.completedAt = new Date();
    }
    
    await task.save();
    
    await task.populate('projectId', 'nama lokasi');
    await task.populate('assignedTo', 'fullName role');
    
    res.json(task);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    
    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }
    
    res.json({ msg: 'Task deleted' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/tasks/users/list - Get list of users for assignment
router.get('/users/list', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const users = await User.find({ isVerified: true })
      .select('_id fullName role username')
      .sort({ fullName: 1 })
      .lean();
    
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
