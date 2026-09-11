/**
 * Administrative Utility: Create an Admin Account
 * Reads credentials securely from environment variables.
 * Usage:
 *   ADMIN_USERNAME=admin1 ADMIN_PASSWORD=your_secure_password node scripts/create-admin.example.js
 */

require("dotenv").config();
const { auth } = require("../firebaseConfig");
const { createAdmin, createAdminUser } = require("../services/firebaseService");

const username = (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const email = process.env.ADMIN_EMAIL || `${username}@vibeathon.internal`;

if (!username || !password) {
    console.error("❌ Error: ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required.");
    console.error("Example: ADMIN_USERNAME=superadmin ADMIN_PASSWORD=MySecretPassword123 node scripts/create-admin.example.js");
    process.exit(1);
}

async function run() {
    try {
        console.log(`🔐 Creating admin account: ${username} (${email})...`);
        
        // 1. Create Firebase Auth user
        const userRecord = await createAdminUser(email, password);
        console.log(`✅ Firebase Auth user created: ${userRecord.uid}`);

        // 2. Register in Database
        const adminDoc = await createAdmin({
            username,
            email,
            role: "admin"
        });
        console.log(`✅ Admin entry created in database with ID: ${adminDoc.id}`);

        console.log("🎉 Admin created successfully! You can now log into the admin portal.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to create admin:", err.message);
        process.exit(1);
    }
}

run();
