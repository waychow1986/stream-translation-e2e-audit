# Third-party notices

The light, table-based configuration/results layout and browser sample interaction
pattern are adapted from Microsoft's JavaScript browser Speech SDK sample:

https://github.com/Azure-Samples/cognitive-services-speech-sdk/tree/master/samples/js/browser

This independent implementation uses SpeechRecognizer for continuous transcription
and language identification, then the official OpenAI JavaScript SDK for streamed
Chinese translations through Azure Responses. Short-lived Speech credentials are
obtained from a local server; permanent API keys are never sent to the browser.

The upstream sample is distributed under the following license:

MIT License

Copyright (c) Microsoft Corporation. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The installed microsoft-cognitiveservices-speech-sdk package retains its own
license and redistribution notices in node_modules.

The installed openai package retains its Apache-2.0 license and notices in
node_modules. No changes are made to the installed SDK implementations.
