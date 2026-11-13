import { readFile, stat } from "node:fs/promises";

export class GlossaryMatchError extends Error {}

export function validateGlossary(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.terms)
        || Object.keys(value).some(key => !["version", "terms"].includes(key))) {
        throw new Error("术语表必须是包含 version: 1 和 terms 数组的 JSON 对象。");
    }
    if (value.terms.length > 20000) throw new Error("术语表最多支持 20000 个词条。");
    const known = new Map();
    const terms = value.terms.map((term, index) => {
        if (!term || typeof term !== "object" || Array.isArray(term)
            || Object.keys(term).some(key => !["source", "target", "aliases", "note"].includes(key))) {
            throw new Error(`术语表第 ${index + 1} 条包含无效字段。`);
        }
        for (const key of ["source", "target"]) {
            if (typeof term[key] !== "string" || !term[key].trim() || term[key].length > 250) {
                throw new Error(`术语表第 ${index + 1} 条的 ${key} 必须是 1–250 字符的非空文本。`);
            }
        }
        const aliases = term.aliases === undefined ? [] : term.aliases;
        if (!Array.isArray(aliases) || aliases.length > 12
            || aliases.some(alias => typeof alias !== "string" || !alias.trim() || alias.length > 250)) {
            throw new Error(`术语表第 ${index + 1} 条的 aliases 无效。`);
        }
        if (term.note !== undefined && (typeof term.note !== "string" || term.note.length > 500)) {
            throw new Error(`术语表第 ${index + 1} 条的 note 最多 500 字符。`);
        }
        const result = {
            source: term.source.trim(), target: term.target.trim(),
            aliases: aliases.map(alias => alias.trim()), note: term.note?.trim() ?? "",
        };
        for (const spelling of [result.source, ...result.aliases]) {
            const key = spelling.toLocaleLowerCase("en-US");
            if (known.has(key) && known.get(key) !== result.target) {
                throw new Error(`术语表存在冲突译法：${spelling}。请先由客户确认唯一译法。`);
            }
            known.set(key, result.target);
        }
        return result;
    });
    return terms;
}

function includesTerm(text, term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

export function selectTerms(terms, text, limit = 40) {
    const matches = terms.filter(term => [term.source, ...term.aliases].some(spelling => includesTerm(text, spelling)));
    if (matches.length > limit) {
        throw new GlossaryMatchError(`当前片段匹配超过 ${limit} 个术语，请缩短片段或合并重复词条；不会静默截断客户词典。`);
    }
    return matches;
}

export class GlossaryStore {
    constructor(filename) {
        this.filename = filename;
        this.signature = "";
        this.terms = [];
        this.modifiedAt = null;
    }

    async load() {
        const info = await stat(this.filename);
        const signature = `${info.mtimeMs}:${info.size}`;
        if (signature !== this.signature) {
            if (info.size > 8 * 1024 * 1024) throw new Error("术语表文件不能超过 8 MB。");
            const value = JSON.parse((await readFile(this.filename, "utf8")).replace(/^\uFEFF/, ""));
            const terms = validateGlossary(value);
            this.terms = terms;
            this.signature = signature;
            this.modifiedAt = info.mtime.toISOString();
        }
        return this.terms;
    }

    async metadata() {
        await this.load();
        return { count: this.terms.length, modifiedAt: this.modifiedAt };
    }
}
