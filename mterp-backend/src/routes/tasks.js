const express = require('express');
const { Task, Project, User } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const { parseWIBDate, nowWIB } = require('../utils/date');
const { notify } = require('../utils/notify');

const router = express.Router();

const TASK_MANAGE_ROLES = [
  'owner',
  'president_director',
  'operational_director',
  'director',
  'site_manager',
  'supervisor',
  'admin_project',
  'asset_admin',
];

// GET /api/tasks - Get all tasks (filtered by user role, scope, department, project, status)
router.get('/', auth, async (req, res) => {
  try {
    const { projectId, status, assignedTo, scope, department, search } = req.query;
    let query = {};
    
    // Filter by scope (office vs project)
    if (scope && scope !== 'all') {
      query.scope = scope;
    }

    // Filter by office department
    if (department && department !== 'all') {
      query.department = department;
    }

    // Filter by project
    if (projectId) {
      query.projectId = projectId;
    }
    
    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Filter by assigned user
    if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    // Keyword search across title and description
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: regex }, { description: regex }];
    }
    
    // Field workforce can only see tasks assigned to them
    if (['worker', 'tukang', 'helper'].includes(req.user.role)) {
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

// GET /api/tasks/stats - Get high-level summary statistics
router.get('/stats', auth, async (req, res) => {
  try {
    let matchQuery = {};
    if (['worker', 'tukang', 'helper'].includes(req.user.role)) {
      matchQuery.assignedTo = req.user._id;
    }

    const now = nowWIB();

    const [stats] = await Task.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          byStatus: [
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
              },
            },
          ],
          byScope: [
            {
              $group: {
                _id: '$scope',
                count: { $sum: 1 },
              },
            },
          ],
          overdue: [
            {
              $match: {
                status: { $in: ['pending', 'in_progress'] },
                dueDate: { $lt: now },
              },
            },
            { $count: 'count' },
          ],
          total: [
            { $count: 'count' },
          ],
        },
      },
    ]);

    const statusMap = {};
    (stats.byStatus || []).forEach(s => { statusMap[s._id] = s.count; });
    
    const scopeMap = {};
    (stats.byScope || []).forEach(s => { scopeMap[s._id] = s.count; });

    res.json({
      total: stats.total?.[0]?.count || 0,
      pending: statusMap.pending || 0,
      in_progress: statusMap.in_progress || 0,
      completed: statusMap.completed || 0,
      cancelled: statusMap.cancelled || 0,
      overdue: stats.overdue?.[0]?.count || 0,
      office: scopeMap.office || 0,
      project: scopeMap.project || 0,
    });
  } catch (error) {
    console.error('Get task stats error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/tasks/my - Get current user's active tasks
router.get('/my', auth, async (req, res) => {
  try {
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

// GET /api/tasks/users/list - Get list of users for assignment
router.get('/users/list', auth, authorize(...TASK_MANAGE_ROLES), async (req, res) => {
  try {
    const users = await User.find({ isVerified: true })
      .select('_id fullName role username position')
      .sort({ fullName: 1 })
      .lean();
    
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/tasks/:id - Get single task
router.get('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('projectId', 'nama lokasi')
      .populate('assignedTo', 'fullName role position')
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

// POST /api/tasks - Create task (office or project)
router.post('/', auth, authorize(...TASK_MANAGE_ROLES), async (req, res) => {
  try {
    const {
      title,
      description,
      scope = 'project',
      department,
      officeLocation,
      projectId,
      assignedTo,
      priority,
      dueDate,
      workItemId,
      subtasks,
      progress,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ msg: 'Title is required' });
    }
    
    // Verify project exists if scope is project or if projectId is supplied
    if (scope === 'project') {
      if (!projectId) {
        return res.status(400).json({ msg: 'Project ID is required for project tasks' });
      }
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ msg: 'Project not found' });
      }
    } else if (projectId) {
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ msg: 'Referenced project not found' });
      }
    }
    
    // Verify assigned user exists (if provided)
    if (assignedTo) {
      const user = await User.findById(assignedTo);
      if (!user) {
        return res.status(404).json({ msg: 'Assigned user not found' });
      }
    }
    
    const task = new Task({
      title: title.trim(),
      description,
      scope: scope === 'office' ? 'office' : 'project',
      department: scope === 'office' ? (department || 'General') : undefined,
      officeLocation: officeLocation || (scope === 'office' ? 'Head Office PT Mega Tama Enerco' : undefined),
      projectId: projectId || undefined,
      assignedTo: assignedTo || undefined,
      assignedBy: req.user._id,
      priority: priority || 'normal',
      dueDate: parseWIBDate(dueDate) || undefined,
      workItemId: workItemId || undefined,
      progress: typeof progress === 'number' ? Math.min(100, Math.max(0, progress)) : 0,
      subtasks: Array.isArray(subtasks) ? subtasks : [],
    });
    
    await task.save();
    
    // Populate for response
    await task.populate('projectId', 'nama lokasi');
    await task.populate('assignedTo', 'fullName role');
    await task.populate('assignedBy', 'fullName');
    
    res.status(201).json(task);

    // Notify the assigned user (fire-and-forget)
    if (assignedTo) {
      const locationLabel = task.scope === 'office'
        ? `Kantor (${task.department || 'Operasional'})`
        : (task.projectId?.nama || 'Proyek');
      notify({
        recipient: assignedTo,
        type: 'task_assigned',
        title: 'Task Assigned',
        message: `You have been assigned "${task.title}" at ${locationLabel}`,
        data: { taskId: task._id, projectId: task.projectId?._id, scope: task.scope },
      }).catch(console.error);
    }
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
    
    const isFieldWorker = ['worker', 'tukang', 'helper'].includes(req.user.role);

    // Field workers can only update status/progress/subtasks of their own tasks
    if (isFieldWorker) {
      if (task.assignedTo?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ msg: 'Not authorized' });
      }
      const { status, progress, subtasks, notes } = req.body;
      if (status) {
        task.status = status;
        if (status === 'completed') {
          task.completedAt = nowWIB();
          task.progress = 100;
        }
      }
      if (typeof progress === 'number') {
        task.progress = Math.min(100, Math.max(0, progress));
        if (task.progress === 100 && task.status !== 'completed') {
          task.status = 'completed';
          task.completedAt = nowWIB();
        }
      }
      if (Array.isArray(subtasks)) {
        task.subtasks = subtasks;
      }
      if (notes !== undefined) task.notes = notes;
    } else {
      // Management and supervisors can update all fields
      const {
        title,
        description,
        scope,
        department,
        officeLocation,
        projectId,
        assignedTo,
        status,
        priority,
        dueDate,
        notes,
        progress,
        subtasks,
        workItemId,
      } = req.body;
      
      if (title) task.title = title.trim();
      if (description !== undefined) task.description = description;
      if (scope) task.scope = scope;
      if (department !== undefined) task.department = department;
      if (officeLocation !== undefined) task.officeLocation = officeLocation;
      if (projectId !== undefined) task.projectId = projectId || undefined;
      if (assignedTo !== undefined) task.assignedTo = assignedTo || undefined;
      if (priority) task.priority = priority;
      if (dueDate !== undefined) task.dueDate = parseWIBDate(dueDate) || undefined;
      if (notes !== undefined) task.notes = notes;
      if (workItemId !== undefined) task.workItemId = workItemId || undefined;

      if (typeof progress === 'number') {
        task.progress = Math.min(100, Math.max(0, progress));
      }
      if (Array.isArray(subtasks)) {
        task.subtasks = subtasks;
      }

      if (status) {
        task.status = status;
        if (status === 'completed') {
          task.completedAt = nowWIB();
          task.progress = 100;
        } else if (status === 'in_progress' && task.progress === 0) {
          task.progress = 25;
        }
      }
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
router.put('/:id/assign', auth, authorize(...TASK_MANAGE_ROLES), async (req, res) => {
  try {
    const { assignedTo } = req.body;
    
    // Verify user exists if provided
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

    // Notify the new assignee (fire-and-forget)
    if (assignedTo) {
      const locationLabel = task.scope === 'office'
        ? `Kantor (${task.department || 'Operasional'})`
        : (task.projectId?.nama || 'Proyek');
      notify({
        recipient: assignedTo,
        type: 'task_assigned',
        title: 'Task Assigned',
        message: `You have been assigned "${task.title}" at ${locationLabel}`,
        data: { taskId: task._id, projectId: task.projectId?._id, scope: task.scope },
      }).catch(console.error);
    }
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/tasks/:id/status - Quick status update
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status, progress } = req.body;
    
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }
    
    const isFieldWorker = ['worker', 'tukang', 'helper'].includes(req.user.role);
    // Field workers can only update their own tasks
    if (isFieldWorker && task.assignedTo?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    
    task.status = status;
    if (status === 'completed') {
      task.completedAt = nowWIB();
      task.progress = 100;
    } else if (typeof progress === 'number') {
      task.progress = Math.min(100, Math.max(0, progress));
    } else if (status === 'in_progress' && task.progress === 0) {
      task.progress = 25;
    }
    
    await task.save();
    
    await task.populate('projectId', 'nama lokasi');
    await task.populate('assignedTo', 'fullName role');
    
    res.json(task);

    // Notify the task creator when completed (fire-and-forget)
    if (status === 'completed' && task.assignedBy) {
      notify({
        recipient: task.assignedBy,
        type: 'task_completed',
        title: 'Task Completed',
        message: `"${task.title}" has been marked as completed`,
        data: { taskId: task._id, projectId: task.projectId?._id, scope: task.scope },
      }).catch(console.error);
    }
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', auth, authorize(...TASK_MANAGE_ROLES), async (req, res) => {
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

module.exports = router;

