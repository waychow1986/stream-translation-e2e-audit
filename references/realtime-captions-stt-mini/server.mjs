import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import OpenAI from "openai";
import { GlossaryStore, GlossaryMatchError } from "./glossary.mjs";
import { translateStream, validateInput, TranslationError } from "./translation.mjs";

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const runFile = promisify(execFile);
class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

export async function readConfig(filename = path.join(ROOT, "config.json")) {
    const value = JSON.parse((await readFile(filename, "utf8")).replace(/^\uFEFF/, ""));
    const allowed = [
        "speechEndpoint", "speechRegion", "responsesEndpoint", "modelDeployment",
        "candidateLanguages", "credentialsFile", "glossaryFile", "port",
    ];
    if (!value || typeof value !== "object" || Array.isArray(value)
        || Object.keys(value).some(key => !allowed.includes(key))) {
        throw new Error("config.json 包含未定义字段；不要在配置中保存 API 密钥。");
    }
    const speech = new URL(value.speechEndpoint);
    const responses = new URL(value.responsesEndpoint);
    for (const url of [speech, responses]) {
        if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
            throw new Error("Azure Endpoint 必须是无凭据、端口和查询参数的 HTTPS 地址。");
        }
    }
    if (!speech.hostname.endsWith(".cognitiveservices.azure.com") || speech.pathname !== "/"
        || !responses.hostname.endsWith(".services.ai.azure.com")
        || responses.pathname !== "/openai/v1/responses"
        || speech.hostname.split(".")[0] !== responses.hostname.split(".")[0]) {
        throw new Error("请填写同一 Foundry 资源的 Speech 根地址和完整 /openai/v1/responses 地址。");
    }
    if (typeof value.speechRegion !== "string" || !/^[a-z0-9]+$/.test(value.speechRegion)) {
        throw new Error("speechRegion 必须是资源的真实 Azure 区域。");
    }
    if (typeof value.modelDeployment !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(value.modelDeployment)) {
        throw new Error("modelDeployment 必须填写实际部署名称。");
    }
    if (!Number.isInteger(value.port) || value.port < 1024 || value.port > 65535) {
        throw new Error("port 必须是 1024–65535 之间的整数。");
    }
    if (!Array.isArray(value.candidateLanguages) || value.candidateLanguages.length < 1
        || value.candidateLanguages.length > 10
        || value.candidateLanguages.some(item => typeof item !== "string" || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})+$/.test(item))
        || new Set(value.candidateLanguages).size !== value.candidateLanguages.length) {
        throw new Error("candidateLanguages 必须包含 1–10 个不重复的语言代码，例如 en-US、zh-CN。");
    }
    for (const key of ["credentialsFile", "glossaryFile"]) {
        if (typeof value[key] !== "string" || !value[key].trim()) throw new Error(`${key} 必须是非空文件路径。`);
    }
    return value;
}

export async function readKey(config) {
    if (process.env.AZURE_FOUNDRY_KEY?.trim()) return process.env.AZURE_FOUNDRY_KEY.trim();
    if (process.platform !== "win32") throw new Error("非 Windows 系统请设置 AZURE_FOUNDRY_KEY。");
    try {
        const { stdout } = await runFile("powershell.exe", [
            "-NoLogo", "-NoProfile", "-NonInteractive", "-File",
            path.join(ROOT, "scripts", "read-key.ps1"),
            "-Path", path.resolve(ROOT, config.credentialsFile),
        ], { timeout: 15000, maxBuffer: 8192, windowsHide: true, encoding: "utf8" });
        const key = stdout.trim();
        if (!key) throw new Error("Empty credential.");
        return key;
    } catch (error) {
        throw new Error("无法读取当前 Windows 用户的加密密钥，请运行 scripts\\set-key.ps1 或设置 AZURE_FOUNDRY_KEY。", { cause: error });
    }
}

export class TokenIssuer {
    constructor(config, key, fetcher = fetch) {
        this.config = config;
        this.key = key;
        this.fetcher = fetcher;
        this.cached = null;
        this.pending = null;
    }

    async get() {
        if (this.cached && this.cached.expiresAt - Date.now() > 120000) return this.cached;
        if (this.pending) return this.pending;
        this.pending = this.issue();
        try { this.cached = await this.pending; return this.cached; }
        finally { this.pending = null; }
    }

    async issue() {
        const response = await this.fetcher(new URL("sts/v1.0/issueToken", this.config.speechEndpoint), {
            method: "POST", headers: { "Ocp-Apim-Subscription-Key": this.key },
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new HttpError(503, `Speech 临时令牌请求失败（HTTP ${response.status}），请检查密钥、资源权限和网络。`);
        const token = (await response.text()).trim();
        if (!token) throw new HttpError(503, "Speech 服务返回空令牌，不能开始识别。");
        return { token, expiresAt: Date.now() + 9 * 60000 };
    }
}

async function readJson(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > 65536) {
            request.resume();
            throw new HttpError(413, "请求超过 64 KB，请缩短待译片段和上下文。");
        }
        chunks.push(chunk);
    }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new HttpError(400, "请求必须是合法的 UTF-8 JSON。"); }
}

export function createApp(config, { issuer, client, glossary, log = console.error }) {
    const browserSdk = path.join(ROOT, "node_modules", "microsoft-cognitiveservices-speech-sdk", "distrib", "browser");
    const assets = new Map([
        ["/", [path.join("public", "index.html"), "text/html; charset=utf-8"]],
        ["/index.html", [path.join("public", "index.html"), "text/html; charset=utf-8"]],
        ["/styles.css", [path.join("public", "styles.css"), "text/css; charset=utf-8"]],
        ...["app", "speech-session", "caption-pipeline", "translation-client", "stream"].map(name =>
            [`/${name}.js`, [path.join("public", `${name}.js`), "text/javascript; charset=utf-8"]]),
        ["/vendor/microsoft.cognitiveservices.speech.sdk.bundle-min.js",
            [path.join(browserSdk, "microsoft.cognitiveservices.speech.sdk.bundle-min.js"), "text/javascript"]],
        ["/vendor/speech-processor.js", [path.join(browserSdk, "speech-processor.js"), "text/javascript"]],
        ["/speech-processor.js", [path.join(browserSdk, "speech-processor.js"), "text/javascript"]],
    ]);
    let activeTranslations = 0;
    return createServer(async (request, response) => {
        const host = request.headers.host;
        const allowedHosts = [`127.0.0.1:${request.socket.localPort}`, `localhost:${request.socket.localPort}`];
        const speechOrigin = new URL(config.speechEndpoint).origin;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        response.setHeader("Content-Security-Policy",
            `default-src 'self'; script-src 'self'; style-src 'self'; `
            + `connect-src 'self' ${speechOrigin} ${speechOrigin.replace("https:", "wss:")} `
            + `wss://${config.speechRegion}.stt.speech.microsoft.com; `
            + "worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        const json = (status, body) => {
            response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify(body));
        };
        const send = body => {
            if (!response.destroyed) response.write(JSON.stringify(body) + "\n");
        };
        const publicMessage = error => {
            let message;
            if (error instanceof HttpError || error instanceof TranslationError || error instanceof GlossaryMatchError) message = error.message;
            else if (error.status === 429) message = "模型请求达到速率或配额上限（HTTP 429）。本次未确认内容不计入字幕，请检查配额后重试。";
            else if (error.status === 401 || error.status === 403) message = `模型授权失败（HTTP ${error.status}），请检查资源密钥和部署权限。`;
            else if (error.status) message = `模型请求失败（HTTP ${error.status}），请检查部署名称、网络和服务状态。`;
            else message = "本地服务或 Azure 连接失败，请查看启动窗口中的错误类型并检查网络与配置。";
            return issuer.key ? message.replaceAll(issuer.key, "[REDACTED]") : message;
        };
        if (!allowedHosts.includes(host)) { json(403, { error: "只允许从本机地址访问。" }); return; }
        try {
            const url = new URL(request.url, `http://${host}`);
            if (request.method === "POST" && request.headers.origin !== `http://${host}`) {
                throw new HttpError(403, "请求必须来自当前本机网页。");
            }
            if (url.pathname === "/favicon.ico" && request.method === "GET") {
                response.writeHead(204); response.end();
            } else if (url.pathname === "/api/config" && request.method === "GET") {
                json(200, {
                    speechEndpoint: config.speechEndpoint, speechRegion: config.speechRegion,
                    modelDeployment: config.modelDeployment, candidateLanguages: config.candidateLanguages,
                    reasoningEffort: "none", sdkVersion: "1.53.0", glossary: await glossary.metadata(),
                });
            } else if (url.pathname === "/api/glossary" && request.method === "GET") {
                try { json(200, await glossary.metadata()); }
                catch (error) { throw new HttpError(422, `术语表不能加载：${error.message}`); }
            } else if (url.pathname === "/api/token" && request.method === "POST") {
                json(200, await issuer.get());
            } else if (url.pathname === "/api/translate" && request.method === "POST") {
                if (!request.headers["content-type"]?.startsWith("application/json")) {
                    throw new HttpError(415, "翻译请求必须使用 application/json。");
                }
                const body = await readJson(request);
                let input;
                try { input = validateInput(body); }
                catch (error) { throw new HttpError(400, error.message); }
                let terms;
                try { terms = await glossary.load(); }
                catch (error) { throw new HttpError(422, `术语表不能加载：${error.message}`); }
                if (request.aborted || response.destroyed) return;
                if (activeTranslations >= 4) throw new HttpError(429, "本机同时处理的翻译过多，请停止多余页面后重试。");
                const controller = new AbortController();
                const onClose = () => controller.abort();
                response.on("close", onClose);
                activeTranslations += 1;
                try {
                    response.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" });
                    response.flushHeaders();
                    for await (const event of translateStream(client, config, input, terms, controller.signal)) send(event);
                } catch (error) {
                    if (!controller.signal.aborted) {
                        log(`Translation failed: ${error.name}; HTTP=${error.status ?? "n/a"}`);
                        send({ type: "error", message: publicMessage(error) });
                    }
                } finally {
                    activeTranslations -= 1;
                    response.removeListener("close", onClose);
                    if (!response.destroyed) response.end();
                }
            } else if (request.method === "GET" && assets.has(url.pathname)) {
                const [filename, contentType] = assets.get(url.pathname);
                const bytes = await readFile(path.resolve(ROOT, filename));
                response.writeHead(200, { "Content-Type": contentType });
                response.end(bytes);
            } else json(404, { error: "Not found" });
        } catch (error) {
            log(`Request failed: ${error.name}; HTTP=${error.status ?? "n/a"}`);
            if (!response.destroyed && !response.headersSent) {
                json(error instanceof HttpError ? error.status : 503, { error: publicMessage(error) });
            } else if (!response.destroyed) response.end();
        }
    });
}

async function main() {
    const config = await readConfig();
    const key = await readKey(config);
    const glossary = new GlossaryStore(path.resolve(ROOT, config.glossaryFile));
    await glossary.load();
    const client = new OpenAI({
        apiKey: key, baseURL: new URL("./", config.responsesEndpoint).href,
        timeout: 20000, maxRetries: 0,
    });
    const server = createApp(config, { issuer: new TokenIssuer(config, key), client, glossary });
    server.on("error", error => {
        console.error(`启动失败：${error.code === "EADDRINUSE" ? `端口 ${config.port} 已占用` : error.message}`);
        process.exitCode = 1;
    });
    server.listen(config.port, "127.0.0.1", () => {
        const url = `http://127.0.0.1:${config.port}`;
        console.log(`STT + GPT mini 实时中文字幕：${url}`);
        console.log(`模型：${config.modelDeployment}；reasoning.effort=none；Ctrl+C 停止服务。`);
        console.log("密钥仅用于本机后端；不保存录音，不自动保存字幕。");
        if (process.argv.includes("--open")) {
            execFile("powershell.exe", ["-NoProfile", "-Command", `Start-Process '${url}'`], error => {
                if (error) console.error(`无法打开浏览器，请手动访问 ${url}。`);
            });
        }
    });
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, () => { server.close(); server.closeIdleConnections(); });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
}
