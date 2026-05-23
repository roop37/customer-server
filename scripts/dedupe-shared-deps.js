#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const packageRoot = path.resolve(__dirname, "..");
const packageName = path.basename(packageRoot);
const packageNm = path.join(packageRoot, "node_modules");

const targets = [
  { rel: "graphql" },
  { rel: "type-graphql" },
  { rel: "mongoose" },
  { rel: path.join("@typegoose", "typegoose") },
];

const resolveSharedDependencyRoot = () => {
  try {
    const sharedPkg = require.resolve("@hoizr-technology/shared/package.json", {
      paths: [packageRoot],
    });
    const sharedRoot = path.dirname(sharedPkg);
    const directNodeModules = path.join(sharedRoot, "node_modules");
    if (fs.existsSync(directNodeModules)) return directNodeModules;

    const linkedPackageNodeModules = path.resolve(sharedRoot, "..", "..");
    if (path.basename(linkedPackageNodeModules) === "node_modules") {
      return linkedPackageNodeModules;
    }
  } catch {
    return null;
  }
  return null;
};

const sharedDependencyRoot = resolveSharedDependencyRoot();

if (!sharedDependencyRoot || !fs.existsSync(packageNm)) {
  console.warn(
    `[dedupe-shared-deps] skipping — shared package or ${packageName}/node_modules not found`
  );
  process.exit(0);
}

let changed = 0;
for (const { rel } of targets) {
  const sharedPath = path.join(sharedDependencyRoot, rel);
  const packagePath = path.join(packageNm, rel);
  if (!fs.existsSync(packagePath)) {
    console.warn(`[dedupe-shared-deps] ${packageName} is missing ${rel} — skipping`);
    continue;
  }

  let isLinkToPackage = false;
  try {
    const stat = fs.lstatSync(sharedPath);
    if (stat.isSymbolicLink()) {
      isLinkToPackage = fs.realpathSync(sharedPath) === fs.realpathSync(packagePath);
    }
  } catch {
    // Path does not exist yet.
  }
  if (isLinkToPackage) continue;

  fs.rmSync(sharedPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
  fs.symlinkSync(packagePath, sharedPath, "dir");
  changed += 1;
  console.log(`[dedupe-shared-deps] linked ${rel} -> ${packageName}`);
}

if (changed === 0) {
  console.log("[dedupe-shared-deps] all targets already linked");
}
