"use strict";
/**
 * api/index.ts — Lambda entry point, HTTP router
 * All /api/* requests route here via API Gateway or Function URL.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const auth_1 = require("./shared/auth");
const response_1 = require("./shared/response");
// ── Route handlers ────────────────────────────────────────────────────────────
const projects_1 = require("./routes/projects");
const analysts_1 = require("./routes/analysts");
const clients_1 = require("./routes/clients");
const notifications_1 = require("./routes/notifications");
const feedback_1 = require("./routes/feedback");
const delivery_1 = require("./routes/delivery");
const eta_1 = require("./routes/eta");
const settings_1 = require("./routes/settings");
const lookups_1 = require("./routes/lookups");
const chat_1 = require("./routes/chat");
const aiChat_1 = require("./routes/aiChat");
const storage_1 = require("./routes/storage");
const sendNotification_1 = require("./routes/sendNotification");
const profile_1 = require("./routes/profile");
const users_1 = require("./routes/users");
const analyzeTemplate_1 = require("./routes/analyzeTemplate");
const generateDescriptions_1 = require("./routes/generateDescriptions");
const sendWelcome_1 = require("./routes/sendWelcome");
const forgotPassword_1 = require("./routes/forgotPassword");
const import_1 = require("./routes/import");
const backups_1 = require("./routes/backups");
// ── Helpers ───────────────────────────────────────────────────────────────────
function body(event) {
    try {
        return JSON.parse(event.body ?? '{}');
    }
    catch {
        return {};
    }
}
function qs(event) {
    return event.queryStringParameters ?? {};
}
// ── Lambda handler ────────────────────────────────────────────────────────────
const handler = async (event) => {
    const method = (event.requestContext?.http?.method ?? event.httpMethod ?? 'GET').toUpperCase();
    const rawPath = event.rawPath ?? event.path ?? '';
    // CORS preflight
    if (method === 'OPTIONS')
        return (0, response_1.preflight)();
    // Strip /api prefix and split into segments
    const stripped = rawPath.replace(/^\/api/, '') || '/';
    const segs = stripped.split('/').filter(Boolean); // e.g. ['projects','abc123','status']
    // Auth
    const authHeader = event.headers?.authorization ?? event.headers?.Authorization ?? '';
    const user = await (0, auth_1.verifyToken)(authHeader);
    const b = () => body(event);
    const q = () => qs(event);
    try {
        // ── /profile ────────────────────────────────────────────────────────────
        if (segs[0] === 'profile' || segs[0] === 'me')
            return (0, profile_1.handleProfile)({ userId: user?.sub, userEmail: user?.email, userRole: user?.role, method, event });
        // ── /lookups ────────────────────────────────────────────────────────────
        if (segs[0] === 'lookups' && method === 'GET')
            return (0, lookups_1.getLookups)(null, user);
        // ── /filter-options ─────────────────────────────────────────────────────
        if (segs[0] === 'filter-options' && method === 'GET')
            return (0, lookups_1.getFilterOptions)(null, user);
        // ── /projects ───────────────────────────────────────────────────────────
        if (segs[0] === 'projects') {
            if (!segs[1]) {
                if (method === 'GET')
                    return (0, projects_1.getProjects)(q(), user);
                if (method === 'POST')
                    return (0, projects_1.createProject)(b(), user);
            }
            if (segs[1] === 'import' && method === 'POST')
                return (0, projects_1.importProjects)(b(), user);
            if (segs[1] === 'bulk-status' && method === 'POST')
                return (0, projects_1.bulkUpdateStatus)(b(), user);
            if (segs[1] === 'countries' && method === 'GET')
                return (0, projects_1.getAllProjectCountries)(null, user);
            // /projects/:id
            const pid = segs[1];
            if (!segs[2]) {
                if (method === 'GET')
                    return (0, projects_1.getProject)(pid, user);
                if (method === 'PATCH')
                    return (0, projects_1.updateProject)(pid, b(), user);
                if (method === 'DELETE')
                    return (0, projects_1.deleteProject)(pid, user);
            }
            if (segs[2] === 'status' && method === 'PATCH')
                return (0, projects_1.updateProjectStatus)(pid, b(), user);
            if (segs[2] === 'notifications' && method === 'PATCH')
                return (0, projects_1.updateProjectNotificationsEnabled)(pid, b(), user);
            if (segs[2] === 'countries') {
                if (method === 'GET')
                    return (0, projects_1.getProjectCountries)(pid, user);
                if (segs[3] === 'sync' && method === 'POST')
                    return (0, projects_1.syncProjectCountries)(pid, b(), user);
                if (segs[3] && segs[4] === 'assign' && method === 'PATCH')
                    return (0, projects_1.assignCountryAnalyst)(pid, segs[3], b(), user);
                if (segs[3] && segs[4] === 'complete' && (method === 'POST' || method === 'DELETE'))
                    return (0, projects_1.setCountryComplete)(pid, segs[3], method === 'POST', user);
            }
            if (segs[2] === 'tasks') {
                if (method === 'GET')
                    return (0, projects_1.getProjectTasks)(pid, user);
                if (segs[3] === 'sync' && method === 'POST')
                    return (0, projects_1.syncProjectTasksRoute)(pid, b(), user);
            }
            if (segs[2] === 'history' && method === 'GET')
                return (0, projects_1.getProjectHistory)(pid, user);
        }
        // ── /analysts ───────────────────────────────────────────────────────────
        if (segs[0] === 'analysts') {
            if (!segs[1]) {
                if (method === 'GET')
                    return (0, analysts_1.getAnalysts)(null, user);
                if (method === 'POST')
                    return (0, analysts_1.createAnalyst)(b(), user);
            }
            if (segs[1] === 'all' && method === 'GET')
                return (0, analysts_1.getAllAnalysts)(null, user);
            const aid = segs[1];
            if (!segs[2] && method === 'PATCH')
                return (0, analysts_1.updateAnalyst)(aid, b(), user);
            if (segs[2] === 'deactivate' && method === 'PATCH')
                return (0, analysts_1.deactivateAnalyst)(aid, user);
            if (segs[2] === 'reactivate' && method === 'PATCH')
                return (0, analysts_1.reactivateAnalyst)(aid, user);
        }
        // ── /client-types ───────────────────────────────────────────────────────
        if (segs[0] === 'client-types') {
            if (!segs[1]) {
                if (method === 'GET')
                    return (0, analysts_1.getClientTypes)(null, user);
                if (method === 'POST')
                    return (0, analysts_1.createClientType)(b(), user);
            }
            const cid = segs[1];
            if (!segs[2] && method === 'PATCH')
                return (0, analysts_1.updateClientType)(cid, b(), user);
            if (segs[2] === 'deactivate' && method === 'PATCH')
                return (0, analysts_1.deactivateClientType)(cid, user);
        }
        // ── /project-types ──────────────────────────────────────────────────────
        if (segs[0] === 'project-types') {
            if (!segs[1]) {
                if (method === 'GET')
                    return (0, analysts_1.getProjectTypes)(null, user);
                if (method === 'POST')
                    return (0, analysts_1.createProjectType)(b(), user);
            }
            const tid = segs[1];
            if (!segs[2] && method === 'PATCH')
                return (0, analysts_1.updateProjectType)(tid, b(), user);
            if (!segs[2] && method === 'DELETE')
                return (0, analysts_1.deleteProjectType)(tid, user);
            if (segs[2] === 'deactivate' && method === 'PATCH')
                return (0, analysts_1.deactivateProjectType)(tid, user);
        }
        // ── /clients ────────────────────────────────────────────────────────────
        if (segs[0] === 'clients') {
            if (!segs[1]) {
                if (method === 'GET')
                    return (0, clients_1.getClients)(null, user);
                if (method === 'POST')
                    return (0, clients_1.createClient)(b(), user);
            }
            if (segs[1] === 'all' && method === 'GET')
                return (0, clients_1.getAllClients)(null, user);
            if (segs[1] === 'import' && method === 'POST')
                return (0, clients_1.importClients)(b(), user);
            const cid = segs[1];
            if (!segs[2] && method === 'PATCH')
                return (0, clients_1.updateClient)(cid, b(), user);
            if (segs[2] === 'deactivate' && method === 'PATCH')
                return (0, clients_1.deactivateClient)(cid, user);
        }
        // ── /client-requests ────────────────────────────────────────────────────
        if (segs[0] === 'client-requests') {
            if (!segs[1]) {
                if (method === 'GET')
                    return (0, clients_1.getClientRequests)(null, user);
                if (method === 'POST')
                    return (0, clients_1.submitClientRequest)(b(), user);
            }
            const rid = segs[1];
            if (segs[2] === 'approve' && method === 'POST')
                return (0, clients_1.approveClientRequest)(rid, b(), user);
            if (segs[2] === 'reject' && method === 'POST')
                return (0, clients_1.rejectClientRequest)(rid, b(), user);
        }
        // ── /notifications ──────────────────────────────────────────────────────
        if (segs[0] === 'notifications') {
            if (!segs[1]) {
                if (method === 'GET')
                    return (0, notifications_1.getNotifications)({...b(), ...q()}, user);
                if (method === 'POST')
                    return (0, notifications_1.createNotification)(b(), user);
            }
            if (segs[1] === 'unread-count' && method === 'GET')
                return (0, notifications_1.getUnreadCount)(null, user);
            if (segs[1] === 'mark-all-read' && method === 'POST')
                return (0, notifications_1.markAllRead)(null, user);
            if (segs[1] === 'for-admins' && method === 'POST')
                return (0, notifications_1.createNotificationsForAdmins)(b(), user);
            if (segs[1] === 'settings') {
                if (method === 'GET')
                    return (0, notifications_1.getNotificationSettings)(null, user);
                if (method === 'PATCH' && segs[2])
                    return (0, notifications_1.updateNotificationSetting)(segs[2], b(), user);
            }
            const nid = segs[1];
            if (!segs[2] && method === 'DELETE')
                return (0, notifications_1.deleteNotification)(nid, user);
            if (segs[2] === 'read' && method === 'POST')
                return (0, notifications_1.markRead)(nid, user);
        }
        // ── Storage (S3 presigned URLs) ──────────────────────────────────────────
        if (segs[0] === 'storage') {
            if (segs[1] === 'upload-url' && method === 'POST')
                return (0, storage_1.getS3UploadUrl)(b(), user);
            if (segs[1] === 'download-url' && method === 'GET')
                return (0, storage_1.getS3DownloadUrl)(q().key ?? null, user);
            if (segs[1] === 'object' && method === 'DELETE')
                return (0, storage_1.deleteStorageObject)(b(), user);
        }
        // ── Send email notification ──────────────────────────────────────────────
        if (segs[0] === 'send-notification' && method === 'POST')
            return (0, sendNotification_1.handleSendNotification)(b(), user);
        // ── /feedback ───────────────────────────────────────────────────────────
        if (segs[0] === 'feedback') {
            if (!segs[1]) {
                if (method === 'POST')
                    return (0, feedback_1.createFeedback)('', b(), user);
            }
            if (segs[1] === 'items' && segs[2]) {
                const itemId = segs[2];
                if (segs[3] === 'resolve' && method === 'PATCH')
                    return (0, feedback_1.resolveItem)(itemId, b(), user);
                if (segs[3] === 'unresolve' && method === 'PATCH')
                    return (0, feedback_1.unresolveItem)(itemId, b(), user);
            }
            if (segs[1] === 'projects' && segs[2]) {
                const pid = segs[2];
                if (!segs[3] && method === 'GET')
                    return (0, feedback_1.getProjectFeedback)(pid, user);
                if (!segs[3] && method === 'POST')
                    return (0, feedback_1.createFeedback)(pid, b(), user);
                if (segs[3] === 'unresolved-count' && method === 'GET')
                    return (0, feedback_1.getUnresolvedCount)(pid, user);
                if (segs[3] === 'user-response' && method === 'POST')
                    return (0, feedback_1.submitUserResponse)(pid, b(), user);
                if (segs[3] === 're-review' && method === 'POST')
                    return (0, feedback_1.submitForReReview)(pid, b(), user);
            }
        }
        // ── /delivery ───────────────────────────────────────────────────────────
        if (segs[0] === 'delivery') {
            if (segs[1] === 'upload-url' && method === 'POST')
                return (0, storage_1.getS3UploadUrl)(b(), user);
            if (segs[1] === 'download-url' && method === 'POST')
                return (0, delivery_1.getDownloadUrl)(b(), user);
            if (segs[1] === 'files' && segs[2]) {
                const fid = segs[2];
                if (!segs[3] && method === 'PATCH')
                    return (0, delivery_1.updateDeliveryFile)(fid, b(), user);
                if (!segs[3] && method === 'DELETE')
                    return (0, delivery_1.deleteDeliveryFile)(fid, b(), user);
                if (segs[3] === 'download' && method === 'POST')
                    return (0, delivery_1.trackDownload)(fid, b(), user);
                if (segs[3] === 'history' && method === 'GET')
                    return (0, delivery_1.getDownloadHistory)(fid, user);
            }
            if (segs[1] === 'projects' && segs[2]) {
                const pid = segs[2];
                if (segs[3] === 'files') {
                    if (!segs[4] && method === 'GET')
                        return (0, delivery_1.getProjectFiles)(pid, user);
                    if (!segs[4] && method === 'POST')
                        return (0, delivery_1.createProjectFile)(pid, b(), user);
                    if (segs[4] && method === 'DELETE')
                        return (0, delivery_1.deleteProjectFile)(segs[4], b(), user);
                }
                if (segs[3] === 'delivery-files') {
                    if (!segs[4] && method === 'GET')
                        return (0, delivery_1.getDeliveryFiles)(pid, user);
                    if (!segs[4] && method === 'POST')
                        return (0, delivery_1.createDeliveryFile)(pid, b(), user);
                }
                if (segs[3] === 'notes') {
                    if (!segs[4] && method === 'GET')
                        return (0, delivery_1.getDeliveryNotes)(pid, user);
                    if (!segs[4] && method === 'POST')
                        return (0, delivery_1.createDeliveryNote)(pid, b(), user);
                    if (segs[4] && method === 'PATCH')
                        return (0, delivery_1.updateDeliveryNote)(segs[4], b(), user);
                    if (segs[4] && method === 'DELETE')
                        return (0, delivery_1.deleteDeliveryNote)(segs[4], b(), user);
                }
            }
        }
        // ── /eta ────────────────────────────────────────────────────────────────
        if (segs[0] === 'eta' && segs[1]) {
            const pid = segs[1];
            if (!segs[2] && method === 'GET')
                return (0, eta_1.getETA)(pid, user);
            if (!segs[2] && method === 'PATCH')
                return (0, eta_1.updateETA)(pid, b(), user);
            if (segs[2] === 'history' && method === 'GET')
                return (0, eta_1.getETAHistory)(pid, user);
        }
        // ── /settings ───────────────────────────────────────────────────────────
        if (segs[0] === 'settings') {
            if (!segs[1] && method === 'GET')
                return (0, settings_1.getAppSettings)(null, user);
            if (!segs[1] && method === 'PATCH')
                return (0, settings_1.updateAppSetting)('', b(), user);
            if (segs[1] && method === 'PATCH')
                return (0, settings_1.updateAppSetting)(segs[1], b(), user);
        }
        // ── /text-presets ───────────────────────────────────────────────────────
        if (segs[0] === 'text-presets') {
            if (!segs[1]) {
                if (method === 'GET')
                    return (0, settings_1.getTextPresets)(null, user);
                if (method === 'POST')
                    return (0, settings_1.createTextPreset)(b(), user);
            }
            const tid = segs[1];
            if (!segs[2] && method === 'PATCH')
                return (0, settings_1.updateTextPreset)(tid, b(), user);
            if (!segs[2] && method === 'DELETE')
                return (0, settings_1.deleteTextPreset)(tid, b(), user);
        }
        // ── /profiles ───────────────────────────────────────────────────────────
        if (segs[0] === 'profiles') {
            if (!segs[1] && method === 'GET')
                return (0, settings_1.getProfiles)(null, user);
            if (segs[1] === 'owner-email' && segs[2] && method === 'GET')
                return (0, settings_1.getOwnerEmail)(segs[2], user);
        }
        // ── /me (current user profile) ──────────────────────────────────────────
        if (segs[0] === 'me') {
            if (!user)
                return (0, response_1.unauthorized)();
            return (0, settings_1.getProfile)(null, user);
        }
        // ── /chat ───────────────────────────────────────────────────────────────
        // POST /api/chat (no sub-path) = AI Insights chat; /api/chat/:projectId = project chat
        if (segs[0] === 'chat' && method === 'POST' && !segs[1])
            return (0, aiChat_1.handleAiChat)(event, user);
        if (segs[0] === 'chat')
            return (0, chat_1.handleChat)({ userId: user?.sub, userRole: user?.role, method, event }, rawPath);
        // ── /analyze-template ───────────────────────────────────────────────────
        if (segs[0] === 'analyze-template' && method === 'POST')
            return (0, analyzeTemplate_1.handleAnalyzeTemplate)(b(), user);
        // ── /generate-descriptions ──────────────────────────────────────────────
        if (segs[0] === 'generate-descriptions' && method === 'POST')
            return (0, generateDescriptions_1.handleGenerateDescriptions)(b(), user);
        // ── /send-welcome ────────────────────────────────────────────────────────
        if (segs[0] === 'send-welcome' && method === 'POST')
            return (0, sendWelcome_1.handleSendWelcome)(b(), user);
        // ── /forgot-password (public — no auth required) ─────────────────────────
        if (segs[0] === 'forgot-password' && method === 'POST')
            return (0, forgotPassword_1.handleForgotPassword)(b(), event.requestContext?.http?.sourceIp ?? event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ?? '');
        // ── /auth/change-password (authenticated user sets own password) ──────────
        if (segs[0] === 'auth' && segs[1] === 'change-password' && method === 'POST')
            return (0, users_1.changeOwnPassword)(b(), user);
        // ── /users ──────────────────────────────────────────────────────────────
        if (segs[0] === 'users') {
            if (!segs[1]) {
                if (method === 'GET')
                    return (0, users_1.getUsers)(q(), user);
                if (method === 'POST')
                    return (0, users_1.createUser)(b(), user);
            }
            if (segs[1] === 'bulk-deactivate' && method === 'POST')
                return (0, users_1.bulkDeactivateUsers)(b(), user);
            const uid = segs[1];
            if (!segs[2]) {
                if (method === 'PUT' || method === 'PATCH')
                    return (0, users_1.updateUser)(uid, b(), user);
                if (method === 'DELETE')
                    return (0, users_1.deleteUser)(uid, user);
            }
            if (segs[2] === 'reset-password' && method === 'POST')
                return (0, users_1.resetUserPassword)(uid, b(), user);
        }
        // ── /import ───────────────────────────────────────────────────────────────
        if (segs[0] === 'import' && method === 'POST')
            return (0, import_1.handleImport)(b(), user);
        // ── /admin/acknowledge ─────────────────────────────────────────────────────
        // ── /admin/backups — backup browser (super-admin only) ──────────────────
        if (segs[0] === 'admin' && segs[1] === 'backups') {
            if (!segs[2] && method === 'GET')
                return backups_1.listBackups(user);
            if (segs[2] === 'download' && method === 'GET')
                return backups_1.getBackupDownloadUrl(q().key ?? null, user);
            if (segs[2] === 'run' && method === 'POST')
                return backups_1.runBackup(user);
        }
        if (segs[0] === 'admin' && segs[1] === 'acknowledge' && method === 'POST')
            return (0, import_1.handleAcknowledge)(b(), user);
        return (0, response_1.err)('Route not found', 404);
    }
    catch (e) {
        console.error('Unhandled error:', e);
        return (0, response_1.err)('Internal server error', 500);
    }
};
exports.handler = handler;
