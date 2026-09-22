"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getS3UploadUrl = getS3UploadUrl;
exports.getS3DownloadUrl = getS3DownloadUrl;
exports.deleteStorageObject = deleteStorageObject;
/**
 * routes/storage.ts — S3 presigned URL endpoints
 *
 * POST /api/storage/upload-url   { key, contentType } → { uploadUrl, key }
 * GET  /api/storage/download-url?key=...              → { downloadUrl }
 * DELETE /api/storage/object      { key }             → { success: true }
 *
 * key format: "project-files/{storagePath}" or "project-delivery-files/{storagePath}" or "branding/{filename}"
 */
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const client_s3_2 = require("@aws-sdk/client-s3");
const response_1 = require("../shared/response");
// ── Upload security: allowed MIME types + blocked extensions ─────────────────
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain',
  'text/csv',
  'application/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
  'application/octet-stream',
]);
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.sh', '.bat', '.cmd', '.ps1', '.msi', '.dll', '.so',
  '.vbs', '.jar', '.php', '.phtml', '.asp', '.aspx', '.jsp',
  '.dmg', '.app', '.deb', '.rpm', '.bin',
]);

const BUCKET = process.env.S3_BUCKET || 'delivery-tracker-files-418095506800';
const REGION = process.env.AWS_REGION || 'us-east-2';
const s3 = new client_s3_1.S3Client({ region: REGION });
/** POST /api/storage/upload-url */
async function getS3UploadUrl(body, _user) {
    try {
        const { key, contentType } = body ?? {};
        if (!key)
            return (0, response_1.err)('key is required');
        const safeKey = String(key).replace(/\.{2,}/g, '').replace(/^\//, '');
        // Security: block dangerous file extensions
        const extMatch = safeKey.match(/\.[^.]+$/);
        const ext = extMatch ? extMatch[0].toLowerCase() : '';
        if (BLOCKED_EXTENSIONS.has(ext))
            return (0, response_1.err)('File type not permitted', 400);
        // Security: validate content type whitelist
        const ct = (contentType || '').split(';')[0].trim().toLowerCase();
        if (ct && ct !== 'application/octet-stream' && !ALLOWED_CONTENT_TYPES.has(ct))
            return (0, response_1.err)('Content type not permitted', 400);
        const cmd = new client_s3_2.PutObjectCommand({
            Bucket: BUCKET,
            Key: safeKey,
            ContentType: contentType || 'application/octet-stream',
        });
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, cmd, { expiresIn: 900 }); // 15 min
        return (0, response_1.ok)({ uploadUrl, key: safeKey });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
/** GET /api/storage/download-url?key=... */
async function getS3DownloadUrl(key, _user) {
    try {
        if (!key)
            return (0, response_1.err)('key query param is required');
        const safeKey = String(key).replace(/\.{2,}/g, '').replace(/^\//, '');
        const cmd = new client_s3_2.GetObjectCommand({ Bucket: BUCKET, Key: safeKey });
        const downloadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, cmd, { expiresIn: 3600 }); // 1 hour
        return (0, response_1.ok)({ downloadUrl });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
/** DELETE /api/storage/object — body: { key } or { keys: string[] } */
async function deleteStorageObject(body, _user) {
    try {
        const { key, keys } = body ?? {};
        if (!key && (!keys || !keys.length))
            return (0, response_1.err)('key or keys is required');
        if (keys && Array.isArray(keys) && keys.length > 0) {
            // Batch delete
            const objects = keys.map((k) => ({
                Key: String(k).replace(/\.{2,}/g, '').replace(/^\//, ''),
            }));
            await s3.send(new client_s3_1.DeleteObjectsCommand({
                Bucket: BUCKET,
                Delete: { Objects: objects, Quiet: true },
            }));
        }
        else {
            const safeKey = String(key).replace(/\.{2,}/g, '').replace(/^\//, '');
            await s3.send(new client_s3_1.DeleteObjectCommand({ Bucket: BUCKET, Key: safeKey }));
        }
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
