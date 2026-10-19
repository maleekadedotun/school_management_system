const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    targetAudience: {
      type: String,
      enum: ["teacher", "student", "parent", "general"],
      required: true,
      default: "general",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    category: {
      type: String,
      enum: ["general", "academic", "administrative", "event", "emergency"],
      default: "general",
    },
    status: {
      type: String,
      enum: ["active", "archived", "draft"],
      default: "active",
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    createdByName: {
      type: String,
      default: "School Administration",
    },
  },
  {
    timestamps: true,
  }
);

// Index for high performance marquee queries
announcementSchema.index({ targetAudience: 1, status: 1, createdAt: -1 });

const Announcement = mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema);

module.exports = Announcement;
