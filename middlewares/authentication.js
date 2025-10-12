const { validateToken } = require("../services/authentication");

function checkForAuthenticationCookie(cookieName) {
  return (req, res, next) => {
    const tokenCookieValue = req.cookies[cookieName];
    if (!tokenCookieValue) {
      return next();
    }

    try {
      const userPayLoad = validateToken(tokenCookieValue);
      req.user = userPayLoad;
    } catch (error) {}
    return next();
  };
}

function requireAdmin(req, res, next) {
  // First check if user is authenticated
  if (!req.user) {
    return res.status(401).redirect("/user/signin");
  }

  // Then check if user has admin role
  if (req.user.role !== "ADMIN") {
    return res.status(403).render("error", {
      message: "Access Denied. Admin privileges required.",
      user: req.user,
    });
  }

  // User is authenticated and has admin role
  next();
}

// ALSO ADD THIS OPTIONAL HELPER FOR MULTIPLE ROLES 👇
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).redirect("/user/signin");
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).render("error", {
        message: "Access Denied. Insufficient permissions.",
        user: req.user,
      });
    }

    next();
  };
}

module.exports = {
  checkForAuthenticationCookie,
  requireAdmin, // Export the new admin middleware
  requireRole, // Export the flexible role middleware
};
