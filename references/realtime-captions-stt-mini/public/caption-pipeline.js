const abortError = () => new DOMException("待译内容已取消", "AbortError");
const tokensOf = text => [...text.matchAll(/[\p{Script=Han}]|[-+−]?\d+(?:[.,]\d+)*|[\p{L}\p{N}]+(?:['’/-][\p{L}\p{N}]+)*|[%<>=]/gu)]
    .map(match => ({ key: match[0].toLowerCase().replaceAll("’", "'"), start: match.index, end: match.index + match[0].length }));
const samePrefix = (left, right, length) => {
    let index = 0;
    while (index < length && left[index]?.key === right[index]?.key) index++;
    return index;
};
const unfinished = new Set(("a an the and or but not no never is are was were be been being to of for by with without "
    + "in on at from as than that which whose this these those our their its per clinical investigational adverse "
    + "statistical serious severe responsible regulatory outstanding data site necessarily caused associated "
    + "do does did have has had must should would could will shall can may might automatically clinically meaningful "
    + "evaluate assess mean prove demonstrate suggest indicate likely").split(" "));
const prepositions = new Set("by of to from with without than per".split(" "));
const numberWord = /^(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|point|minus|[-+−]?\d+(?:[.,]\d+)*|[零〇一二两三四五六七八九十百千万亿点负])$/u;

export function selectPhraseEnd(tokens, start, available, language) {
    const chinese = language.startsWith("zh");
    const minimum = chinese ? 8 : 3;
    if (available - start < minimum) return null;
    const preferred = start + (chinese ? 8 : 4);
    const maximum = Math.min(available, start + (chinese ? 16 : 12));
    const safe = end => {
        const last = tokens[end - 1].key;
        const next = tokens[end]?.key;
        if (unfinished.has(last) || prepositions.has(next) || numberWord.test(last)) return false;
        if (last === "and" && numberWord.test(tokens[end - 2]?.key || "")) return false;
        return true;
    };
    for (let end = Math.min(preferred, maximum); end <= maximum; end++) if (safe(end)) return end;
    for (let end = Math.min(preferred - 1, maximum); end >= start + minimum; end--) if (safe(end)) return end;
    return null;
}

export class CaptionPipeline {
    constructor({ translate, onStart = () => {}, onDelta = () => {}, onUpdate = () => {},
        onFinal, onError, onQueue = () => {} }) {
        Object.assign(this, { translate, onStart, onDelta, onUpdate, onFinal, onError, onQueue });
        this.pending = [];
        this.context = [];
        this.active = null;
        this.closed = false;
        this.waiters = [];
        this.sequence = 0;
        this.current = null;
    }

    create(text, language) {
        const utterance = {
            id: ++this.sequence, text, language, tokens: [], available: 0,
            displayed: "", translated: null, finalized: false, asrConfirmed: true,
        };
        this.pending.push(utterance);
        if (this.pending.length > 20) {
            this.fail(new Error("翻译积压超过 20 段，已停止识别。原文仍保留在 Original 中；请检查网络、配额后重新开始。"));
        }
        return utterance;
    }

    partial(text, language = "") {
        if (this.closed || this.finishing || !text.trim()) return;
        text = text.trim();
        const utterance = this.current ??= this.create(text.trim(), language);
        const tokens = tokensOf(text);
        utterance.available = Math.max(0, samePrefix(utterance.tokens, tokens, Math.min(utterance.tokens.length, tokens.length)) - 1);
        utterance.tokens = tokens;
        utterance.text = text.trim();
        if (language) utterance.language = language;
        this.discardObsolete(utterance);
        this.pump();
        this.notifyQueue();
    }

    final(text, language = "", { lexical = text } = {}) {
        if (this.closed || this.finishing || !text.trim()) return;
        const utterance = this.current ?? this.create(text.trim(), language);
        this.current = null;
        if (language) utterance.language = language;
        const punctuation = text.match(/[.!?。！？]+$/u)?.[0] || "";
        utterance.text = utterance.language.startsWith("zh") ? text.trim()
            : lexical.trim().replace(/[.!?。！？]+$/u, "") + punctuation;
        utterance.source = text.trim();
        utterance.tokens = tokensOf(utterance.text);
        if (!utterance.tokens.length) {
            this.fail(new Error("语音识别没有返回可翻译的词语，原文仍保留在 Original 中。"));
            return;
        }
        utterance.available = utterance.tokens.length;
        utterance.finalized = true;
        this.discardObsolete(utterance);
        this.pump();
        this.notifyQueue();
    }

    finish() {
        this.finishing = true;
        if (!this.current || this.closed) return;
        const utterance = this.current;
        utterance.finalized = true;
        utterance.asrConfirmed = false;
        utterance.available = utterance.tokens.length;
        utterance.source = utterance.text;
        this.current = null;
        this.pump();
        this.notifyQueue();
    }

    notifyQueue() {
        if (!this.closed) this.onQueue(this.pending.length);
    }

    matchesSource(job) {
        return job.language === job.utterance.language
            && job.tokens.length <= job.utterance.tokens.length
            && samePrefix(job.tokens, job.utterance.tokens, job.tokens.length) === job.tokens.length;
    }

    discardObsolete(utterance) {
        if (this.active?.utterance === utterance && !this.matchesSource(this.active)) {
            this.active.controller.abort();
        }
    }

    render(utterance, text) {
        if (utterance.displayed === text) return;
        utterance.displayed = text;
        this.onUpdate({ id: utterance.id, text });
    }

    nextJob(utterance) {
        const previous = utterance.translated;
        let end = utterance.tokens.length;
        if (!utterance.finalized) {
            if (!utterance.language) return null;
            const minimum = utterance.language.startsWith("zh") ? 8 : 3;
            end = selectPhraseEnd(utterance.tokens, 0, utterance.available, utterance.language);
            if (previous) {
                // Reorganize the current draft using a cumulative stable prefix, never confirmed history.
                for (let candidate = utterance.available; candidate >= minimum; candidate--) {
                    if (selectPhraseEnd(utterance.tokens, candidate - minimum, candidate, utterance.language) === candidate) {
                        end = candidate;
                        break;
                    }
                }
                if (end < Math.min(previous.tokens.length, utterance.tokens.length)) return null;
                const growth = utterance.language.startsWith("zh") ? 8 : 4;
                if (this.matchesSource(previous) && end - previous.tokens.length < growth) return null;
            }
            if (end === null) return null;
        }
        const to = end < utterance.tokens.length ? utterance.tokens[end].start : utterance.text.length;
        const text = utterance.text.slice(0, to).trim();
        if (previous?.text === text && previous.language === utterance.language) {
            if (utterance.finalized) this.complete(utterance, previous.result);
            return null;
        }
        return {
            utterance, text, language: utterance.language,
            tokens: utterance.tokens.slice(0, end), revision: Boolean(utterance.displayed),
        };
    }

    complete(utterance, result) {
        this.render(utterance, result.text.trim());
        if (utterance.asrConfirmed) {
            this.context.push(utterance.source.slice(-1200));
            this.context = this.context.slice(-3);
        }
        this.onFinal({
            ...result, id: utterance.id, text: utterance.displayed, source: utterance.source, language: utterance.language,
            asrConfirmed: utterance.asrConfirmed,
            firstCaptionMs: utterance.firstCaptionMs, time: new Date().toISOString(),
        });
        this.pending.shift();
    }

    pump() {
        if (this.closed || this.active) return;
        while (this.pending.length && !this.active && !this.closed) {
            const utterance = this.pending[0];
            const job = this.nextJob(utterance);
            if (job) { void this.run(job); return; }
            if (this.pending[0] === utterance) break;
        }
        this.settle();
    }

    async run(job) {
        job.controller = new AbortController();
        this.active = job;
        const started = performance.now();
        let firstCaptionMs = null;
        let displayed = "";
        const current = () => !this.closed && this.active === job && this.pending[0] === job.utterance
            && !job.controller.signal.aborted && this.matchesSource(job);
        const append = text => {
            if (!current()) return;
            const next = text.trim();
            if (!next.startsWith(displayed)) {
                throw new Error("同一次翻译流尝试修改已显示内容，本段未确认；现有字幕保留并标记为未完成。");
            }
            const delta = next.slice(displayed.length);
            if (!delta) return;
            firstCaptionMs ??= Math.round(performance.now() - started);
            job.utterance.firstCaptionMs ??= firstCaptionMs;
            displayed = next;
            if (!job.revision) {
                this.render(job.utterance, displayed);
                this.onDelta(delta, { source: job.text, firstCaptionMs });
            }
        };
        try {
            this.onStart(job);
            let result;
            if (job.language.startsWith("zh")) {
                result = { text: job.text, passthrough: true, firstTokenMs: 0, termsProvided: 0 };
            } else {
                result = await this.translate({
                    text: job.text, language: job.language, signal: job.controller.signal,
                    context: [...this.context],
                    onDelta: append,
                });
            }
            if (current()) {
                if (!result.text?.trim()) throw new Error("模型未返回非空译文，本段未确认。");
                append(result.text);
                job.result = result;
                job.utterance.translated = job;
                this.render(job.utterance, displayed);
                if (job.utterance.finalized && job.text === job.utterance.text) this.complete(job.utterance, result);
            }
        } catch (error) {
            if (!job.controller.signal.aborted && !this.closed) this.fail(error);
        } finally {
            if (this.active === job) this.active = null;
            this.notifyQueue();
            this.pump();
            this.settle();
        }
    }

    async drain(timeoutMs = 30000) {
        if (this.failure) throw this.failure;
        if (!this.active && !this.pending.length) return;
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.fail(new Error("停止后等待确认超过 30 秒。未完成内容已取消，原文仍保留在 Original 中。"));
            }, timeoutMs);
            this.waiters.push({
                resolve: () => { clearTimeout(timer); resolve(); },
                reject: error => { clearTimeout(timer); reject(error); },
            });
        });
    }

    settle() {
        if (this.failure || (!this.active && !this.pending.length)) {
            for (const waiter of this.waiters.splice(0)) {
                if (this.failure) waiter.reject(this.failure);
                else waiter.resolve();
            }
        }
    }

    fail(error) {
        this.failure = error;
        this.cancel();
        this.onError(error);
    }

    cancel() {
        this.closed = true;
        this.failure ??= abortError();
        this.active?.controller.abort();
        this.pending = [];
        this.settle();
    }
}
