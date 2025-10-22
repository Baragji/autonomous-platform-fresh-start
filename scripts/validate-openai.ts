import OpenAI from 'openai';

async function main() {
  const key = process.env.OPENAI_API_KEY || '';
  if (!key) {
    console.error('OPENAI_API_KEY missing');
    process.exit(1);
  }
  const client = new OpenAI({ apiKey: key });
  // Prefer a lightweight call that avoids token usage where possible
  const models = await client.models.list();
  const names = models.data.map(m => m.id).slice(0, 3);
  console.log(JSON.stringify({ ok: true, models: names }));
}

main().catch((err) => {
  console.error('OpenAI check failed:', (err as Error).message);
  process.exit(1);
});

