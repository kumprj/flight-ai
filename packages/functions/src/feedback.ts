import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Database, formatGitHubIssue, FeedbackType, FeedbackDiagnostics } from "@flight-ai/core";

/**
 * Extract authenticated user's ID and email from Bearer JWT claim
 */
const getAuthDetails = (event: any): { userId: string; email: string } | null => {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const email = payload.email;
    if (!email) return null;
    return {
      userId: (email as string).replace(/[@.]/g, '_'),
      email: email as string,
    };
  } catch {
    return null;
  }
};

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const submit: APIGatewayProxyHandlerV2 = async (event) => {
  // Handle preflight OPTIONS request
  if (event.requestContext?.http?.method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  const auth = getAuthDetails(event);
  if (!auth) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Unauthorized: Missing valid session token" }),
    };
  }

  let body: {
    type?: FeedbackType;
    title?: string;
    description?: string;
    diagnostics?: FeedbackDiagnostics;
  };

  try {
    const bodyStr = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf-8")
      : (event.body || "{}");
    body = JSON.parse(bodyStr);
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const title = (body.title || "").trim();
  const description = (body.description || "").trim();
  const rawType = body.type || "general";
  const validTypes: FeedbackType[] = ["bug", "feature", "route", "general"];
  const type: FeedbackType = validTypes.includes(rawType) ? rawType : "general";

  if (!title || title.length < 3) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Title must be at least 3 characters long" }),
    };
  }

  if (!description || description.length < 5) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Description must be at least 5 characters long" }),
    };
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "kumprj/flight-ai";
  const stage = process.env.SST_STAGE || "production";

  const formatted = formatGitHubIssue({
    type,
    title,
    description,
    email: auth.email,
    diagnostics: body.diagnostics,
    stage,
  });

  let githubIssueNumber: number | undefined;
  let githubIssueUrl: string | undefined;

  if (githubToken) {
    try {
      const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "flight-ai-feedback-bot",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: formatted.title,
          body: formatted.body,
          labels: formatted.labels,
        }),
      });

      if (ghRes.ok) {
        const ghData = (await ghRes.json()) as { number?: number; html_url?: string };
        githubIssueNumber = ghData.number;
        githubIssueUrl = ghData.html_url;
        console.log(`[Feedback] Created GitHub Issue #${githubIssueNumber}: ${githubIssueUrl}`);
      } else {
        const errorText = await ghRes.text();
        console.error(`[Feedback] GitHub API returned ${ghRes.status}: ${errorText}`);
      }
    } catch (err) {
      console.error("[Feedback] Failed to dispatch GitHub issue:", err);
    }
  } else {
    console.warn("[Feedback] GITHUB_TOKEN not configured; recorded in database only.");
  }

  // Persist feedback submission in DynamoDB single-table
  const timestamp = Date.now();
  const feedbackId = `${timestamp}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    await Database.put({
      pk: `USER#${auth.userId}`,
      sk: `FEEDBACK#${feedbackId}`,
      type,
      title,
      description,
      email: auth.email,
      diagnostics: body.diagnostics || {},
      createdAt: timestamp,
      githubIssueNumber,
      githubIssueUrl,
      status: githubIssueNumber ? "synced_github" : "recorded_local",
    });
  } catch (dbErr) {
    console.error("[Feedback] Error saving to DynamoDB:", dbErr);
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      issueNumber: githubIssueNumber,
      issueUrl: githubIssueUrl,
      message: githubIssueUrl
        ? `Issue #${githubIssueNumber} created on GitHub`
        : "Feedback successfully received! Thank you for your feedback.",
    }),
  };
};
