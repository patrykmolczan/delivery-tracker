"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUploadUrl = getUploadUrl;
exports.getDownloadUrl = getDownloadUrl;
exports.getProjectFiles = getProjectFiles;
exports.createProjectFile = createProjectFile;
exports.deleteProjectFile = deleteProjectFile;
exports.getDeliveryFiles = getDeliveryFiles;
exports.createDeliveryFile = createDeliveryFile;
exports.updateDeliveryFile = updateDeliveryFile;
exports.deleteDeliveryFile = deleteDeliveryFile;
exports.trackDownload = trackDownload;
exports.getDownloadHistory = getDownloadHistory;
exports.getDeliveryNotes = getDeliveryNotes;
exports.createDeliveryNote = createDeliveryNote;
exports.updateDeliveryNote = updateDeliveryNote;
exports.deleteDeliveryNote = deleteDeliveryNote;
/**
 * routes/delivery.ts — delivery files, delivery notes, project files, S3 presigned URLs
 */
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION ?? 'us-east-2' });
const S3_BUCKET = process.env.S3_BUCKET ?? 'delivery-tracker-files-418095506800';
// ── Presigned upload URL ──────────────────────────────────────────────────────
async function getUploadUrl(body, user) {
    try {
        const { key, content_type } = body;
        if (!key)
            return (0, response_1.err)('key required');
        const cmd = new client_s3_1.PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            ContentType: content_type ?? 'application/octet-stream',
        });
        const url = await (0, s3_request_presigner_1.getSignedUrl)(s3, cmd, { expiresIn: 300 });
        return (0, response_1.ok)({ url, key });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function getDownloadUrl(body, _user) {
    try {
        const { key } = body;
        if (!key)
            return (0, response_1.err)('key required');
        const cmd = new client_s3_1.GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
        const url = await (0, s3_request_presigner_1.getSignedUrl)(s3, cmd, { expiresIn: 3600 });
        return (0, response_1.ok)({ url });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Project Files ─────────────────────────────────────────────────────────────
async function getProjectFiles(projectId, _user) {
    try {
        const rows = await (0, db_1.query)(`SELECT pf.*, p.full_name as uploader_name, p.email as uploader_email
       FROM public.project_files pf
       LEFT JOIN public.profiles p ON p.id = pf.uploaded_by
       WHERE pf.project_id=$1 AND pf.deleted_at IS NULL
       ORDER BY pf.created_at DESC`, [projectId]);
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function createProjectFile(projectId, body, user) {
    try {
        const prof = await (0, db_1.queryOne)('SELECT id FROM public.profiles WHERE cognito_id=$1', [user.sub]);
        const profileId = prof?.id ?? user.sub;
        const row = await (0, db_1.queryOne)(`INSERT INTO public.project_files (project_id, file_name, file_size, file_type, storage_path, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [projectId, body.file_name, body.file_size, body.file_type, body.storage_path, profileId]);
        return (0, response_1.ok)(row, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function deleteProjectFile(fileId, _body, _user) {
    try {
        const row = await (0, db_1.queryOne)('SELECT storage_path FROM public.project_files WHERE id=$1', [fileId]);
        if (!row)
            return (0, response_1.notFound)('File');
        await (0, db_1.query)('DELETE FROM public.project_files WHERE id=$1', [fileId]);
        // Best-effort S3 delete
        try {
            await s3.send(new client_s3_1.DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.storage_path }));
        }
        catch { /* best effort */ }
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Delivery Files ────────────────────────────────────────────────────────────
async function getDeliveryFiles(projectId, _user) {
    try {
        const rows = await (0, db_1.query)(`SELECT df.*, p.full_name as uploader_name, p.email as uploader_email
       FROM public.project_delivery_files df
       LEFT JOIN public.profiles p ON p.id = df.uploaded_by
       WHERE df.project_id=$1
       ORDER BY df.uploaded_at DESC`, [projectId]);
        if (!rows.length)
            return (0, response_1.ok)([]);
        const ids = rows.map(r => r.id);
        const ph = ids.map((_, i) => `$${i + 1}`).join(',');
        const dlRows = await (0, db_1.query)(`SELECT file_id FROM public.delivery_file_downloads WHERE file_id IN (${ph})`, ids);
        const countMap = {};
        dlRows.forEach(r => { countMap[r.file_id] = (countMap[r.file_id] || 0) + 1; });
        return (0, response_1.ok)(rows.map(r => ({ ...r, download_count: countMap[r.id] || 0 })));
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function createDeliveryFile(projectId, body, user) {
    try {
        const prof = await (0, db_1.queryOne)('SELECT id FROM public.profiles WHERE cognito_id=$1', [user.sub]);
        const profileId = prof?.id ?? user.sub;
        const row = await (0, db_1.queryOne)(`INSERT INTO public.project_delivery_files (project_id, file_name, file_size, file_type, storage_path, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [projectId, body.file_name, body.file_size, body.file_type, body.storage_path, profileId]);
        return (0, response_1.ok)(row, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function updateDeliveryFile(fileId, body, _user) {
    try {
        const parts = ['updated_at=NOW()'];
        const params = [];
        if (body.file_name !== undefined) {
            params.push(body.file_name);
            parts.push(`file_name=$${params.length}`);
        }
        if (body.description !== undefined) {
            params.push(body.description);
            parts.push(`description=$${params.length}`);
        }
        params.push(fileId);
        await (0, db_1.query)(`UPDATE public.project_delivery_files SET ${parts.join(',')} WHERE id=$${params.length}`, params);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function deleteDeliveryFile(fileId, _body, _user) {
    try {
        const row = await (0, db_1.queryOne)('SELECT storage_path FROM public.project_delivery_files WHERE id=$1', [fileId]);
        if (row) {
            await (0, db_1.query)('DELETE FROM public.project_delivery_files WHERE id=$1', [fileId]);
            try {
                await s3.send(new client_s3_1.DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.storage_path }));
            }
            catch { /* best effort */ }
            return (0, response_1.ok)({ success: true });
        }
        // Fallback: frontend "Files" tab uses this same endpoint but the ID
        // may belong to public.project_files instead of project_delivery_files.
        const pfRow = await (0, db_1.queryOne)('SELECT storage_path FROM public.project_files WHERE id=$1', [fileId]);
        if (!pfRow)
            return (0, response_1.notFound)('File');
        await (0, db_1.query)('DELETE FROM public.project_files WHERE id=$1', [fileId]);
        try {
            await s3.send(new client_s3_1.DeleteObjectCommand({ Bucket: S3_BUCKET, Key: pfRow.storage_path }));
        }
        catch { /* best effort */ }
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function trackDownload(fileId, body, user) {
    try {
        const prof = await (0, db_1.queryOne)('SELECT id, email, full_name FROM public.profiles WHERE cognito_id=$1', [user.sub]);
        const profileId = prof?.id ?? user.sub;
        await (0, db_1.query)('INSERT INTO public.delivery_file_downloads (file_id, project_id, downloaded_by, downloaded_by_email, downloaded_by_name) VALUES ($1,$2,$3,$4,$5)', [fileId, body.project_id, profileId, prof?.email ?? null, prof?.full_name ?? null]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function getDownloadHistory(fileId, _user) {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM public.delivery_file_downloads WHERE file_id=$1 ORDER BY downloaded_at DESC LIMIT 50', [fileId]);
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Delivery Notes ────────────────────────────────────────────────────────────
async function getDeliveryNotes(projectId, _user) {
    try {
        const notes = await (0, db_1.query)('SELECT * FROM public.project_delivery_notes WHERE project_id=$1 ORDER BY created_at DESC', [projectId]);
        if (!notes.length)
            return (0, response_1.ok)([]);
        const userIds = [...new Set([
                ...notes.map(n => n.created_by).filter(Boolean),
                ...notes.map(n => n.updated_by).filter(Boolean),
            ])];
        let profileMap = {};
        if (userIds.length) {
            const ph = userIds.map((_, i) => `$${i + 1}`).join(',');
            const profiles = await (0, db_1.query)('SELECT id, full_name, role FROM public.profiles WHERE id IN (' + ph + ')', userIds);
            profiles.forEach((p) => { profileMap[p.id] = p; });
        }
        return (0, response_1.ok)(notes.map(n => ({
            ...n,
            author_name: n.created_by ? profileMap[n.created_by]?.full_name ?? null : null,
            author_role: n.created_by ? profileMap[n.created_by]?.role ?? null : null,
            updater_name: n.updated_by ? profileMap[n.updated_by]?.full_name ?? null : null,
        })));
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function createDeliveryNote(projectId, body, user) {
    try {
        const prof = await (0, db_1.queryOne)('SELECT id, full_name, role FROM public.profiles WHERE cognito_id=$1', [user.sub]);
        const profileId = prof?.id ?? user.sub;
        const note = await (0, db_1.queryOne)('INSERT INTO public.project_delivery_notes (project_id, note, created_by) VALUES ($1,$2,$3) RETURNING *', [projectId, body.note?.trim(), profileId]);
        const profile = prof;
        return (0, response_1.ok)({ ...note, author_name: profile?.full_name ?? null, author_role: profile?.role ?? null, updater_name: null }, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function updateDeliveryNote(noteId, body, user) {
    try {
        const prof = await (0, db_1.queryOne)('SELECT id FROM public.profiles WHERE cognito_id=$1', [user.sub]);
        const profileId = prof?.id ?? user.sub;
        await (0, db_1.query)('UPDATE public.project_delivery_notes SET note=$1, updated_at=NOW(), updated_by=$2 WHERE id=$3', [body.note?.trim(), profileId, noteId]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function deleteDeliveryNote(noteId, _body, _user) {
    try {
        await (0, db_1.query)('DELETE FROM public.project_delivery_notes WHERE id=$1', [noteId]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
