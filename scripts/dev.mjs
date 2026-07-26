import { spawn } from "child_process";
import path from "path";

import { getProjectRoot, readPort, resolvePlaywrightBrowsersPath } from "./read-env-port.mjs";

const port = readPort();
const root = getProjectRoot();
const browsersPath = resolvePlaywrightBrowsersPath();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

console.log(`Starting dev server on port ${port}`);
console.log(`Admin panel: http://localhost:${port}/admin`);
console.log(`Playwright browsers: ${browsersPath}`);

const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  stdio: "inherit",
  cwd: root,
  env: {
    ...process.env,
    PORT: port,
    // Force override Cursor sandbox cache path (Next .env does not override existing env).
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    PLAYWRIGHT_BROWSERS_PATH_STABLE: browsersPath,
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
