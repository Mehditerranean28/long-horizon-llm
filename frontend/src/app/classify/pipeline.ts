import { pipeline } from "@xenova/transformers";

const P = () =>
  class PipelineSingleton {
    static task = "text-classification";
    static model = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";
    static instance: any = null;

    static async getInstance(progress_callback: any = null) {
      if (this.instance === null) {
        this.instance = pipeline(this.task, this.model, { progress_callback });
      }
      return this.instance;
    }
  };

let PipelineSingleton: ReturnType<typeof P>;
if (process.env.NODE_ENV !== "production") {
  // Persist pipeline across hot reloads in development
  const globalAny = global as any;
  if (!globalAny.PipelineSingleton) {
    globalAny.PipelineSingleton = P();
  }
  PipelineSingleton = globalAny.PipelineSingleton;
} else {
  PipelineSingleton = P();
}

export default PipelineSingleton;
