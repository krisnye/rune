import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const packagesDir = path.join(rootDir, "packages");
const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== "--");

const readJson = async (filePath) => {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const main = async () => {
  let entries = [];

  try {
    entries = await readdir(packagesDir, { withFileTypes: true });
  } catch {
    console.log("No packages directory found. Nothing to publish.");
    return;
  }

  const packageDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name));

  const manifests = await Promise.all(
    packageDirs.map(async (directory) => {
      const manifestPath = path.join(directory, "package.json");
      try {
        const manifest = await readJson(manifestPath);
        return { directory, manifest };
      } catch {
        return null;
      }
    })
  );

  const publishable = manifests
    .filter((item) => item !== null && item.manifest.private !== true)
    .map((item) => item.manifest.name);

  if (publishable.length === 0) {
    console.log("No public packages found. Nothing to publish.");
    return;
  }

  for (const packageName of publishable) {
    console.log(`Publishing ${packageName}...`);
    run("pnpm", ["--filter", packageName, "publish", ...passthroughArgs]);
  }
};

void main();
