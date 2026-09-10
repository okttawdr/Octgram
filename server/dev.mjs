import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env") && process.loadEnvFile) process.loadEnvFile(".env");
const children = [
  spawn(process.execPath, ["--watch", "server/index.mjs"], { stdio: "inherit", env: process.env }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: "inherit", env: process.env }),
];
const stop = () => children.forEach((child) => child.kill("SIGTERM"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
for (const child of children) child.on("exit", (code) => { if (code) { stop(); process.exitCode = code; } });
