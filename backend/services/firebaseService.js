const { db, auth } = require("../firebaseConfig");


/**
 * Firebase Service Layer
 * Centralized database operations for teams, admins, prompts, and evaluations
 */

// ==================== TEAM OPERATIONS ====================

/**
 * Get team by vccId
 */
async function getTeamByVccId(vccId) {
    const snapshot = await db.ref(`teams/${vccId}`).once("value");
    return snapshot.val();
}

/**
 * Get team by email (M1_Email)
 */
async function getTeamByEmail(email) {
    const snapshot = await db.ref("teams")
        .orderByChild("M1_Email")
        .equalTo(email)
        .once("value");

    const teams = snapshot.val();
    if (!teams) return null;

    // Return first match
    const vccId = Object.keys(teams)[0];
    return teams[vccId];
}

/**
 * Get all teams
 */
async function getAllTeams() {
    const snapshot = await db.ref("teams").once("value");
    const teamsObj = snapshot.val();

    if (!teamsObj) return [];

    // Convert object to array
    return Object.keys(teamsObj).map(vccId => ({
        ...teamsObj[vccId],
        vccId
    }));
}

/**
 * Update team data
 */
async function updateTeam(vccId, updates) {
    updates.updatedAt = new Date().toISOString();
    await db.ref(`teams/${vccId}`).update(updates);
}

/**
 * Create team
 */
async function createTeam(teamData) {
    const { vccId } = teamData;
    teamData.createdAt = new Date().toISOString();
    teamData.updatedAt = new Date().toISOString();

    await db.ref(`teams/${vccId}`).set(teamData);
    return teamData;
}

// ==================== ADMIN OPERATIONS ====================

/**
 * Get admin by username
 */
async function getAdminByUsername(username) {
    const snapshot = await db.ref("admins")
        .orderByChild("username")
        .equalTo(username.toLowerCase())
        .once("value");

    const admins = snapshot.val();
    if (!admins) return null;

    const adminId = Object.keys(admins)[0];
    return { ...admins[adminId], id: adminId };
}

/**
 * Create admin
 */
async function createAdmin(adminData) {
    const adminRef = db.ref("admins").push();
    adminData.createdAt = new Date().toISOString();

    await adminRef.set(adminData);
    return { ...adminData, id: adminRef.key };
}

// ==================== PROMPT OPERATIONS ====================

/**
 * Create prompt
 */
async function createPrompt(promptData) {
    const promptRef = db.ref("prompts").push();
    promptData.submittedAt = new Date().toISOString();

    await promptRef.set(promptData);
    return { ...promptData, id: promptRef.key };
}

/**
 * Get prompts by vccId
 */
async function getPromptsByVccId(vccId) {
    const snapshot = await db.ref("prompts")
        .orderByChild("vccId")
        .equalTo(vccId)
        .once("value");

    const promptsObj = snapshot.val();
    if (!promptsObj) return [];

    return Object.keys(promptsObj).map(id => ({
        ...promptsObj[id],
        _id: id
    }));
}

/**
 * Get all prompts
 */
async function getAllPrompts() {
    const snapshot = await db.ref("prompts").once("value");
    const promptsObj = snapshot.val();

    if (!promptsObj) return [];

    return Object.keys(promptsObj).map(id => ({
        ...promptsObj[id],
        _id: id
    })).sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
}

// ==================== PROMPT EVALUATION OPERATIONS ====================

/**
 * Create prompt evaluation
 */
async function createPromptEvaluation(evaluationData) {
    const evalRef = db.ref("promptEvaluations").push();
    evaluationData.evaluatedAt = new Date().toISOString();

    await evalRef.set(evaluationData);
    return { ...evaluationData, id: evalRef.key };
}

/**
 * Get all prompt evaluations
 */
async function getAllPromptEvaluations() {
    const snapshot = await db.ref("promptEvaluations").once("value");
    const evalsObj = snapshot.val();

    if (!evalsObj) return [];

    return Object.keys(evalsObj).map(id => ({
        ...evalsObj[id],
        _id: id
    }));
}

/**
 * Get evaluated prompt IDs
 */
async function getEvaluatedPromptIds() {
    const snapshot = await db.ref("promptEvaluations").once("value");
    const evalsObj = snapshot.val();

    if (!evalsObj) return [];

    return Object.values(evalsObj).map(evaluation => evaluation.promptId);
}

// ==================== FIREBASE AUTH OPERATIONS ====================

/**
 * Create Firebase user for team
 */
async function createTeamUser(email, phone) {
    try {
        const userRecord = await auth.createUser({
            email: email,
            password: phone,
            emailVerified: true
        });

        return userRecord;
    } catch (error) {
        console.error("Error creating team user:", error);
        throw error;
    }
}

/**
 * Create Firebase user for admin
 */
async function createAdminUser(email, password) {
    try {
        const userRecord = await auth.createUser({
            email: email,
            password: password,
            emailVerified: true
        });

        // Set custom claims for admin role
        await auth.setCustomUserClaims(userRecord.uid, { role: "admin" });

        return userRecord;
    } catch (error) {
        console.error("Error creating admin user:", error);
        throw error;
    }
}

/**
 * Verify Firebase ID token
 */
async function verifyIdToken(idToken) {
    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        return decodedToken;
    } catch (error) {
        console.error("Error verifying token:", error);
        throw error;
    }
}

/**
 * Create custom token with claims
 */
async function createCustomToken(uid, claims = {}) {
    try {
        const customToken = await auth.createCustomToken(uid, claims);
        return customToken;
    } catch (error) {
        console.error("Error creating custom token:", error);
        throw error;
    }
}

module.exports = {
    // Team operations
    getTeamByVccId,
    getTeamByEmail,
    getAllTeams,
    updateTeam,
    createTeam,

    // Admin operations
    getAdminByUsername,
    createAdmin,

    // Prompt operations
    createPrompt,
    getPromptsByVccId,
    getAllPrompts,

    // Prompt evaluation operations
    createPromptEvaluation,
    getAllPromptEvaluations,
    getEvaluatedPromptIds,

    // Firebase Auth operations
    createTeamUser,
    createAdminUser,
    verifyIdToken,
    createCustomToken
};
