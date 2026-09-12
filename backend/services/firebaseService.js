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

// ==================== MANAGEMENT & CREDENTIAL OPERATIONS ====================

/**
 * Update team credentials & data in RTDB and Firebase Auth
 */
async function updateTeamCredentials(vccId, updates) {
    const existing = await getTeamByVccId(vccId);
    if (!existing) {
        throw new Error(`Team ${vccId} not found`);
    }

    const oldEmail = existing.M1_Email;
    const newEmail = updates.M1_Email || oldEmail;
    const newPassword = updates.password || updates.M1_Phone;

    // 1. Sync with Firebase Authentication if email or password/phone changed
    if (newPassword || (newEmail && newEmail !== oldEmail)) {
        try {
            let userRecord;
            try {
                userRecord = await auth.getUserByEmail(oldEmail);
            } catch (err) {
                // User may not exist in Firebase Auth yet, try creating
                if (err.code === "auth/user-not-found") {
                    userRecord = await auth.createUser({
                        email: newEmail,
                        password: String(newPassword || existing.M1_Phone || "12345678"),
                        emailVerified: true
                    });
                } else {
                    throw err;
                }
            }

            if (userRecord) {
                const authUpdates = {};
                if (newEmail && newEmail !== oldEmail) authUpdates.email = newEmail;
                if (newPassword) authUpdates.password = String(newPassword);
                if (Object.keys(authUpdates).length > 0) {
                    await auth.updateUser(userRecord.uid, authUpdates);
                }
            }
        } catch (authErr) {
            console.warn(`[updateTeamCredentials] Warning during Firebase Auth update for ${vccId}:`, authErr.message);
        }
    }

    // 2. Prepare RTDB updates
    const rtdbUpdates = { ...updates };
    delete rtdbUpdates.password; // Don't store raw password field if phone is used
    if (newPassword && !rtdbUpdates.M1_Phone) {
        rtdbUpdates.M1_Phone = String(newPassword);
    }
    rtdbUpdates.updatedAt = new Date().toISOString();

    await db.ref(`teams/${vccId}`).update(rtdbUpdates);
    return await getTeamByVccId(vccId);
}

/**
 * Delete a team from both RTDB and Firebase Auth
 */
async function deleteTeam(vccId) {
    const team = await getTeamByVccId(vccId);
    if (!team) {
        throw new Error(`Team ${vccId} not found`);
    }

    if (team.M1_Email) {
        try {
            const userRecord = await auth.getUserByEmail(team.M1_Email);
            if (userRecord) {
                await auth.deleteUser(userRecord.uid);
            }
        } catch (err) {
            console.warn(`[deleteTeam] Firebase Auth user delete warning for ${vccId}:`, err.message);
        }
    }

    await db.ref(`teams/${vccId}`).remove();
    return true;
}

/**
 * Reset single team hackathon session
 */
async function resetSingleTeamSession(vccId) {
    const updates = {
        hackathonStart: null,
        githubUrl: null,
        deploymentUrl: null,
        sessionEnded: false,
        updatedAt: new Date().toISOString()
    };
    await db.ref(`teams/${vccId}`).update(updates);
    return updates;
}

/**
 * Reset all teams sessions in production database
 */
async function resetAllTeamSessions() {
    const snapshot = await db.ref("teams").once("value");
    const teams = snapshot.val() || {};
    const teamKeys = Object.keys(teams);

    const resetPayload = {
        hackathonStart: null,
        githubUrl: null,
        deploymentUrl: null,
        sessionEnded: false,
        updatedAt: new Date().toISOString()
    };

    let count = 0;
    for (const vccId of teamKeys) {
        await db.ref(`teams/${vccId}`).update(resetPayload);
        count++;
    }

    return { totalReset: count };
}

/**
 * Batch generate N demo teams for testing
 */
async function generateDemoTeams(count = 3, prefix = "DEMO", defaultPassword = "demo12345") {
    const createdTeams = [];
    const safeCount = Math.min(Math.max(1, parseInt(count) || 3), 30); // Max 30 at a time

    // Fetch existing teams to calculate highest existing demo ID and team number
    const snapshot = await db.ref("teams").once("value");
    const existingTeams = snapshot.val() || {};

    let maxNum = 100;
    let maxTeamNo = 9000;
    let maxLeadIndex = 0;

    const prefixUpper = (prefix || "DEMO").toUpperCase();
    const prefixRegex = new RegExp(`^${prefixUpper}(\\d+)$`, "i");

    for (const vccId of Object.keys(existingTeams)) {
        const team = existingTeams[vccId];
        const match = vccId.match(prefixRegex);
        if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
        if (team && (team.isDemo === true || vccId.toUpperCase().startsWith(prefixUpper))) {
            if (team.teamNo && !isNaN(team.teamNo) && team.teamNo > maxTeamNo) {
                maxTeamNo = team.teamNo;
            }
            if (team.M1_Name) {
                const leadMatch = team.M1_Name.match(/Demo\s+Lead\s+(\d+)/i);
                if (leadMatch) {
                    const leadNum = parseInt(leadMatch[1], 10);
                    if (!isNaN(leadNum) && leadNum > maxLeadIndex) {
                        maxLeadIndex = leadNum;
                    }
                }
            }
        }
    }

    if (maxNum > 100 && maxLeadIndex < (maxNum - 100)) {
        maxLeadIndex = maxNum - 100;
    }

    for (let i = 1; i <= safeCount; i++) {
        const currentNum = maxNum + i;
        const numStr = String(currentNum);
        const vccId = `${prefixUpper}${numStr}`;
        const email = `demo_${prefixUpper.toLowerCase()}_${numStr}@vibeathon.internal`;
        const leadIndex = maxLeadIndex + i;

        const teamData = {
            vccId,
            teamNo: maxTeamNo + i,
            teamSize: 2,
            college: "Vibeathon Sandbox Academy",
            M1_Name: `Demo Lead ${leadIndex}`,
            M1_Email: email,
            M1_Phone: defaultPassword,
            M1_Branch: "AI & Cyber Security",
            M2_Name: `Demo Builder ${leadIndex}`,
            M2_Email: `builder_${numStr}@vibeathon.internal`,
            M2_Phone: "9876543210",
            sessionEnded: false,
            hackathonStart: null,
            githubUrl: null,
            deploymentUrl: null,
            isDemo: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Create in Firebase Auth
        try {
            let userRecord;
            try {
                userRecord = await auth.getUserByEmail(email);
                await auth.updateUser(userRecord.uid, { password: defaultPassword });
            } catch (err) {
                userRecord = await auth.createUser({
                    email,
                    password: defaultPassword,
                    emailVerified: true
                });
            }

            if (userRecord) {
                await auth.setCustomUserClaims(userRecord.uid, {
                    vccId,
                    teamNo: teamData.teamNo,
                    role: "participant"
                });
            }
        } catch (authErr) {
            console.warn(`[generateDemoTeams] Auth warning for ${email}:`, authErr.message);
        }

        // Save to RTDB
        await db.ref(`teams/${vccId}`).set(teamData);

        createdTeams.push({
            vccId,
            email,
            password: defaultPassword,
            leader: teamData.M1_Name
        });
    }

    return createdTeams;
}

/**
 * Batch purge all demo teams
 */
async function purgeDemoTeams(prefix = "DEMO") {
    const snapshot = await db.ref("teams").once("value");
    const teams = snapshot.val() || {};
    let deletedCount = 0;

    for (const vccId of Object.keys(teams)) {
        const team = teams[vccId];
        if (vccId.startsWith(prefix) || team.isDemo === true) {
            if (team.M1_Email) {
                try {
                    const userRecord = await auth.getUserByEmail(team.M1_Email);
                    if (userRecord) await auth.deleteUser(userRecord.uid);
                } catch (e) {
                    // Ignore not found
                }
            }
            await db.ref(`teams/${vccId}`).remove();
            deletedCount++;
        }
    }

    return { deletedCount };
}

/**
 * Get platform settings
 */
async function getSettings() {
    const snap = await db.ref("settings").once("value");
    return snap.val() || {};
}

/**
 * Update platform settings
 */
async function updateSettings(updates) {
    updates.updatedAt = new Date().toISOString();
    await db.ref("settings").update(updates);
    return await getSettings();
}

/**
 * Record system audit log
 */
async function logActivity(action, details, adminUser = "Admin") {
    try {
        const logRef = db.ref("systemLogs").push();
        const logEntry = {
            action,
            details,
            adminUser,
            timestamp: new Date().toISOString()
        };
        await logRef.set(logEntry);
        return { ...logEntry, id: logRef.key };
    } catch (err) {
        console.warn("[logActivity] Failed to write log:", err.message);
    }
}

/**
 * Get latest audit logs
 */
async function getAuditLogs(limit = 60) {
    try {
        const snap = await db.ref("systemLogs")
            .limitToLast(limit)
            .once("value");
        const logsObj = snap.val() || {};
        return Object.keys(logsObj)
            .map(id => ({ ...logsObj[id], id }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (err) {
        console.warn("[getAuditLogs] Failed to fetch logs:", err.message);
        return [];
    }
}

/**
 * Update Admin Password in Firebase Auth
 */
async function updateAdminPassword(username, newPassword) {
    const admin = await getAdminByUsername(username);
    const email = admin?.email || `${username}@vibeathon.internal`;

    const userRecord = await auth.getUserByEmail(email);
    await auth.updateUser(userRecord.uid, { password: newPassword });
    return true;
}

module.exports = {
    // Team operations
    getTeamByVccId,
    getTeamByEmail,
    getAllTeams,
    updateTeam,
    createTeam,
    updateTeamCredentials,
    deleteTeam,
    resetSingleTeamSession,
    resetAllTeamSessions,
    generateDemoTeams,
    purgeDemoTeams,

    // Admin operations
    getAdminByUsername,
    createAdmin,
    updateAdminPassword,

    // Settings & Logs
    getSettings,
    updateSettings,
    logActivity,
    getAuditLogs,

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

