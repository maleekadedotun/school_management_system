const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    status: {
      type: String,
      enum: ["Present", "Absent", "Late", "Excused"],
      default: "Present",
      required: true,
    },
    remarks: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dateString: {
      type: String, // YYYY-MM-DD for fast index searches
      required: true,
      index: true,
    },
    classLevel: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      default: "",
      trim: true,
    },
    academicTerm: {
      type: String,
      default: "1st Term",
      trim: true,
    },
    academicYear: {
      type: String,
      default: "",
      trim: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    records: [attendanceRecordSchema],
    summary: {
      total: { type: Number, default: 0 },
      present: { type: Number, default: 0 },
      absent: { type: Number, default: 0 },
      late: { type: Number, default: 0 },
      excused: { type: Number, default: 0 },
      attendanceRate: { type: Number, default: 100 },
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    firstSubmittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual property to calculate whether 5-hour edit window has expired
attendanceSchema.virtual("isLocked").get(function () {
  const initialTime = this.firstSubmittedAt || this.createdAt;
  if (!initialTime) return false;
  const fiveHoursInMs = 5 * 60 * 60 * 1000;
  return Date.now() - new Date(initialTime).getTime() > fiveHoursInMs;
});

// Compound index for unique daily registers per class, subject and teacher
attendanceSchema.index({ teacher: 1, classLevel: 1, subject: 1, dateString: 1 });

const Attendance = mongoose.model("Attendance", attendanceSchema);
module.exports = Attendance;
