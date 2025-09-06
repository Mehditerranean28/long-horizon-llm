import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;

class PipelineSingleton {
  static task = 'text-generation';
  static model = 'Xenova/phi2';
  static instance: any = null;

  static async getInstance(progress_callback: any = null) {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, { progress_callback });
    }
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  const generator = await PipelineSingleton.getInstance((x: any) => self.postMessage(x));
  const output = await generator(event.data.text, { max_new_tokens: 128 });
  self.postMessage({ status: 'complete', output });
});
