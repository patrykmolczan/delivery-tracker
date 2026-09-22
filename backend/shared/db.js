"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
exports.query = query;
exports.queryOne = queryOne;
/**
 * db.ts — shared Aurora Serverless v2 connection pool
 * Reused across all Lambda route handlers (module-level singleton).
 */
const pg_1 = require("pg");
let pool = null;
function getPool() {
    if (!pool) {
        pool = new pg_1.Pool({
            host: process.env.AURORA_HOST,
            port: 5432,
            user: process.env.AURORA_USER,
            password: process.env.AURORA_PASSWORD,
            database: process.env.AURORA_DB,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        pool.on('error', (err) => console.error('Pool error:', err));
    }
    return pool;
}
/** Convenience: run a parameterized query and return rows */
async function query(sql, params) {
    const client = await getPool().connect();
    try {
        const { rows } = await client.query(sql, params);
        return rows;
    }
    finally {
        client.release();
    }
}
/** Convenience: run query and return first row or null */
async function queryOne(sql, params) {
    const rows = await query(sql, params);
    return rows[0] ?? null;
}
