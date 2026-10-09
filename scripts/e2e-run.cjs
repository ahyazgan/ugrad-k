// E2E çalıştırıcı: sunucuyu başlatır, port açılınca akışı çalıştırır, sonunda sunucuyu (alt süreçleriyle) kapatır.
// `cmd & SERVER=$!; ...; kill $SERVER` kabuk sözdizimi Windows'ta (pnpm betikleri cmd.exe ile çalışır) sunucuyu
// ön planda bırakıp akışı hiç başlatmıyordu; bu betik Linux, macOS ve Windows'ta aynı çalışır.
// Kullanım: node ../../scripts/e2e-run.cjs <port> <akış.cjs> [akış çıktısı] -- <sunucu komutu...>
const { spawn, spawnSync } = require("child_process");
const net = require("net");

const sep = process.argv.indexOf("--");
if (sep < 0 || sep < 4 || sep === process.argv.length - 1) {
  console.error("Kullanım: e2e-run.cjs <port> <akış.cjs> [çıktı klasörü] -- <sunucu komutu...>");
  process.exit(2);
}
const [portArg, flow, out = "e2e/shots"] = process.argv.slice(2, sep);
const port = Number(portArg);
const serverCmd = process.argv.slice(sep + 1).join(" ");
const isWin = process.platform === "win32";

function portOpen() {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });
}

// Port zaten doluysa (ör. başka bir projenin sunucusu) testler yanlış uygulamaya karşı koşmasın
const busy = spawnSync(process.execPath, ["-e", `require("net").connect(${port},"127.0.0.1").on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))`]);
if (busy.status === 0) {
  console.error(`FAIL ${port} portu zaten kullanımda; o süreci kapatın veya başka bir port verin.`);
  process.exit(1);
}

// pnpm dışında doğrudan çalıştırıldığında da uygulamanın ve kökün `node_modules/.bin` komutları (next vb.) bulunsun
const path = require("path");
const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const binPath = [path.resolve("node_modules/.bin"), path.resolve(__dirname, "../node_modules/.bin"), process.env[pathKey]].join(path.delimiter);
const server = spawn(serverCmd, {
  shell: true,
  stdio: "inherit",
  detached: !isWin,
  env: { ...process.env, [pathKey]: binPath, PORT: String(port) },
});

function stopServer() {
  if (server.exitCode !== null) return;
  if (isWin) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
}

(async () => {
  const deadline = Date.now() + 120_000;
  while (!(await portOpen())) {
    if (server.exitCode !== null) throw new Error(`sunucu kapandı (çıkış kodu ${server.exitCode})`);
    if (Date.now() > deadline) throw new Error(`${port} portu 120 sn içinde açılmadı`);
    await new Promise((r) => setTimeout(r, 500));
  }
  const run = spawnSync(process.execPath, [flow, out], { stdio: "inherit", env: { ...process.env, PORT: String(port) } });
  return run.status ?? 1;
})()
  .then((code) => {
    stopServer();
    process.exit(code);
  })
  .catch((e) => {
    console.error("FAIL", e.message);
    stopServer();
    process.exit(1);
  });

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopServer(), process.exit(130)));
