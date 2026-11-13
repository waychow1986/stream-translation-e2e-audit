import test from "node:test";
import assert from "node:assert/strict";
import { createApp, readConfig, TokenIssuer } from "../server.mjs";
import { once } from "node:events";
import { request as httpRequest } from "node:http";

const config = await readConfig();
const completed = { type: "response.completed", response: { status: "completed" } };
async function withServer(run, create = async function* () {
    yield { type: "response.output_text.delta", delta: "这是确认字幕。" };
    yield completed;
}, overrides = {}) {
    const key = "test-only-fake-permanent-key";
    const server = createApp(config, {
        issuer: { key, get: async () => ({ token: "fake-short-token", expiresAt: Date.now() + 540000 }) },
        client: { responses: { create } }, glossary: { metadata: async () => ({ count: 0 }), load: async () => [] },
        log: () => {},
        ...overrides,
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    try { await run(origin, key); }
    finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test("public configuration and static files never expose permanent secrets or local paths", async () => {
    await withServer(async (origin, key) => {
        const response = await fetch(origin + "/api/config");
        const text = await response.text();
        assert.equal(response.status, 200);
        assert.ok(!text.includes(key)); assert.ok(!text.includes(".dpapi"));
        for (const name of ["/", "/app.js", "/speech-session.js", "/stream.js", "/caption-pipeline.js",
            "/translation-client.js", "/styles.css", "/vendor/microsoft.cognitiveservices.speech.sdk.bundle-min.js"]) {
            assert.equal((await fetch(origin + name)).status, 200, name);
        }
        for (const name of ["/config.json", "/medical-glossary.json", "/.local/foundry-key.dpapi", "/server.mjs"]) {
            assert.equal((await fetch(origin + name)).status, 404, name);
        }
    });
});
test("token requests require the exact same origin; host spoofing is rejected", async () => {
    await withServer(async origin => {
        for (const headers of [{}, { Origin: "https://evil.invalid" }]) {
            assert.equal((await fetch(origin + "/api/token", { method: "POST", headers })).status, 403);
        }
        const response = await fetch(origin + "/api/token", { method: "POST", headers: { Origin: origin } });
        assert.equal((await response.json()).token, "fake-short-token");
        const spoofedStatus = await new Promise((resolve, reject) => {
            const request = httpRequest(origin, { headers: { Host: "evil.invalid" } }, response => {
                response.resume(); resolve(response.statusCode);
            });
            request.on("error", reject); request.end();
        });
        assert.equal(spoofedStatus, 403);
    });
});
test("reading a normal request does not cancel its upstream Responses stream", async () => {
    let aborted = false;
    await withServer(async origin => {
        const response = await fetch(origin + "/api/translate", {
            method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({ text: "This is a test.", language: "en-US", context: [] }),
        });
        const events = (await response.text()).trim().split("\n").map(JSON.parse);
        assert.deepEqual(events.map(item => item.type), ["delta", "done"]);
        assert.equal(aborted, false);
    }, async function* (body, { signal }) {
        await new Promise(resolve => setTimeout(resolve, 10));
        aborted = signal.aborted;
        yield { type: "response.output_text.delta", delta: "确认结果。" };
        yield completed;
    });
});
test("browser disconnect aborts the real upstream request signal", async () => {
    let notify;
    const aborted = new Promise(resolve => { notify = resolve; });
    await withServer(async origin => {
        const controller = new AbortController();
        const response = await fetch(origin + "/api/translate", {
            method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({ text: "Some words." }), signal: controller.signal,
        });
        await response.body.getReader().read();
        controller.abort();
        await Promise.race([aborted, new Promise((_, reject) => setTimeout(() => reject(new Error("Upstream was not cancelled")), 1000))]);
    }, async function* (body, { signal }) {
        yield { type: "response.output_text.delta", delta: "临时" };
        await new Promise(resolve => signal.addEventListener("abort", () => { notify(); resolve(); }, { once: true }));
        throw new DOMException("cancelled", "AbortError");
    });
});
test("bad inputs fail explicitly and partial failures never emit done", async () => {
    await withServer(async origin => {
        const post = body => fetch(origin + "/api/translate", {
            method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body,
        });
        assert.equal((await post("invalid")).status, 400);
        assert.equal((await post(JSON.stringify({ text: "" }))).status, 400);
        assert.equal((await post(" ".repeat(65537))).status, 413);
        const response = await post(JSON.stringify({ text: "Some words." }));
        const body = await response.text();
        assert.match(body, /"type":"error"/); assert.ok(!body.includes('"type":"done"'));
    }, async function* () { yield { type: "response.output_text.delta", delta: "临时字幕" }; });
});
test("Speech token issuance is cached and concurrent refresh is deduplicated", async () => {
    let count = 0;
    const issuer = new TokenIssuer(config, "fake-key", async (url, options) => {
        count++; assert.match(String(url), /\/sts\/v1.0\/issueToken$/);
        assert.equal(options.headers["Ocp-Apim-Subscription-Key"], "fake-key");
        return new Response("fake-token");
    });
    const results = await Promise.all([issuer.get(), issuer.get(), issuer.get()]);
    assert.equal(count, 1); assert.equal(results[0].token, "fake-token");
    await issuer.get(); assert.equal(count, 1);
});
test("concurrent requests cannot bypass the four-stream server limit", async () => {
    let started = 0;
    await withServer(async origin => {
        const controllers = Array.from({ length: 4 }, () => new AbortController());
        const post = signal => fetch(origin + "/api/translate", {
            method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({ text: "Synthetic concurrency test." }), signal,
        });
        try {
            const active = await Promise.all(controllers.map(controller => post(controller.signal)));
            assert.ok(active.every(response => response.status === 200));
            assert.equal((await post()).status, 429);
            assert.equal(started, 4);
        } finally { controllers.forEach(controller => controller.abort()); }
    }, async function* (body, { signal }) {
        started++;
        yield { type: "response.output_text.delta", delta: "测试" };
        await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true }));
        throw new DOMException("cancelled", "AbortError");
    });
});
test("disconnect during glossary loading never starts a billable model request", async () => {
    let begin;
    const began = new Promise(resolve => { begin = resolve; });
    let release;
    let calls = 0;
    await withServer(async origin => {
        const controller = new AbortController();
        const requested = fetch(origin + "/api/translate", {
            method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({ text: "Synthetic cancellation test." }), signal: controller.signal,
        }).then(() => null, error => error);
        await began;
        controller.abort();
        assert.equal((await requested).name, "AbortError");
        await new Promise(resolve => setTimeout(resolve, 20));
        release();
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(calls, 0);
    }, async function* () {
        calls++;
        yield { type: "response.output_text.delta", delta: "不应请求" };
        yield completed;
    }, {
        glossary: {
            metadata: async () => ({ count: 0 }),
            load: async () => {
                begin();
                return new Promise(resolve => { release = () => resolve([]); });
            },
        },
    });
});
