import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const deployDir =
  process.platform === "win32"
    ? "C:/gh-pages-deploy/Inazuma-tfg"
    : path.join(process.env.TMPDIR || "/tmp", "inazuma-tfg-gh-pages");
const repoUrl = execFileSync("git", ["remote", "get-url", "origin"], {
  encoding: "utf8",
}).trim();

if (!existsSync(distDir)) {
  throw new Error("La carpeta dist no existe. Ejecuta primero npm run build.");
}

rmSync(deployDir, { recursive: true, force: true });
mkdirSync(path.dirname(deployDir), { recursive: true });

execFileSync(
  "git",
  ["clone", "--branch", "gh-pages", "--single-branch", repoUrl, deployDir],
  { stdio: "inherit" },
);

for (const entry of readdirSync(deployDir, { withFileTypes: true })) {
  if (entry.name === ".git") continue;
  rmSync(path.join(deployDir, entry.name), { recursive: true, force: true });
}

for (const entry of readdirSync(distDir, { withFileTypes: true })) {
  cpSync(path.join(distDir, entry.name), path.join(deployDir, entry.name), {
    recursive: true,
  });
}

writeFileSync(path.join(deployDir, ".nojekyll"), "");

execFileSync("git", ["-C", deployDir, "add", "-A"], { stdio: "inherit" });

const status = execFileSync("git", ["-C", deployDir, "status", "--porcelain"], {
  encoding: "utf8",
}).trim();

if (!status) {
  console.log("No hay cambios para publicar en gh-pages.");
  process.exit(0);
}

execFileSync(
  "git",
  ["-C", deployDir, "commit", "-m", "Deploy to GitHub Pages"],
  { stdio: "inherit" },
);
execFileSync("git", ["-C", deployDir, "push", repoUrl, "gh-pages"], {
  stdio: "inherit",
});