'use strict';
const { HttpError } = require('../lib/util');

/**
 * Oddiy xotiradagi so'rov limiti (qo'shimcha paketsiz).
 * @param {{windowMs:number, max:number, message?:string, key?:(req)=>string}} opts
 */
function rateLimit({ windowMs, max, message, key }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, Math.max(windowMs, 10000));
  timer.unref();

  return (req, res, next) => {
    const k = key ? key(req) : req.ip;
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return next(new HttpError(429, message || "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring."));
    }
    next();
  };
}

module.exports = { rateLimit };
