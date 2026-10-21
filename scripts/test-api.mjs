/**
 * End-to-end API test.
 *
 * Exercises the full lifecycle over HTTP against a running dev server, exactly
 * as the browser does: sign in, generate, refine, edit, submit, approve,
 * schedule, publish, plus the authorisation and validation paths.
 *
 * Usage:  npm run dev            (in one terminal)
 *         npm run test:api       (in another)
 *
 * Override the target with BASE=http://localhost:3001 npm run test:api
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const jar = new Map();
let pass = 0, fail = 0;

const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
function store(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
async function req(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    redirect: "manual",
    headers: {
      cookie: cookieHeader(),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  store(res);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: res.status, body };
}
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` -- ${detail}` : ""}`); }
};

// --- sign in ---------------------------------------------------------------
const { body: csrf } = await req("/api/auth/csrf");
await fetch(BASE + "/api/auth/callback/credentials", {
  method: "POST",
  redirect: "manual",
  headers: { cookie: cookieHeader(), "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "demo@postpilot.app", password: "demo1234" }),
}).then(store);

console.log("\n1. Generate through the agent");
const gen = await req("/api/generate", {
  method: "POST",
  body: JSON.stringify({
    topic: "how to run a data quality audit without stopping the roadmap",
    product: "Northwind Pulse",
    audience: "analytics engineers",
    platform: "LINKEDIN",
    contentType: "EDUCATIONAL",
    tone: "PROFESSIONAL",
    length: "MEDIUM",
    language: "English",
    keywords: ["data quality", "audit"],
    hashtags: [],
  }),
});
check("POST /api/generate returns 200", gen.status === 200, JSON.stringify(gen.body).slice(0, 200));
const postId = gen.body?.data?.postId;
check("a post was created", Boolean(postId));
check("the agent is awaiting approval", gen.body?.data?.awaitingHumanApproval === true);
check("a quality score came back", (gen.body?.data?.qualityReport?.score ?? 0) > 0, `score=${gen.body?.data?.qualityReport?.score}`);
check("the runtime flags are exposed", gen.body?.data?.runtime?.aiProvider === "mock");

console.log("\n2. Publishing before approval is blocked");
const early = await req(`/api/posts/${postId}/publish`, { method: "POST" });
check("publish returns 403", early.status === 403, `got ${early.status}`);
check("the error code is APPROVAL_REQUIRED", early.body?.error?.code === "APPROVAL_REQUIRED", early.body?.error?.code);
check(
  "the message is the canonical one",
  early.body?.error?.message === "Publishing blocked: human approval is required.",
  early.body?.error?.message,
);

const earlySchedule = await req(`/api/posts/${postId}/schedule`, {
  method: "POST",
  body: JSON.stringify({ scheduledFor: new Date(Date.now() + 3600_000).toISOString(), timezone: "UTC" }),
});
check("scheduling an unapproved post is refused", earlySchedule.status === 403, `got ${earlySchedule.status}`);

console.log("\n3. Refine, edit and submit");
const refined = await req(`/api/posts/${postId}/refine`, { method: "POST", body: JSON.stringify({ action: "improve" }) });
check("refine returns the updated post", refined.status === 200 && refined.body?.data?.version === 2, `v=${refined.body?.data?.version}`);

const edited = await req(`/api/posts/${postId}`, {
  method: "PATCH",
  body: JSON.stringify({ caption: refined.body.data.caption + "\n\nReviewed and tightened by a human.", changeSummary: "Human edit" }),
});
check("PATCH bumps the version", edited.body?.data?.version === 3, `v=${edited.body?.data?.version}`);
check("a HUMAN_EDIT revision exists", edited.body?.data?.revisions?.some((r) => r.source === "HUMAN_EDIT"));

const submitted = await req(`/api/posts/${postId}/submit`, { method: "POST" });
check("submit moves it to PENDING_APPROVAL", submitted.body?.data?.status === "PENDING_APPROVAL", submitted.body?.data?.status);

console.log("\n4. Human approves and schedules");
const scheduledFor = new Date(Date.now() + 8000).toISOString();
const approved = await req(`/api/posts/${postId}/approve`, {
  method: "POST",
  body: JSON.stringify({
    decision: "APPROVED",
    feedback: "Reads well. Approved.",
    schedule: { scheduledFor, timezone: "UTC" },
  }),
});
check("approve returns 200", approved.status === 200, JSON.stringify(approved.body).slice(0, 200));
check("the decision resumed the agent run", approved.body?.data?.viaAgent === true);
check("the post is SCHEDULED", approved.body?.data?.status === "SCHEDULED", approved.body?.data?.status);
check("a schedule id came back", Boolean(approved.body?.data?.scheduleId));

console.log("\n5. The scheduler publishes it");
process.env.DEMO_PUBLISH_FAILURE_RATE = "0";
await new Promise((r) => setTimeout(r, 9000));
const tick = await req("/api/cron/tick", { method: "POST", headers: { authorization: "Bearer dev-cron-secret" } });
check("the cron endpoint accepts the secret", tick.status === 200, `got ${tick.status}`);

// The in-process scheduler may have already taken the job; either way the post
// must end up published.
let detail = await req(`/api/posts/${postId}`);
for (let i = 0; i < 12 && detail.body?.data?.status !== "PUBLISHED"; i++) {
  await new Promise((r) => setTimeout(r, 2500));
  detail = await req(`/api/posts/${postId}`);
}
check("the post is PUBLISHED", detail.body?.data?.status === "PUBLISHED", detail.body?.data?.status);
check("an external id was recorded", Boolean(detail.body?.data?.externalId));
check("a SUCCESS publishing log exists", detail.body?.data?.publishingLogs?.some((l) => l.status === "SUCCESS"));

console.log("\n6. Unauthenticated access is refused");
const savedJar = new Map(jar);
jar.clear();
const anon = await req("/api/posts");
check("GET /api/posts without a session is 401", anon.status === 401, `got ${anon.status}`);
const anonCron = await req("/api/cron/tick", { method: "POST" });
check("cron without the secret is 401", anonCron.status === 401, `got ${anonCron.status}`);
const badCron = await req("/api/cron/tick", { method: "POST", headers: { authorization: "Bearer wrong" } });
check("cron with a wrong secret is 401", badCron.status === 401, `got ${badCron.status}`);
for (const [k, v] of savedJar) jar.set(k, v);

console.log("\n7. Input validation");
const badGen = await req("/api/generate", { method: "POST", body: JSON.stringify({ topic: "x", platform: "MYSPACE" }) });
check("invalid enum values are rejected with 422", badGen.status === 422, `got ${badGen.status}`);
check("validation details are returned", Array.isArray(badGen.body?.error?.details));
const badJson = await req("/api/generate", { method: "POST", body: "{not json" });
check("malformed JSON is a 422, not a 500", badJson.status === 422, `got ${badJson.status}`);

console.log("\n8. Rejection blocks publishing");
const gen2 = await req("/api/generate", {
  method: "POST",
  body: JSON.stringify({ topic: "a post that will be rejected by the reviewer", platform: "X", contentType: "SOCIAL_POST", tone: "CASUAL", length: "SHORT", language: "English", keywords: [], hashtags: [] }),
});
const rejectedId = gen2.body?.data?.postId;
await req(`/api/posts/${rejectedId}/submit`, { method: "POST" });
const rejection = await req(`/api/posts/${rejectedId}/approve`, {
  method: "POST",
  body: JSON.stringify({ decision: "REJECTED", feedback: "Off-brand for this audience." }),
});
check("rejection is recorded", rejection.body?.data?.status === "REJECTED", rejection.body?.data?.status);
const afterReject = await req(`/api/posts/${rejectedId}/publish`, { method: "POST" });
check("a rejected post cannot be published", afterReject.status === 403, `got ${afterReject.status}`);

console.log("\n9. Clean up");
await req(`/api/posts/${postId}`, { method: "DELETE" });
await req(`/api/posts/${rejectedId}`, { method: "DELETE" });
check("test posts deleted", true);

console.log(`\n${"=".repeat(46)}\n${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
process.exit(fail === 0 ? 0 : 1);
