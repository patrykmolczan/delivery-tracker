'use strict';

const { query } = require('../shared/db');
const { ok, err, serverError } = require('../shared/response');
const { isAdmin } = require('../shared/auth');

const STATUS_MAP = {
  'completed': 6, 'cancelled': 7, 'canceled': 7,
  'in process': 1, 'skv validation': 4, 'on hold': 5,
  'ready to deliver': 2, 'under review': 3,
};

function mapStatus(raw) {
  if (!raw) return 3;
  return STATUS_MAP[String(raw).toLowerCase().trim()] ?? 3;
}

// ── Upsert a single imported project row ──────────────────────────────────────
// Match priority:
//   1. external_id (most reliable)
//   2. composite: client_name + project_summary + date_received::date + record_type
// Returns 'inserted' | 'updated' | 'unchanged'
async function upsertRecord(cols, vals, matchKey, recordType) {
  const {
    project_owner, analyst, client_name, requestor,
    date_received, expected_delivery_date, date_delivered,
    project_summary, job_count, time_allocation,
    status_id, project_type, external_id, countries_text,
    industry_id, industry_text,
  } = vals;

  // Try to find existing row
  let existing = null;
  if (external_id != null) {
    const res = await query(
      `SELECT id, status_id, date_delivered, countries_text, job_count, analyst, project_owner
       FROM public.projects WHERE external_id = $1 AND record_type = $2 AND is_imported = true LIMIT 1`,
      [String(external_id), recordType]
    );
    existing = res[0] || null;
  }
  if (!existing) {
    // Composite match — normalise whitespace/case for comparison
    const dateOnly = date_received ? String(date_received).slice(0, 10) : null;
    const res = await query(
      `SELECT id, status_id, date_delivered, countries_text, job_count, analyst, project_owner
       FROM public.projects
       WHERE record_type = $1
         AND is_imported = true
         AND LOWER(TRIM(COALESCE(client_name,''))) = LOWER(TRIM(COALESCE($2,'')))
         AND LOWER(TRIM(COALESCE(project_summary,''))) = LOWER(TRIM(COALESCE($3,'')))
         AND ($4::date IS NULL OR date_received::date = $4::date)
       LIMIT 1`,
      [recordType, client_name, project_summary, dateOnly]
    );
    existing = res[0] || null;
  }

  if (!existing) {
    // ── INSERT ────────────────────────────────────────────────────────────────
    const insertCols = [
      'project_owner', 'analyst', 'client_name', 'requestor',
      'date_received', 'expected_delivery_date', 'date_delivered',
      'project_summary', 'job_count', 'time_allocation',
      'status_id', 'project_type', 'external_id', 'countries_text',
      'industry_id', 'industry_text',
      'record_type', 'is_imported', 'assignment_acknowledged',
      'created_at', 'updated_at',
    ];
    const insertVals = [
      project_owner, analyst, client_name, requestor,
      date_received, expected_delivery_date, date_delivered,
      project_summary, job_count != null ? Number(job_count) : null,
      time_allocation != null ? Number(time_allocation) : null,
      status_id, project_type, external_id != null ? String(external_id) : null, countries_text,
      industry_id, industry_text,
      recordType, true, false,
      date_received, new Date().toISOString(),
    ];
    const ph = insertVals.map((_, i) => `$${i + 1}`).join(',');
    await query(
      `INSERT INTO public.projects (${insertCols.join(',')}) VALUES (${ph})`,
      insertVals
    );
    return 'inserted';
  }

  // ── Determine if anything changed (status, date_delivered, countries, job_count, owner, analyst)
  const changed =
    existing.status_id !== status_id ||
    (existing.date_delivered || null) !== (date_delivered || null) ||
    (existing.countries_text || null) !== (countries_text || null) ||
    (existing.job_count || null) !== (job_count != null ? Number(job_count) : null) ||
    (existing.analyst || null) !== (analyst || null) ||
    (existing.project_owner || null) !== (project_owner || null);

  if (!changed) return 'unchanged';

  // ── UPDATE only the fields that may evolve between exports ──────────────────
  await query(
    `UPDATE public.projects SET
       status_id            = $1,
       date_delivered       = $2,
       countries_text       = $3,
       job_count            = $4,
       analyst              = $5,
       project_owner        = $6,
       expected_delivery_date = $7,
       updated_at           = $8
     WHERE id = $9`,
    [
      status_id,
      date_delivered || null,
      countries_text || null,
      job_count != null ? Number(job_count) : null,
      analyst || null,
      project_owner || null,
      expected_delivery_date || null,
      new Date().toISOString(),
      existing.id,
    ]
  );
  return 'updated';
}

async function handleImport(body, user) {
  try {
    if (!await isAdmin(user)) return err('Forbidden', 403);

    const { projects = [], oneOffs = [] } = body;

    // Load industry lookup map
    const industryRows = await query('SELECT id, name FROM public.industries');
    const industryMap = {};
    for (const r of industryRows) {
      industryMap[r.name.toLowerCase().trim()] = r.id;
    }

    const counts = {
      projects:  { inserted: 0, updated: 0, unchanged: 0 },
      oneOffs:   { inserted: 0, updated: 0, unchanged: 0 },
    };

    // ── Upsert projects ────────────────────────────────────────────────────────
    for (const p of projects) {
      const industryKey = (p.industry || '').toLowerCase().trim();
      const industryId  = industryMap[industryKey] ?? null;
      const industryText = industryId ? null : (p.industry || null);
      const result = await upsertRecord(null, {
        project_owner:          p.project_owner || null,
        analyst:                p.analyst || null,
        client_name:            p.client_name || null,
        requestor:              p.requestor || null,
        date_received:          p.date_received || null,
        expected_delivery_date: p.expected_delivery_date || null,
        date_delivered:         p.date_delivered || null,
        project_summary:        p.project_summary || null,
        job_count:              p.job_count,
        time_allocation:        p.time_allocation,
        status_id:              mapStatus(p.status),
        project_type:           p.request_type || null,
        external_id:            p.external_id != null ? String(p.external_id) : null,
        countries_text:         p.countries_text || null,
        industry_id:            industryId,
        industry_text:          industryText,
      }, null, 'project');
      counts.projects[result]++;
    }

    // ── Upsert one-offs ────────────────────────────────────────────────────────
    for (const p of oneOffs) {
      const result = await upsertRecord(null, {
        project_owner:          null,
        analyst:                p.analyst || null,
        client_name:            p.client_name || null,
        requestor:              p.requestor || null,
        date_received:          p.date_received || null,
        expected_delivery_date: p.expected_delivery_date || null,
        date_delivered:         p.date_delivered || null,
        project_summary:        p.project_summary || null,
        job_count:              p.job_count,
        time_allocation:        null,
        status_id:              mapStatus(p.status),
        project_type:           p.request_type || null,
        external_id:            p.external_id != null ? String(p.external_id) : null,
        countries_text:         p.countries_text || null,
        industry_id:            null,
        industry_text:          null,
      }, null, 'one_off');
      counts.oneOffs[result]++;
    }

    return ok({
      projects: counts.projects,
      oneOffs:  counts.oneOffs,
      total: {
        inserted:  counts.projects.inserted  + counts.oneOffs.inserted,
        updated:   counts.projects.updated   + counts.oneOffs.updated,
        unchanged: counts.projects.unchanged + counts.oneOffs.unchanged,
      },
    });
  } catch (e) {
    console.error('Import error:', e);
    return serverError(e);
  }
}

async function handleAcknowledge(body, user) {
  try {
    if (!await isAdmin(user)) return err('Forbidden', 403);
    const { ids, all } = body;
    if (all) {
      await query('UPDATE public.projects SET assignment_acknowledged = true WHERE (project_owner IS NULL OR TRIM(project_owner) = \'\' OR analyst IS NULL OR TRIM(analyst) = \'\') AND status_id NOT IN (6,7)');
    } else if (Array.isArray(ids) && ids.length > 0) {
      const ph = ids.map((_, i) => `$${i + 1}`).join(',');
      await query(`UPDATE public.projects SET assignment_acknowledged = true WHERE id IN (${ph})`, ids);
    } else {
      return err('Provide ids or all:true', 400);
    }
    return ok({ acknowledged: true });
  } catch (e) {
    return serverError(e);
  }
}

module.exports = { handleImport, handleAcknowledge };
