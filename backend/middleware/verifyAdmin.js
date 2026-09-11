const { verifyIdToken } = require("../services/firebaseService");

module.exports = async function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Admin token missing" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = await verifyIdToken(token);

    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    console.error("Admin token verification error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
