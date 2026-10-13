const mongoose = require("mongoose");

const parentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: String,
      default: "parent",
    },
    parentId: {
      type: String,
      required: true,
      unique: true,
      default: function () {
        return (
          "PAR" +
          Math.floor(100 + Math.random() * 900) +
          Date.now().toString().slice(-4) +
          (this.name ? this.name.split(" ").map((n) => n[0]).join("").toUpperCase() : "")
        );
      },
    },
    children: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
      },
    ],
    isSuspended: {
      type: Boolean,
      default: false,
    },
    passwordResetToken: {
      type: String,
    },
    passwordResetExpires: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
parentSchema.index({ children: 1 });

const Parent = mongoose.model("Parent", parentSchema);
module.exports = Parent;
