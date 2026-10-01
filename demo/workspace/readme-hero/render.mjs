// Renders the README hero from the packaged App on a running Workspace stories
// server. Goals, Todos and owner decisions come from the real demo backend.
// The demo starts no Agent, so the Codex conversation and the team delegation
// records are simulated through route mocks; the README caption must say so.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const { chromium } = createRequire(resolve(repo, "apps/presentation/dashboard/package.json"))("playwright");
const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:8791" },
    "demo-root": { type: "string" },
    out: { type: "string", default: resolve(repo, "output/playwright/readme-hero") },
  },
});

const goal = "community-day";
const sessionId = `session-goal-${goal}-codex`;
const turnId = "turn-venue-check";

async function decisionState() {
  const response = await fetch(new URL("/status.json", args.url));
  assert.ok(response.ok, "The demo status must be readable");
  const status = await response.json();
  assert.ok(status.ok && status.todo_index?.schema_version === "todo_index_v0");
  return status.todo_index.items.filter((item) => item.goal_id === goal)
    .map(({ todo_id, role, task_class, status, done }) => ({ todo_id, role, task_class, status, done }))
    .sort((a, b) => a.todo_id.localeCompare(b.todo_id));
}

// Preview only in the disposable workspace identified by the demo manifest.
// Never resolve the gate or manufacture an approval card with a route mock.
async function prepareDecision() {
  assert.ok(args["demo-root"], "Pass --demo-root for a fresh Workspace stories directory");
  const root = resolve(args["demo-root"]);
  const manifest = JSON.parse(readFileSync(resolve(root, ".workspace-story-demo.json"), "utf8"));
  assert.equal(manifest.schema_version, "workspace_story_demo_v2");
  assert.equal(manifest.root, root);
  const venue = manifest.goals.find((item) => item.id === goal)?.gates.venue;
  assert.ok(venue?.todo_id, "The demo manifest must contain the venue decision");
  const url = new URL(args.url);
  assert.ok(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Use the isolated loopback demo server");
  const before = await decisionState();
  const gate = before.find((item) => item.todo_id === venue.todo_id);
  assert.ok(gate?.role === "user" && gate.task_class === "user_gate" && gate.status === "open" && !gate.done, "Use a fresh demo with its venue decision still open");
  const response = await fetch(new URL("/api/actions/preview", url), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action_kind: "gate.resolve",
      summary: "Choose Riverside Hall: $5400 total, step-free access, 120 seats; hold expires Friday.",
      normalized_parameters: { goal_id: goal, todo_id: venue.todo_id, agent_id: venue.agent, decision: "approve", note: "README illustration; approval stays pending." },
      context: { kind: "goal", goal_id: goal },
      idempotency_key: `readme-hero-venue-${venue.todo_id}`,
    }),
  });
  const reply = await response.json();
  assert.ok(response.ok && reply.ok, `Venue preview failed: ${reply.error ?? response.status}`);
  assert.equal(reply.proposal.status, "preview_ready", "The packaged App must support pending venue approval; do not render from an older or already advanced demo");
  assert.equal(reply.proposal.receipt, null);
  assert.ok(reply.proposal.available_transitions.includes("apply"));
  return before;
}

const locales = {
  "en-US": {
    file: "workspace-hero.webp",
    story: {
      q1: "What changed since yesterday?",
      a1: "Finance repriced catering after the supplier revision (+$240, already inside the $5400 plan), so the $600 contingency is intact. Two first-aid shifts are still open.",
      q2: "Before I approve the venue: does Riverside Hall still fit the $6000 limit with the revised catering quote?",
      phases: ["Reading the venue and catering quotes", "Recomputing the budget", "Checking the dependent tasks"],
      answer: "Yes. The Riverside Hall plan totals $5400 including the +$240 catering revision, and the full $600 contingency remains. Approving lets Logistics reserve the hall before Friday's hold expires.",
      rota: "# Volunteer rota\n\n| Shift | Volunteers | First aid |\n|---|---:|---|\n| Setup 08:00 | 6 | Covered |\n| Morning 10:00 | 4 | Open |\n| Afternoon 13:00 | 4 | Open |\n| Close 16:00 | 4 | Covered |\n\n18 shifts are staffed; two first-aid slots remain open.",
    },
    hero: {
      eyebrow: "LoopX Personal Agent Workspace",
      headline: "Delegate long-running work to an Agent team.",
      subline: "Decide in place. Accept on evidence.",
      chrome: "LoopX · Riverside Community Day",
      results: "Accepted results, with their evidence",
      team: "Every member's state, at a glance",
      decision: "Your decision unblocks the work",
    },
  },
  "zh-CN": {
    file: "workspace-hero.zh-CN.webp",
    story: {
      q1: "昨天以来有什么变化？",
      a1: "财务按供应商修订重新核算了餐饮（+$240，已计入 $5400 方案），$600 备用金仍然完整。还有两个急救班次待补。",
      q2: "批准场地前再核一遍：算上修订后的餐饮报价，Riverside Hall 还在 $6000 上限内吗？",
      phases: ["正在读取场地与餐饮报价", "正在重新核算预算", "正在核对相关任务"],
      answer: "在上限内。Riverside Hall 方案合计 $5400，已包含 +$240 的餐饮修订，$600 备用金保持不变。批准后，后勤可以在周五保留到期前预订场地。",
      rota: "# 志愿者排班\n\n| 班次 | 志愿者 | 急救 |\n|---|---:|---|\n| 布置 08:00 | 6 | 已覆盖 |\n| 上午 10:00 | 4 | 待补 |\n| 下午 13:00 | 4 | 待补 |\n| 收尾 16:00 | 4 | 已覆盖 |\n\n18 个班次已排定，还有两个急救空缺。",
    },
    hero: {
      eyebrow: "LoopX 个人 Agent 工作区",
      headline: "把长程工作交给 Agent 团队。",
      subline: "就地决策，凭证据验收。",
      chrome: "LoopX · Riverside Community Day",
      results: "通过验收的成果，附带证据",
      team: "每位成员的状态，一眼看清",
      decision: "你的决策让工作继续",
    },
  },
};

const members = [
  { id: "editor", agent_id: "editor", todo_id: "todo_access_copy" },
  { id: "finance", agent_id: "finance", todo_id: "todo_refund" },
  { id: "producer", agent_id: "producer", todo_id: "todo_rota" },
  { id: "logistics", agent_id: "logistics", todo_id: "todo_dietary" },
];
const rotaArtifact = { ref: "volunteer-rota.md", sha256: "1".repeat(64) };
const records = [
  { record_id: "a".repeat(64), operation_id: "op-rota", agent_id: "producer", todo_id: "todo_rota", status: "accepted", worker_active: false, recovery_required: false, artifacts: [rotaArtifact] },
  { record_id: "b".repeat(64), operation_id: "op-dietary", agent_id: "logistics", todo_id: "todo_dietary", status: "running", worker_active: false, recovery_required: false },
  { record_id: "c".repeat(64), operation_id: "op-access-copy", agent_id: "editor", todo_id: "todo_access_copy", status: "running", worker_active: true, recovery_required: false },
  { record_id: "d".repeat(64), operation_id: "op-refund", agent_id: "finance", todo_id: "todo_refund", status: "turn_returned", worker_active: true, recovery_required: false },
];

const sse = (seq, kind, payload) => `id: ${seq}\nevent: ${kind}\ndata: ${JSON.stringify({ event_id: String(seq), sequence: seq, kind, payload })}\n\n`;
const settle = (page, ms) => page.waitForTimeout(ms);
const box = (locator) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });

async function capture(browser, locale, story, dir) {
  const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const session = {
    session_id: sessionId, goal_id: goal, agent_id: "codex", adapter_kind: "codex_app_server",
    channel_id: `goal.${goal}`, status: "busy", active_turn_id: turnId, last_error_code: null,
    created_at: iso(70), updated_at: iso(1), last_activity_at: iso(0), resumable: true,
  };
  const messages = [
    { message_id: "m1", turn_id: "turn-1", role: "user", text: story.q1, created_at: iso(65) },
    { message_id: "m2", turn_id: "turn-1", role: "assistant", text: story.a1, created_at: iso(64) },
    { message_id: "m3", turn_id: turnId, role: "user", text: story.q2, created_at: iso(1) },
  ];
  const mode = {
    ok: true, session_id: sessionId, enabled: true, active_turn_id: turnId, conversation_busy: true,
    settings: { agent_id: "coordinator", token_budget: 200000, execution_config: ".loopx/config/delegations.json" },
    native: { status: "active", tokensUsed: 18400, tokenBudget: 200000 },
    registered_agents: ["coordinator"], paused: false, recovery_required: false, members, deliveries: [], ingress: [],
  };

  const streams = new Set();
  const events = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
    story.phases.forEach((label, index) => response.write(sse(index + 1, "agent.phase", { label })));
    response.write(sse(story.phases.length + 1, "answer.delta", { text: story.answer }));
    streams.add(response);
    response.on("close", () => streams.delete(response));
  });
  await new Promise((ready) => events.listen(0, "127.0.0.1", ready));

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale, serviceWorkers: "block" });
  const page = await context.newPage();
  try {
    await page.route("**/api/chat/capabilities*", async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.adapters = json.adapters.map((adapter) => (adapter.agent_id === "codex" ? { ...adapter, available: true } : adapter));
      await route.fulfill({ response, json });
    });
    await page.route("**/api/chat/sessions**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (path === "/api/chat/sessions" && request.method() === "GET") {
        const goalId = url.searchParams.get("goal_id");
        return route.fulfill({ json: { ok: true, schema_version: "loopx_chat_session_list_v1", sessions: !goalId || goalId === goal ? [session] : [] } });
      }
      if (path === "/api/chat/sessions" && request.method() === "POST") {
        if (request.postDataJSON().goal_id !== goal) return route.continue();
        return route.fulfill({ status: 201, json: { ok: true, agent_id: "codex", goal_id: goal, resumed: true, session_id: sessionId, session } });
      }
      if (path === `/api/chat/sessions/${sessionId}`) {
        return route.fulfill({ json: { ok: true, schema_version: "loopx_chat_store_v1", session, messages, active_turn: { turn_id: turnId, status: "running", response: null } } });
      }
      if (path === `/api/chat/sessions/${sessionId}/turns/${turnId}/events`) {
        return route.continue({ url: `http://127.0.0.1:${events.address().port}/events/${sessionId}/${turnId}` });
      }
      if (path === `/api/chat/sessions/${sessionId}/loopx`) {
        if (request.method() === "GET") return route.fulfill({ json: mode });
        const { operation } = request.postDataJSON();
        if (operation === "operations") return route.fulfill({ json: { items: records, has_more: false, next_cursor: null, page_readback_complete: true } });
        if (operation === "read") return route.fulfill({ json: { ...records[0], ok: true, request_id: "request-rota", artifacts: [{ ...rotaArtifact, text: story.rota }] } });
        if (operation === "inspect") return route.fulfill({ json: { state: "launchable", turn_eligible: true, acceptance_ready: true, turn_route: "ready_for_host", executor: { host: "codex", available: true, reason: null, profile: null } } });
        return route.fulfill({ json: mode });
      }
      return route.continue();
    });

    const zh = locale.startsWith("zh");
    await page.goto(`${args.url}/chat/?goalId=${goal}&statusUrl=%2Fstatus.json&view=conversation`, { waitUntil: "load" });
    await settle(page, 3500);
    const dismiss = page.getByRole("button", { name: /Dismiss statistics notice|收起统计告知/ });
    if (await dismiss.count()) await dismiss.click();
    await settle(page, 800);

    const results = await page.getByRole("heading", { name: zh ? "团队成果" : "Team results" }).evaluate((heading) => {
      let element = heading;
      while (element && element.getBoundingClientRect().height < 300) element = element.parentElement;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y };
    });
    await page.screenshot({ path: `${dir}/results.png`, clip: { x: results.x + 244, y: results.y + 140, width: 568, height: 378 } });

    await page.locator(".personal-channel-scroll").first().evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
    await settle(page, 600);
    const approval = page.getByRole("button", { name: zh ? "确认批准" : "Confirm approval", exact: true });
    await approval.waitFor({ state: "visible" });
    assert.equal(await approval.count(), 1, "The captured conversation must contain one real pending approval");
    const approvalBox = await box(approval);
    assert.ok(approvalBox.x >= 0 && approvalBox.y >= 0 && approvalBox.x + approvalBox.width <= 1440 && approvalBox.y + approvalBox.height <= 900, "The approval must be inside the captured viewport");
    await page.screenshot({ path: `${dir}/conversation.png` });

    await page.getByRole("button", { name: zh ? "团队执行情况" : /Team execution/ }).first().click();
    await page.setViewportSize({ width: 470, height: 1300 });
    await settle(page, 1500);
    const cards = page.locator(".goal-team-bindings > li");
    const [first, second] = [await box(cards.nth(0)), await box(cards.nth(1))];
    await page.screenshot({ path: `${dir}/team.png`, clip: { x: first.x - 1, y: first.y - 1, width: first.width + 2, height: second.y + second.height - first.y + 2 } });

  } finally {
    await context.close();
    for (const stream of streams) stream.destroy();
    await new Promise((closed) => events.close(closed));
  }
}

async function compose(browser, locale, hero, dir, target) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(resolve(here, "hero.html")).href);
  await page.evaluate(({ lang, hero, shots }) => {
    document.documentElement.lang = lang;
    for (const node of document.querySelectorAll("[data-copy]")) node.textContent = hero[node.dataset.copy];
    for (const node of document.querySelectorAll("[data-shot]")) node.src = `${shots}/${node.dataset.shot}.png`;
  }, { lang: locale === "zh-CN" ? "zh-CN" : "en", hero, shots: pathToFileURL(dir).href });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  const png = await page.screenshot({ omitBackground: true });
  writeFileSync(`${dir}/hero.png`, png);
  const webp = await page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = Math.round((image.height * 1920) / image.width);
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.86).split(",")[1];
  }, `data:image/png;base64,${png.toString("base64")}`);
  writeFileSync(target, Buffer.from(webp, "base64"));
  await page.close();
}

const before = await prepareDecision();
mkdirSync(args.out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [locale, { file, story, hero }] of Object.entries(locales)) {
    const dir = resolve(repo, "output/playwright/readme-hero/frames", locale);
    mkdirSync(dir, { recursive: true });
    await capture(browser, locale, story, dir);
    await compose(browser, locale, hero, dir, resolve(args.out, file));
    console.log(`${locale}: ${resolve(args.out, file)}`);
  }
  assert.deepEqual(await decisionState(), before, "Rendering must leave the gate and dependent Todo states unchanged");
} finally {
  await browser.close();
}
