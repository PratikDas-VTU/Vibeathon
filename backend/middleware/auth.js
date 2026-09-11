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

    let vccId = decoded.vccId;
    let teamNo = decoded.teamNo;

    // Fallback: If custom claims are not baked into token, lookup team by email
    if (!vccId && decoded.email) {
      const { getTeamByEmail } = require("../services/firebaseService");
      const team = await getTeamByEmail(decoded.email);
      if (team) {
        vccId = team.vccId;
        teamNo = team.teamNo;
      }
    }

    req.team = {
      vccId,
      teamNo,
      email: decoded.email
    };

    next();

  } catch (err) {
    console.error("Token verification error:", err);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
