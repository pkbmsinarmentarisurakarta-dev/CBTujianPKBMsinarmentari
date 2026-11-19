import { db, uid } from '../db/sqlite.ts';

export function writeAuditLog(params: {
  schoolId: string;
  actorProfileId?: string | null;
  actorRole: 'ADMIN' | 'SISWA' | 'SYSTEM';
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, school_id, actor_profile_id, actor_role, action, entity_type, entity_id, metadata_json, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid(),
      params.schoolId,
      params.actorProfileId || null,
      params.actorRole,
      params.action,
      params.entityType,
      params.entityId || '',
      JSON.stringify(params.metadata || {}),
      params.ipAddress || ''
    );
  } catch (err) {
    console.error('Gagal menulis audit log:', err);
  }
}
