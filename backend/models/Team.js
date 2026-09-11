const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,
    college: String
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    vccId: {
      type: String,
      required: true,
      unique: true
    },

    teamNo: {
      type: Number,
      required: true
    },

    teamSize: {
      type: Number,
      required: true
    },

    members: {
      type: [memberSchema],
      required: true
    },

    // Flat fields for authentication (M1 = Leader)
    M1_Name: {
      type: String,
      required: true
    },

    M1_Email: {
      type: String,
      required: true,
      index: true // For login queries
    },

    M1_Phone: {
      type: String,
      required: true
    },

    M1_College: {
      type: String,
      required: true
    },

    // Optional M2 fields
    M2_Name: String,
    M2_Email: String,
    M2_Phone: String,
    M2_College: String,

    // Admin dashboard display fields
    leaderName: {
      type: String,
      required: true
    },

    email: {
      type: String,
      required: true
    },

    phone: {
      type: String,
      required: true
    },

    college: {
      type: String,
      required: true
    },

    passwordHash: {
      type: String,
      required: true
    },

    hackathonStart: {
      type: Date,
      default: null
    },

    githubUrl: {
      type: String,
      default: null
    },

    deploymentUrl: {
      type: String,
      default: null
    },

    sessionEnded: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Team", teamSchema);
