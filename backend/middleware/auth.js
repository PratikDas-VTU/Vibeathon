const { verifyIdToken } = require("../services/firebaseService");

module.exports = async function (req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify Firebase ID token or custom token
    const decoded = await verifyIdToken(token);

    // ✅ MATCH NEW TOKEN STRUCTURE
    req.team = {
      vccId: decoded.vccId,
      teamNo: decoded.teamNo
    };

    next();
  } catch (err) {
    console.error("Token verification error:", err);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
