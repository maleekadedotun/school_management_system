const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
    },
    classLevel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassLevel",
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
    },
    academicTerm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicTerm",
    },
    academicYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
    },
    dueDate: {
      type: Date,
    },
    dueTime: {
      type: String,
      default: "23:59",
    },
    totalMarks: {
      type: Number,
      default: 100,
    },
    passMark: {
      type: Number,
      default: 50,
    },
    status: {
      type: String,
      enum: ["draft", "published", "active", "closed"],
      default: "draft",
    },
    // Supporting teacher dropping documents, question papers, guides, links
    attachment: {
      url: { type: String, default: "" },
      filename: { type: String, default: "" },
      fileType: { type: String, default: "" },
      size: { type: Number, default: 0 },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "creatorModel",
      required: true,
    },
    creatorModel: {
      type: String,
      required: true,
      enum: ["Teacher", "Admin"],
      default: "Teacher",
    },
    submissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AssignmentSubmission",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for submission count
assignmentSchema.virtual("totalSubmissions").get(function () {
  return this.submissions ? this.submissions.length : 0;
});

const Assignment = mongoose.model("Assignment", assignmentSchema);

module.exports = Assignment;
