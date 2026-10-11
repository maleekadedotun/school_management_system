const mongoose = require("mongoose");

const lessonNoteSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    teacherName: {
      type: String,
      required: true,
    },
    teacherEmail: {
      type: String,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
      required: false,
    },
    subjectName: {
      type: String,
      required: true,
    },
    classLevel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassLevel",
      default: null,
      required: false,
    },
    classLevelName: {
      type: String,
      required: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      default: null,
      required: false,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    subtopic: {
      type: String,
      default: "",
      trim: true,
    },
    week: {
      type: String,
      default: "Week 1",
    },
    duration: {
      type: String,
      default: "45 Minutes",
    },
    lessonDate: {
      type: Date,
      default: Date.now,
    },
    learningObjectives: {
      type: String,
      default: "",
    },
    introduction: {
      type: String,
      default: "",
    },
    lessonContent: {
      type: String,
      default: "",
    },
    activities: {
      type: String,
      default: "",
    },
    teachingMaterials: {
      type: String,
      default: "",
    },
    assessment: {
      type: String,
      default: "",
    },
    conclusion: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["draft", "pending_review", "approved", "rejected"],
      default: "draft",
    },
    sentToStudents: {
      type: Boolean,
      default: false,
    },
    sentAt: {
      type: Date,
    },
    adminFeedback: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const LessonNote = mongoose.model("LessonNote", lessonNoteSchema);
module.exports = LessonNote;
