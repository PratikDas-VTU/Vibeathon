const admin = require("firebase-admin");

const fs = require("fs");
const path = require("path");

// Load Firebase Service Account credentials safely:
// 1. In production on Render: via FIREBASE_SERVICE_ACCOUNT env var (JSON string)
// 2. In Render Secret Files: via FIREBASE_SERVICE_ACCOUNT_PATH (e.g., /etc/secrets/firebase-service-account.json)
// 3. In local development: via local firebase-service-account.json
let serviceAccount = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log("✅ Using Firebase credentials from FIREBASE_SERVICE_ACCOUNT env var");
    } catch (err) {
        console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", err.message);
    }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
    serviceAccount = require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
    console.log("✅ Using Firebase credentials from Render Secret File:", process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
} else {
    const localFile = path.join(__dirname, "firebase-service-account.json");
    if (fs.existsSync(localFile)) {
        serviceAccount = require(localFile);
        console.log("✅ Using Firebase credentials from local file");
    } else {
        console.warn("⚠️ Warning: No Firebase credentials found. Please set FIREBASE_SERVICE_ACCOUNT or mount Secret File in Render.");
    }
}

const databaseURL = process.env.FIREBASE_DATABASE_URL || "https://vccvibeathon-d6ff0-default-rtdb.firebaseio.com";

// Initialize Firebase Admin SDK
if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL
    });
} else {
    try {
        admin.initializeApp({ databaseURL });
    } catch (err) {
        console.error("❌ Firebase Admin SDK initialization failed:", err.message);
    }
}

// Export Firebase services
const db = admin.database();
const auth = admin.auth();

module.exports = {
    admin,
    db,
    auth
};
