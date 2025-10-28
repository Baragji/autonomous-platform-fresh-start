import { spawnSync } from 'node:child_process';

function sh(cmd: string, args: string[]) {
  return spawnSync(cmd, args, { stdio: 'ignore' });
}

function killByPort(port: number) {
  // macOS/BSD: lsof -t -i :PORT
  const r = spawnSync('bash', ['-lc', `lsof -i :${port} -t | xargs -r kill -9 2>/dev/null || true`], { stdio: 'ignore' });
  return r.status ?? 0;
}

function main() {
  // Kill known service node processes
  spawnSync('bash', ['-lc', "pkill -f 'packages/(gateway|planner|mca|implementer|runner|validator)' || true"], { stdio: 'ignore' });
  // Free well-known ports
  const ports = [3030, 7010, 7020, 7030, 7040, 7050];
  for (const p of ports) killByPort(p);

  // Remove pid files if present
  const pids = ['.gw.pid', '.mc.pid', '.pl.pid', '.im.pid', '.ga.pid', '.mca.pid', '.dev.pid'];
  for (const f of pids) {
    spawnSync('bash', ['-lc', `rm -f ${f}`], { stdio: 'ignore' });
  }
}

main();

