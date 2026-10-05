const mongoose = require("mongoose");

const assignmentSubmissionSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentName: {
      type: String,
      default: "",
    },
    studentId: {
      type: String,
      default: "",
    },
    studentEmail: {
      type: String,
      default: "",
    },
    classLevel: {
      type: String,
      default: "",
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
    },
    submissionText: {
      type: String,
      default: "",
    },
    // Supporting student uploading completed document/zip/image/code
    attachment: {
      url: { type: String, default: "" },
      filename: { type: String, default: "" },
      fileType: { type: String, default: "" },
      size: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["submitted", "graded", "late"],
      default: "submitted",
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    score: {
      type: Number,
      default: null,
    },
    feedback: {
      type: String,
      default: "",
    },
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "graderModel",
      default: null,
    },
    graderModel: {
      type: String,
      enum: ["Teacher", "Admin"],
      default: "Teacher",
    },
    gradedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index so a student submits only once per assignment unless re-submission allowed
assignmentSubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

const AssignmentSubmission = mongoose.model(
  "AssignmentSubmission",
  assignmentSubmissionSchema
);

module.exports = AssignmentSubmission;
