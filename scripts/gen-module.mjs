import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const moduleName = process.argv[2];
if (!moduleName) {
  console.error("Usage: npm run gen:module <module-name>");
  process.exit(1);
}

const valid = /^[a-z][a-z0-9-]*$/.test(moduleName);
if (!valid) {
  console.error("Module name must be kebab-case.");
  process.exit(1);
}

const root = process.cwd();
const moduleDir = path.join(root, "apps/api/src/modules", moduleName);

try {
  await access(moduleDir);
  console.error(`Module already exists: ${moduleDir}`);
  process.exit(1);
} catch {
  // not found is expected
}

await mkdir(moduleDir, { recursive: true });

const template = `import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";

const ${toCamel(moduleName)}Schema = z.object({
  id: z.string().uuid()
});

export const ${toCamel(moduleName)}Module: FastifyPluginAsync = async (app) => {
  app.get("/api/${moduleName}/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = ${toCamel(moduleName)}Schema.parse((request as any).params);
    return { id: params.id, module: "${moduleName}" };
  });
};
`;

await writeFile(path.join(moduleDir, "index.ts"), template, "utf8");

console.log(`Created module scaffold: apps/api/src/modules/${moduleName}/index.ts`);

function toCamel(input) {
  return input.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
