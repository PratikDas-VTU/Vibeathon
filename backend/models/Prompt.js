const mongoose = require("mongoose");

const promptSchema = new mongoose.Schema(
  {
    teamId: {
      type: String,
      index: true
    },

    vccId: {
      type: String,
      index: true
    },

    aiTool: {
      type: String,
      required: true,
      trim: true
    },

    promptText: {
      type: String,
      required: true,
      trim: true
    },

    // 🔒 Immutable submission timestamp (audit-safe)
    submittedAt: {
      type: Date,
      default: Date.now,
      immutable: true
    }
  },
  {
    versionKey: false // removes __v (cleaner, audit-friendly)
  }
);

module.exports = mongoose.model("Prompt", promptSchema);

