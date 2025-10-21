import { Langfuse } from 'langfuse';
import { env } from './env';

export function getLangfuse(): Langfuse | null {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return null;
  try {
    const opts: {
      publicKey: string;
      secretKey: string;
      baseUrl?: string;
    } = {
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY
    };
    if (env.LANGFUSE_HOST) {
      opts.baseUrl = env.LANGFUSE_HOST;
    }
    return new Langfuse(opts as unknown as ConstructorParameters<typeof Langfuse>[0]);
  } catch {
    return null;
  }
}
