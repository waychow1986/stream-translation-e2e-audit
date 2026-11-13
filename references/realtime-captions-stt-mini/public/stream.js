export async function* readNdjson(body) {
    if (!body) throw new Error("服务未返回流式响应。");
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            if (buffer.length > 100000) throw new Error("翻译流单条消息过长。");
            let newline;
            while ((newline = buffer.indexOf("\n")) !== -1) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (line) yield JSON.parse(line);
            }
            if (done) break;
        }
        if (buffer.trim()) yield JSON.parse(buffer);
    } finally {
        await reader.cancel();
        reader.releaseLock();
    }
}
