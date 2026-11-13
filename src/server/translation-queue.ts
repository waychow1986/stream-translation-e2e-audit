import type { RecognitionSegment } from "../shared/types.js";

export class TranslationQueue {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly consume: (segment: RecognitionSegment) => Promise<void>) {}

  enqueue(segment: RecognitionSegment): void {
    this.tail = this.tail.then(() => this.consume(segment));
  }

  drain(): Promise<void> {
    return this.tail;
  }
}
