"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGenerateDescriptions = handleGenerateDescriptions;
const response_1 = require("../shared/response");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const REGION = process.env.AWS_REGION || 'us-east-2';
const s3 = new S3Client({ region: REGION });

// Daily usage guardrail: alert at 300 chunk-calls/day, hard stop at 600/day.
// Counter is a per-day S3 object (read-modify-write, no locking) — this is an
// approximate count by design, not a bug: the 2x headroom between the alert
// and the hard stop exists specifically to absorb undercounting from
// concurrent requests. Any failure to read/write the counter fails OPEN —
// a usage-tracking hiccup must never block the real feature.
const USAGE_ALERT_THRESHOLD = 300;
const USAGE_HARD_STOP = 600;

function todayUsageKeyCT() {
    // Day boundary follows the business's Central Time day, not UTC.
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year').value;
    const m = parts.find((p) => p.type === 'month').value;
    const d = parts.find((p) => p.type === 'day').value;
    return `usage/description-generation/${y}-${m}-${d}.json`;
}

// Returns the current count, or null if the counter could not be read —
// callers must proceed WITHOUT enforcing the guardrail when this happens.
async function getUsageCount(bucket, key) {
    try {
        const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = await res.Body.transformToString();
        const parsed = JSON.parse(body);
        return typeof parsed.count === 'number' ? parsed.count : 0;
    }
    catch (e) {
        if (e && (e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404)) {
            return 0;
        }
        console.error('[usage-guardrail] failed to read usage counter, proceeding without guardrail:', (e && e.message) || e);
        return null;
    }
}

async function incrementUsageCount(bucket, key, newCount) {
    try {
        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: JSON.stringify({ count: newCount, lastUpdated: new Date().toISOString() }),
            ContentType: 'application/json',
        }));
    }
    catch (e) {
        console.error('[usage-guardrail] failed to write usage counter (non-fatal):', (e && e.message) || e);
    }
}

// One Lambda invocation handles exactly one chunk. The frontend enforces 10
// titles per chunk; this is a server-side backstop so a buggy/unexpected
// caller can never silently overload a single OpenAI call.
const MAX_TITLES_PER_REQUEST = 10;
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 45000;
// Backoff delay before attempt 2 and before attempt 3, respectively.
const BACKOFF_MS = [1000, 2000];

function isJobTitle(t) {
    const s = t.trim();
    if (!s || s.length < 3)
        return false;
    if (/:\s/.test(s))
        return false; // e.g. "Rocket City: Huntsville, AL"
    if (/^(region|category|note|section|group|header|subtotal|total)$/i.test(s))
        return false;
    return true;
}

function isRetryableStatus(status) {
    return status === 429 || (status >= 500 && status < 600);
}

function normalizeKey(s) {
    return String(s).trim().toLowerCase();
}

const SYSTEM_PROMPT = `You are an expert HR compensation analyst writing professional job descriptions for Pay Intel rate card templates used across all industries globally.

For EACH job title provided, write a concise professional description following this exact structure (all in one text block, no section headers):
1. Opening paragraph (2–3 sentences): what the role is and its main purpose, written in third person starting with "The [Title] is responsible for..."
2. Responsibilities paragraph (2–3 sentences): key day-to-day activities the person performs
3. Requirements paragraph (2–3 sentences): required education, experience, and certifications

Then on a new line write "Skills:" followed by 6–8 specific skills as bullet points, each starting with "- ".

Rules:
- Keep each description under 250 words total
- Descriptions must be broadly applicable across all industries globally
- Be specific about tools, technologies, and methodologies typical for the role
- Write in third person throughout
- Output ONLY valid JSON in this exact format:
  { "descriptions": { "Exact Job Title As Given": "full description text here", ... } }
- Include EXACTLY one entry per input title, keyed by the exact title string provided`;

async function callOpenAIOnce(apiKey, unique) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
        const userPrompt = `Generate job descriptions for these job titles:\n${JSON.stringify(unique)}`;
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4.1',
                temperature: 0.3,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: Math.max(1500, 600 * unique.length),
            }),
            signal: controller.signal,
        });
        return { response };
    }
    catch (e) {
        // Covers our own 45s timeout abort and any raw network failure.
        return { networkError: e };
    }
    finally {
        clearTimeout(timeoutId);
    }
}

async function callOpenAIWithRetry(apiKey, unique) {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
            await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 2]));
        }
        const { response, networkError } = await callOpenAIOnce(apiKey, unique);
        if (networkError) {
            lastError = `network/timeout error: ${String(networkError && networkError.message || networkError)}`;
            continue; // network/timeout is always retryable
        }
        if (!response.ok) {
            const errText = await response.text();
            if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
                lastError = `OpenAI error ${response.status}: ${errText}`;
                continue;
            }
            return { error: `OpenAI error ${response.status}: ${errText}` };
        }
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            lastError = 'Empty response from OpenAI';
            if (attempt < MAX_ATTEMPTS)
                continue;
            return { error: lastError };
        }
        let parsed;
        try {
            const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            parsed = JSON.parse(cleaned);
        }
        catch {
            lastError = 'Invalid JSON from OpenAI';
            if (attempt < MAX_ATTEMPTS)
                continue;
            return { error: lastError };
        }
        return { descriptions: parsed.descriptions ?? {}, usage: data.usage };
    }
    return { error: `OpenAI request failed after ${MAX_ATTEMPTS} attempts: ${lastError}` };
}

async function handleGenerateDescriptions(body, user) {
    try {
        if (!user)
            return (0, response_1.err)('Unauthorized', 401);
        const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey)
            return (0, response_1.err)('OpenAI API key not configured on server', 500);
        const { titles } = body ?? {};
        if (!titles || !Array.isArray(titles) || titles.length === 0) {
            return (0, response_1.err)('Missing or empty titles array');
        }
        if (titles.length > MAX_TITLES_PER_REQUEST) {
            return (0, response_1.err)(`Too many titles in one request (${titles.length}); max ${MAX_TITLES_PER_REQUEST} per call. The client must send titles in chunks of ${MAX_TITLES_PER_REQUEST}.`);
        }

        // Dedupe by normalized key while keeping each original exact title
        // string, since the exact text is what gets written back to Excel.
        const seen = new Set();
        const exactTitles = [];
        for (const t of titles) {
            if (typeof t !== 'string')
                continue;
            const trimmed = t.trim();
            const key = normalizeKey(trimmed);
            if (!key || seen.has(key))
                continue;
            seen.add(key);
            exactTitles.push(trimmed);
        }

        // Gap B fix: every title the backend filter rejects is reported back
        // explicitly instead of silently vanishing from the response.
        const skipped = [];
        const validTitles = [];
        for (const t of exactTitles) {
            if (isJobTitle(t)) {
                validTitles.push(t);
            }
            else {
                skipped.push({ title: t, reason: 'not a valid job title' });
            }
        }

        if (validTitles.length === 0) {
            return (0, response_1.ok)({ descriptions: {}, skipped });
        }

        // Usage guardrail: alert at 300 chunk-calls/day, hard stop at 600/day.
        const bucket = process.env.S3_BUCKET;
        if (bucket) {
            const usageKey = todayUsageKeyCT();
            const count = await getUsageCount(bucket, usageKey);
            if (count !== null) {
                if (count >= USAGE_HARD_STOP) {
                    return (0, response_1.err)('Daily usage limit reached for description generation (600 requests today across all users). Please try again tomorrow.', 429);
                }
                const newCount = count + 1;
                if (newCount === USAGE_ALERT_THRESHOLD) {
                    console.warn(`[usage-guardrail] ALERT: description-generation usage reached ${USAGE_ALERT_THRESHOLD} chunk-calls today`);
                }
                await incrementUsageCount(bucket, usageKey, newCount);
            }
        }
        else {
            console.error('[usage-guardrail] S3_BUCKET env var not set; proceeding without usage guardrail');
        }

        const result = await callOpenAIWithRetry(apiKey, validTitles);
        if (result.error) {
            return (0, response_1.err)(result.error, 502);
        }

        // Cost visibility (Gap F item 2): log token usage for every call that
        // reaches OpenAI, success or not, so spend is never a guess.
        if (result.usage) {
            console.log('[generateDescriptions] usage', JSON.stringify({
                model: 'gpt-4.1',
                titleCount: validTitles.length,
                promptTokens: result.usage.prompt_tokens,
                completionTokens: result.usage.completion_tokens,
                totalTokens: result.usage.total_tokens,
                timestamp: new Date().toISOString(),
            }));
        }

        // Gap A + Gap C fix: match OpenAI's response back to requested titles
        // by normalized (trim + case-fold) key, not exact string equality, and
        // always write back the caller's original exact title text. Any
        // requested title with no matching key is reported as skipped instead
        // of silently returning success with a missing entry.
        const returned = result.descriptions || {};
        const normalizedReturned = new Map();
        for (const [k, v] of Object.entries(returned)) {
            normalizedReturned.set(normalizeKey(k), v);
        }
        const descriptions = {};
        for (const title of validTitles) {
            const match = normalizedReturned.get(normalizeKey(title));
            if (match && String(match).trim().length > 0) {
                descriptions[title] = match;
            }
            else {
                skipped.push({ title, reason: 'OpenAI did not return a description for this title' });
            }
        }

        return (0, response_1.ok)({ descriptions, skipped });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
