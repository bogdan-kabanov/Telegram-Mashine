import { spawn } from "child_process";
import path from "path";

import { getProjectRoot, readPort } from "./read-env-port.mjs";

const port = readPort();
const root = getProjectRoot();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

console.log(`Starting production server on port ${port}`);

const child = spawn(process.execPath, [nextBin, "start", "-p", port], {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, PORT: port },
});

child.on("exit", (code) => process.exit(code ?? 0));
