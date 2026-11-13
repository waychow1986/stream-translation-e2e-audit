function sdkCall(target, method, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`语音服务 ${method} 超时。`)), timeout);
        target[method](() => { clearTimeout(timer); resolve(); }, error => {
            clearTimeout(timer); reject(new Error(`语音服务 ${method} 失败：${String(error)}`));
        });
    });
}

export function configureSpeech(sdk, config, token, languages = config.candidateLanguages) {
    const speech = sdk.SpeechConfig.fromAuthorizationToken(token, config.speechRegion);
    const endpoint = new URL(config.speechEndpoint);
    endpoint.protocol = "wss:";
    speech.setProperty(sdk.PropertyId.SpeechServiceConnection_Endpoint, endpoint.href);
    speech.setProperty(sdk.PropertyId.SpeechServiceConnection_EnableAudioLogging, "false");
    speech.outputFormat = sdk.OutputFormat.Detailed;
    if (languages.length > 1) speech.setProperty(sdk.PropertyId.SpeechServiceConnection_LanguageIdMode, "Continuous");
    speech.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "700");
    return speech;
}

export class SpeechSession {
    constructor({ sdk, config, languages, deviceId, onPartial, onFinal, onError, onEvent, onEnd }) {
        Object.assign(this, { sdk, config, languages, deviceId, onPartial, onFinal, onError, onEvent, onEnd });
        this.stopping = false;
        this.closed = false;
        this.tokenController = new AbortController();
    }

    async getToken() {
        const response = await fetch("/api/token", { method: "POST", signal: this.tokenController.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "获取 Speech 临时令牌失败。");
        if (typeof body.token !== "string" || !body.token || body.expiresAt <= Date.now() + 60000) {
            throw new Error("Speech 临时令牌无效或即将过期。");
        }
        return body;
    }

    start() {
        this.starting = this.open();
        return this.starting;
    }

    async open() {
        try {
            const token = await this.getToken();
            if (this.stopping) return;
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: this.deviceId ? { deviceId: { exact: this.deviceId } } : true,
            });
            if (this.stopping) { this.release(); return; }
            const sdk = this.sdk;
            const speech = configureSpeech(sdk, this.config, token.token, this.languages);
            this.audio = sdk.AudioConfig.fromStreamInput(this.stream);
            if (this.languages.length > 1) {
                const auto = sdk.AutoDetectSourceLanguageConfig.fromLanguages(this.languages);
                this.recognizer = sdk.SpeechRecognizer.FromConfig(speech, auto, this.audio);
            } else {
                speech.speechRecognitionLanguage = this.languages[0];
                this.recognizer = new sdk.SpeechRecognizer(speech, this.audio);
            }
            const deliver = (event, final) => {
                if (this.closed || !event.result.text?.trim()) return;
                try {
                    const result = event.result;
                    const language = result.language || (this.languages.length === 1 ? this.languages[0] : "");
                    if (final) {
                        const lexical = JSON.parse(result.json).NBest?.[0]?.Lexical;
                        if (typeof lexical !== "string" || !lexical.trim()) throw new Error("语音服务未返回详细词法原文，无法安全核对提前显示的字幕。");
                        this.onFinal(result.text, language, { lexical });
                    } else this.onPartial(result.text, language);
                } catch (error) { this.onError(error); }
            };
            this.recognizer.recognizing = (_, event) => deliver(event, false);
            this.recognizer.recognized = (_, event) => {
                if (event.result.reason === sdk.ResultReason.RecognizedSpeech) deliver(event, true);
            };
            this.recognizer.canceled = (_, event) => {
                if (!this.closed && !this.stopping && event.reason === sdk.CancellationReason.Error) {
                    this.onError(new Error(`语音识别被服务取消（错误码 ${event.errorCode}）。请检查资源、候选语言、网络和 Speech 配额。`));
                }
            };
            this.recognizer.sessionStopped = () => {
                if (!this.closed && !this.stopping) this.onEnd();
            };
            await sdkCall(this.recognizer, "startContinuousRecognitionAsync");
            if (!this.stopping) {
                this.onEvent("实时识别已启动；连续语言检测：" + this.languages.join(" / "));
                this.scheduleRefresh(token.expiresAt);
            }
        } catch (error) {
            this.release();
            throw error;
        }
    }

    scheduleRefresh(expiresAt) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(async () => {
            try {
                const token = await this.getToken();
                if (this.closed || this.stopping) return;
                this.recognizer.authorizationToken = token.token;
                this.scheduleRefresh(token.expiresAt);
                this.onEvent("Speech 临时令牌已续期。");
            } catch (error) {
                if (!this.stopping && !this.closed) this.onError(error);
            }
        }, Math.max(1000, expiresAt - Date.now() - 60000));
    }

    stop() {
        this.stopping = true;
        clearTimeout(this.refreshTimer);
        this.tokenController.abort();
        this.stopped ??= this.close();
        return this.stopped;
    }

    async close() {
        try {
            if (this.starting) {
                try { await this.starting; }
                catch (error) {
                    if (error.name !== "AbortError") throw error;
                }
            }
            if (this.recognizer && !this.closed) {
                const stopped = sdkCall(this.recognizer, "stopContinuousRecognitionAsync");
                this.stopTracks();
                await stopped;
            }
        } finally { this.release(); }
    }

    stopTracks() { this.stream?.getTracks().forEach(track => track.stop()); }

    release() {
        this.closed = true;
        clearTimeout(this.refreshTimer);
        this.stopTracks();
        this.recognizer?.close();
        this.audio?.close();
        this.recognizer = null;
        this.audio = null;
    }
}
