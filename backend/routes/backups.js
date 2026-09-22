"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBackups = listBackups;
exports.getBackupDownloadUrl = getBackupDownloadUrl;
exports.runBackup = runBackup;

/**
 * routes/backups.js — Database backup browser + Lambda-native backup runner
 *
 * GET  /api/admin/backups                     → list S3 backups/ folder
 * GET  /api/admin/backups/download?key=...    → 15-min pre-signed download URL
 * POST /api/admin/backups/run                 → generate fresh backup now, upload to S3
 *
 * Super-admin only. All routes are hard-gated by isSuperAdmin().
 * Key validation prevents path traversal and access outside the backups/ prefix.
 */

const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { isSuperAdmin } = require('../shared/auth');
const { ok, err, forbidden, serverError } = require('../shared/response');
const { query } = require('../shared/db');
const { gzipSync } = require('zlib');

const BUCKET = process.env.S3_BUCKET || 'delivery-tracker-files-418095506800';
const REGION = process.env.AWS_REGION || 'us-east-2';
const BACKUP_PREFIX = 'backups/';

// Strict allowlist: only files directly under backups/ with .sql.gz extension.
// Prevents path traversal (no .., no nested dirs) and access to non-backup objects.
const BACKUP_KEY_RE = /^backups\/[\w\-\.]+\.sql\.gz$/;

const s3 = new S3Client({ region: REGION });

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts a JS value to a PostgreSQL literal for use in INSERT statements.
 */
function pgLiteral(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return String(val);
    if (val instanceof Date) return `'${val.toISOString().replace(/'/g, "''")}'`;
    if (Buffer.isBuffer(val)) return `'\\x${val.toString('hex')}'`;
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    // string
    return `'${String(val).replace(/'/g, "''")}'`;
}

// ─── Route handlers ──────────────────────────────────────────────────────────

/**
 * GET /api/admin/backups
 * Lists all backup files in S3 backups/ folder. Super-admin only.
 */
async function listBackups(user) {
    if (!isSuperAdmin(user)) return forbidden();
    try {
        const cmd = new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: BACKUP_PREFIX,
            MaxKeys: 100,
        });
        const res = await s3.send(cmd);
        const files = (res.Contents || [])
            .filter(obj => obj.Key && obj.Key !== BACKUP_PREFIX) // skip the folder placeholder itself
            .map(obj => ({
                key: obj.Key,
                filename: obj.Key.replace(BACKUP_PREFIX, ''),
                size: obj.Size || 0,
                lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
            }))
            .sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || '')); // newest first
        return ok({ files });
    } catch (e) {
        return serverError(e);
    }
}

/**
 * GET /api/admin/backups/download?key=backups/filename.sql.gz
 * Returns a 15-minute pre-signed S3 URL for a single backup file.
 * Super-admin only. Key is validated against strict regex before use.
 */
async function getBackupDownloadUrl(key, user) {
    if (!isSuperAdmin(user)) return forbidden();
    if (!key) return err('key query param is required');
    // Strict key validation — blocks path traversal and access outside backups/
    if (!BACKUP_KEY_RE.test(String(key))) {
        return err('Invalid backup key', 400);
    }
    try {
        const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: String(key) });
        const downloadUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 }); // 15 min
        return ok({ downloadUrl });
    } catch (e) {
        return serverError(e);
    }
}

/**
 * POST /api/admin/backups/run
 * Generates a full SQL dump of the Aurora DB and uploads it to S3.
 * Super-admin only. No pg_dump binary required — runs entirely via pg queries.
 *
 * Dump format:
 *   - Disables FK triggers (session_replication_role = replica)
 *   - For each public table: DELETEs existing rows then INSERTs all current rows
 *   - Re-enables FK triggers at end
 *   - Wrapped in a single transaction
 *   - Gzipped before upload
 */
async function runBackup(user) {
    console.log('[runBackup] start, user.role=', user?.role);
    if (!isSuperAdmin(user)) return forbidden();
    try {
        console.log('[runBackup] fetching table list...');
        // 1. Get all user tables in the public schema
        const tablesRes = await query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        const tables = tablesRes.map(r => r.table_name);

        let sql = '';
        sql += `-- ============================================================\n`;
        sql += `-- Delivery Tracker — Full Database Backup\n`;
        sql += `-- Generated: ${new Date().toISOString()}\n`;
        sql += `-- Tables: ${tables.length}\n`;
        sql += `-- ============================================================\n\n`;
        sql += `BEGIN;\n`;
        sql += `SET session_replication_role = replica; -- disable FK trigger checks during restore\n\n`;

        let totalRows = 0;

        for (const table of tables) {
            // Get column names in ordinal order
            const colsRes = await query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position
            `, [table]);
            const cols = colsRes.map(r => r.column_name);
            const colList = cols.map(c => `"${c}"`).join(', ');

            // Get all rows
            const rows = await query(`SELECT * FROM public."${table}"`);

            sql += `-- ─── ${table} (${rows.length} rows) ────────────────────────────\n`;
            sql += `DELETE FROM public."${table}";\n`;

            if (rows.length > 0) {
                // Batch INSERTs in groups of 100 for readable output
                const batchSize = 100;
                for (let i = 0; i < rows.length; i += batchSize) {
                    const batch = rows.slice(i, i + batchSize);
                    const valueLines = batch.map(row => {
                        const vals = cols.map(c => pgLiteral(row[c])).join(', ');
                        return `  (${vals})`;
                    }).join(',\n');
                    sql += `INSERT INTO public."${table}" (${colList}) VALUES\n${valueLines};\n`;
                }
            }
            sql += `\n`;
            totalRows += rows.length;
        }

        sql += `SET session_replication_role = DEFAULT; -- re-enable FK triggers\n`;
        sql += `COMMIT;\n`;
        sql += `-- End of backup — ${totalRows} total rows across ${tables.length} tables\n`;

        // 2. Gzip the SQL
        const compressed = gzipSync(Buffer.from(sql, 'utf8'));

        // 3. Upload to S3
        const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
        const key = `${BACKUP_PREFIX}deliverytracker_${ts}.sql.gz`;

        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: compressed,
            ContentType: 'application/gzip',
            Metadata: {
                tables: String(tables.length),
                rows: String(totalRows),
                generatedAt: new Date().toISOString(),
            },
        }));

        return ok({
            key,
            filename: key.replace(BACKUP_PREFIX, ''),
            size: compressed.length,
            tables: tables.length,
            rows: totalRows,
        });
    } catch (e) {
        console.error('[runBackup] error:', e);
        return serverError(e);
    }
}
