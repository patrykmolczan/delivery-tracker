"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLookups = getLookups;
exports.getFilterOptions = getFilterOptions;
/**
 * routes/lookups.ts — lookup tables (statuses, client_types, industries, countries)
 */
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");
/** GET /api/lookups — all lookup tables in one call */
async function getLookups(_body, _user) {
    try {
        const [statuses, clientTypes, industries, countries] = await Promise.all([
            (0, db_1.query)("SELECT id, name FROM public.project_statuses WHERE is_active=true ORDER BY display_order"),
            (0, db_1.query)("SELECT id, name FROM public.client_types WHERE is_active=true ORDER BY name"),
            (0, db_1.query)("SELECT id, name FROM public.industries WHERE is_active=true ORDER BY name"),
            (0, db_1.query)("SELECT id, name FROM public.countries WHERE is_active=true ORDER BY name"),
        ]);
        return (0, response_1.ok)({ statuses, clientTypes, industries, countries });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
/** GET /api/filter-options — extended options including analysts from DB */
async function getFilterOptions(_body, _user) {
    try {
        const [clientTypes, industries, countries, statuses, analysts] = await Promise.all([
            (0, db_1.query)("SELECT name FROM public.client_types WHERE is_active=true ORDER BY name"),
            (0, db_1.query)("SELECT name FROM public.industries WHERE is_active=true ORDER BY name"),
            (0, db_1.query)("SELECT name FROM public.countries WHERE is_active=true ORDER BY name"),
            (0, db_1.query)("SELECT name FROM public.project_statuses WHERE is_active=true ORDER BY display_order"),
            (0, db_1.query)("SELECT name FROM public.analysts WHERE is_active=true ORDER BY name"),
        ]);
        return (0, response_1.ok)({
            clientTypes: clientTypes.map(r => r.name),
            industries: industries.map(r => r.name),
            countries: countries.map(r => r.name),
            statuses: statuses.map(r => r.name),
            analysts: analysts.map(r => r.name),
        });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
