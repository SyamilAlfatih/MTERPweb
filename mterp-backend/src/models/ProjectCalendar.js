const mongoose = require('mongoose');

const exceptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  finishDate: {
    type: Date,
    required: true,
  },
  isWorkingDay: {
    type: Boolean,
    default: false,
  },
}, { _id: true });

const workingHourSchema = new mongoose.Schema({
  start: {
    type: String,
    default: '08:00',
  },
  end: {
    type: String,
    default: '17:00',
  },
}, { _id: false });

const projectCalendarSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    default: 'Standard Construction (Mon-Sat)',
    trim: true,
  },
  isDefault: {
    type: Boolean,
    default: true,
  },
  workingDays: {
    type: [Number],
    default: [1, 2, 3, 4, 5, 6], // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat (Indonesian construction standard)
  },
  hoursPerDay: {
    type: Number,
    default: 8,
    min: 1,
    max: 24,
  },
  workingHours: [workingHourSchema],
  exceptions: [exceptionSchema],
}, {
  timestamps: true,
});

projectCalendarSchema.index({ projectId: 1, isDefault: 1 });

const ProjectCalendar = mongoose.model('ProjectCalendar', projectCalendarSchema);

module.exports = ProjectCalendar;
