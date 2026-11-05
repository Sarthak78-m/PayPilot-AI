import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const PROJECT_ROOT = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  // 1. Intercept server-only virtual module
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {}",
      shortCircuit: true,
    };
  }

  // 2. Resolve @/ alias to ./src/
  let candidate = specifier;
  if (candidate.startsWith("@/")) {
    const relPath = candidate.slice(2);
    const absPath = path.resolve(PROJECT_ROOT, "src", relPath);
    candidate = pathToFileURL(absPath).href;
  }

  // 3. Resolve relative or file URL imports without extension or index.js
  let targetPath = null;
  if (candidate.startsWith("file://")) {
    targetPath = fileURLToPath(candidate);
  } else if (context.parentURL && (candidate.startsWith("./") || candidate.startsWith("../"))) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    targetPath = path.resolve(parentDir, candidate);
  }

  if (targetPath) {
    // If exact file exists
    if (existsSync(targetPath) && statSync(targetPath).isFile()) {
      return {
        url: pathToFileURL(targetPath).href,
        shortCircuit: true,
      };
    }
    // Check targetPath + .js
    if (existsSync(`${targetPath}.js`) && statSync(`${targetPath}.js`).isFile()) {
      return {
        url: pathToFileURL(`${targetPath}.js`).href,
        shortCircuit: true,
      };
    }
    // Check targetPath + /index.js
    const indexPath = path.join(targetPath, "index.js");
    if (existsSync(indexPath) && statSync(indexPath).isFile()) {
      return {
        url: pathToFileURL(indexPath).href,
        shortCircuit: true,
      };
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file://") && url.endsWith(".js") && !url.includes("node_modules")) {
    return nextLoad(url, { ...context, format: "module" });
  }
  return nextLoad(url, context);
}
