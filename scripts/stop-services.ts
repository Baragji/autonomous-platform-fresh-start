import fs from 'node:fs';

function main() {
  const pidFile = process.env.UMCA_PID_FILE || '/tmp/umca-pids.json';
  if (!fs.existsSync(pidFile)) return;
  try {
    const raw = fs.readFileSync(pidFile, 'utf8');
    const data = JSON.parse(raw) as { pids?: Array<{ name: string; pid: number }> };
    for (const entry of data.pids || []) {
      try { process.kill(entry.pid, 'SIGINT'); } catch {}
    }
  } catch {}
}

main();

