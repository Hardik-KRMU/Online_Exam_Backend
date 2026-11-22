const { AuditLog } = require('../models');
const { getPagination, buildMeta } = require('../utils/pagination');

async function listAuditLogs(query, extraFilter = {}) {
  const { page, limit, skip } = getPagination(query);
  const filter = { ...extraFilter };
  if (query.action) filter.action = query.action;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.entityId) filter.entityId = query.entityId;
  if (query.actor) filter.actor = query.actor;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = query.from;
    if (query.to) filter.createdAt.$lte = query.to;
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter).populate('actor', 'name email role').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items: items.map((log) => ({
      id: String(log._id),
      action: log.action,
      actor: log.actor
        ? { id: String(log.actor._id), name: log.actor.name, email: log.actor.email, role: log.actor.role }
        : null,
      actorRole: log.actorRole,
      entityType: log.entityType,
      entityId: log.entityId ? String(log.entityId) : null,
      metadata: log.metadata,
      ip: log.ip,
      createdAt: log.createdAt,
    })),
    meta: buildMeta({ page, limit }, total),
  };
}

module.exports = { listAuditLogs };
