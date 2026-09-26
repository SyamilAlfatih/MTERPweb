const mongoose = require('mongoose');

const predecessorSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProjectTask',
    required: true,
  },
  type: {
    type: String,
    enum: ['FS', 'FF', 'SS', 'SF'],
    default: 'FS',
  },
  lagDays: {
    type: Number,
    default: 0,
  },
}, { _id: false });

const resourceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  units: {
    type: Number,
    default: 100, // 100 = full-time (100%)
  },
  costRate: {
    type: Number,
    default: 0, // daily rate
  },
}, { _id: false });

const baselineRecordSchema = new mongoose.Schema({
  baselineIndex: {
    type: Number,
    default: 0, // 0 = Baseline, 1 = Baseline 1, etc.
    min: 0,
    max: 10,
  },
  name: {
    type: String,
    default: 'Baseline',
  },
  startDate: {
    type: Date,
    default: null,
  },
  finishDate: {
    type: Date,
    default: null,
  },
  duration: {
    type: Number,
    default: null,
  },
  cost: {
    type: Number,
    default: 0,
  },
  work: {
    type: Number,
    default: 0,
  },
  savedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const projectTaskSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },

  // WBS & Hierarchy
  wbsCode: {
    type: String,
    default: '',
    trim: true,
  },
  outlineLevel: {
    type: Number,
    default: 1, // 1 = top-level, 2+ = nested
    min: 1,
  },
  parentTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProjectTask',
    default: null,
    index: true,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  isSummary: {
    type: Boolean,
    default: false,
  },
  isMilestone: {
    type: Boolean,
    default: false,
  },

  // Core scheduling fields (mirrors MS Project)
  name: {
    type: String,
    required: true,
    trim: true,
  },
  duration: {
    type: Number,
    default: 1, // in working days (0 for milestones)
    min: 0,
  },
  durationUnit: {
    type: String,
    enum: ['days', 'weeks', 'months'],
    default: 'days',
  },
  startDate: {
    type: Date,
    default: null,
  },
  finishDate: {
    type: Date,
    default: null,
  },
  percentComplete: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },

  // Baseline (snapshot of plan - Baseline 0)
  baselineStart: {
    type: Date,
    default: null,
  },
  baselineFinish: {
    type: Date,
    default: null,
  },
  baselineDuration: {
    type: Number,
    default: null,
  },
  baselineCost: {
    type: Number,
    default: null,
  },

  // Multiple Baselines (Baseline 0 through 10)
  baselines: [baselineRecordSchema],

  // Calendar Override
  calendarId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProjectCalendar',
    default: null,
  },

  // Task Type & Effort-driven scheduling (MS Project Golden Triangle: Work = Duration * Units)
  taskType: {
    type: String,
    enum: ['FixedUnits', 'FixedDuration', 'FixedWork'],
    default: 'FixedUnits',
  },
  isEffortDriven: {
    type: Boolean,
    default: true,
  },
  levelingDelay: {
    type: Number,
    default: 0, // delay in working days introduced by resource leveling
  },

  // Dependencies (predecessors)
  predecessors: [predecessorSchema],

  // Constraints
  constraintType: {
    type: String,
    enum: ['ASAP', 'ALAP', 'MSO', 'MFO', 'SNET', 'SNLT', 'FNET', 'FNLT'],
    default: 'ASAP',
  },
  constraintDate: {
    type: Date,
    default: null,
  },
  deadlineDate: {
    type: Date,
    default: null,
  },

  // Resources
  assignedResources: [resourceSchema],

  // Cost & Work
  plannedCost: {
    type: Number,
    default: 0,
  },
  actualCost: {
    type: Number,
    default: 0,
  },
  plannedWork: {
    type: Number,
    default: 0, // hours
  },
  actualWork: {
    type: Number,
    default: 0,
  },
  remainingWork: {
    type: Number,
    default: 0,
  },

  // Visual & Presentation
  barColor: {
    type: String,
    default: '',
  },
  notes: {
    type: String,
    default: '',
  },
  priority: {
    type: Number,
    default: 500, // 0-1000, 500 = medium
  },

  // Linking to existing data
  legacyWorkItemId: {
    type: String,
    default: null,
  },
  legacySupplyId: {
    type: String,
    default: null,
  },
  legacyTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null,
  },

  // Unified Item Type & RAB Classification
  itemType: {
    type: String,
    enum: ['summary', 'work', 'supply', 'milestone'],
    default: 'work',
  },
  category: {
    type: String,
    enum: ['general', 'material', 'labor', 'equipment', 'subcontractor', 'overhead'],
    default: 'general',
  },

  // Physical Quantities & Unit Rates (RAB Engine)
  quantity: {
    type: Number,
    default: 1,
    min: 0,
  },
  unit: {
    type: String,
    default: 'ls',
    trim: true,
  },
  unitRate: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalBudget: {
    type: Number,
    default: 0,
  },

  // Realization & Progress
  realizedQuantity: {
    type: Number,
    default: 0,
  },
  realizedAmount: {
    type: Number,
    default: 0,
  },
  physicalWeight: {
    type: Number,
    default: 0,
  },

  // Supply Specific Fields
  supplyStatus: {
    type: String,
    enum: ['Pending', 'Ordered', 'Delivered'],
    default: 'Pending',
  },
  deliveryDate: {
    type: Date,
    default: null,
  },

  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

projectTaskSchema.index({ projectId: 1, sortOrder: 1 });
projectTaskSchema.index({ projectId: 1, wbsCode: 1 });

const ProjectTask = mongoose.model('ProjectTask', projectTaskSchema);

module.exports = ProjectTask;
