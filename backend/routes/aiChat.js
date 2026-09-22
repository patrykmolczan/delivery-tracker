"use strict";
/**
 * routes/aiChat.js — AI Insights chat endpoint
 * POST /api/chat  (no project ID — distinguished from /api/chat/:projectId)
 *
 * Body: { systemPrompt: string, messages: Array<{role, content}> }
 * Returns: { content: string }
 *
 * Rate limit: 10 req / 60s per user (IP + userId)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAiChat = handleAiChat;

const { ok, err, serverError } = require("../shared/response");

// Simple in-memory rate limiter (per userId, resets per Lambda warm instance)
// For a stateless rate limit at scale, use DynamoDB or ElastiCache; this is good
// enough for internal enterprise (<500 users, Lambda concurrency limits apply).
const rateLimitMap = new Map(); // userId -> { count, windowStart }
const RATE_LIMIT = 10;          // requests per window
const RATE_WINDOW = 60 * 1000;  // 60 seconds

function checkRateLimit(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) ?? { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW) {
    // Window expired — reset
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (entry.count >= RATE_LIMIT) {
    const retryAfterMs = RATE_WINDOW - (now - entry.windowStart);
    return { allowed: false, retryAfterMs };
  }
  entry.count += 1;
  rateLimitMap.set(userId, entry);
  return { allowed: true };
}

async function handleAiChat(event, user) {
  if (!user?.sub) return require("../shared/response").unauthorized();

  const rl = checkRateLimit(user.sub);
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Too many requests — please wait before sending another message.",
        retryAfterMs: rl.retryAfterMs,
      }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return err("Invalid JSON body", 400);
  }

  const { systemPrompt, messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return err("messages array required", 400);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY not set");
    return serverError(new Error("OpenAI not configured"), "AI chat");
  }

  try {
    const payload = {
      model: "gpt-4.1",
      max_tokens: 1024,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("OpenAI error:", response.status, errBody);
      return err("AI service error — please try again", 502);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return ok({ content });
  } catch (e) {
    return serverError(e, "aiChat");
  }
}
