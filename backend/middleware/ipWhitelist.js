/**
 * IP Whitelist Middleware for Admin Routes
 * Restricts access to admin routes to specific IP addresses
 */

const { forbidden } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Create IP whitelist middleware
 * @param {Array<string>} whitelist - Array of allowed IP addresses (IPv4 and IPv6)
 * @returns {Function} Express middleware function
 */
function createIpWhitelistMiddleware(whitelist = []) {
  // Normalize IPs for comparison (handle IPv4-mapped IPv6 addresses)
  const normalizedWhitelist = whitelist.map(ip => {
    // Convert IPv4-mapped IPv6 (::ffff:192.168.1.1) to regular IPv4 (192.168.1.1)
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  });

  return function ipWhitelistMiddleware(req, res, next) {
    // Skip if whitelist is empty (allow all)
    if (normalizedWhitelist.length === 0) {
      return next();
    }

    // Get client IP (trust proxy headers)
    let clientIp = req.ip;

    // Handle IPv4-mapped IPv6 addresses from proxy
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.substring(7);
    }

    // Check if IP is in whitelist
    const isAllowed = normalizedWhitelist.includes(clientIp);

    if (!isAllowed) {
      logger.warn(`Admin access attempt from non-whitelisted IP: ${clientIp}`);
      return forbidden(res, 'Access denied: Your IP address is not authorized for admin access.');
    }

    // IP is allowed, proceed to next middleware
    next();
  };
}

module.exports = { createIpWhitelistMiddleware };