const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
  completedAt: Date,
}, { _id: true });

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: String,
  scope: {
    type: String,
    enum: ['project', 'office'],
    default: 'project',
    index: true,
  },
  department: {
    type: String,
    enum: [
      'General',
      'Management',
      'Finance & Accounting',
      'HRD & GA',
      'Procurement & SCM',
      'Engineering & Design',
      'Legal & Compliance',
      'IT & Infrastructure'
    ],
    default: 'General',
    index: true,
  },
  officeLocation: {
    type: String,
    default: 'Head Office PT Mega Tama Enerco',
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: function() {
      return this.scope === 'project';
    },
    index: true,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  workItemId: String,
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal',
    index: true,
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  subtasks: [subtaskSchema],
  dueDate: Date,
  completedAt: Date,
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

taskSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  next();
});

taskSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Indexes for querying tasks efficiently across office and project workflows
taskSchema.index({ scope: 1, status: 1, dueDate: 1 });
taskSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ department: 1, status: 1 });

module.exports = mongoose.model('Task', taskSchema);
