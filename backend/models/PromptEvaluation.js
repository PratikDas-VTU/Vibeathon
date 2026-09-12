const mongoose = require("mongoose");

const promptEvaluationSchema = new mongoose.Schema({
  promptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Prompt",
    required: true,
    unique: true
  },

  teamId: {
    type: String,
    index: true
  },

  vccId: {
    type: String,
    index: true
  },

  aiScore: {
    type: Number,
    required: true // 0–10
  },

  aiFeedback: {
    type: String,
    required: true
  },

  modelUsed: {
    type: String,
    default: "gemini-pro"
  },

  evaluatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model(
  "PromptEvaluation",
  promptEvaluationSchema
);
