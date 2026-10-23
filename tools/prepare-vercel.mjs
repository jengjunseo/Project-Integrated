// Package an already validated static Vite build using Vercel Build Output API v3.
import { cp, mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve("."),
  output = resolve(".vercel/output");
if (!output.startsWith(root + "\\") && !output.startsWith(root + "/"))
  throw Error("Output is outside project");
await stat("dist/sw.js");
await stat("dist/content/catalog.json");
const linked = JSON.parse(await readFile(".vercel/project.json", "utf8"));
if (
  linked.projectId !== "prj_qFfWKbTQjxqkIU0vzDVGYNk31JNO" ||
  linked.orgId !== "team_NPAeLtWZKTzyFZjgL4TYmmRn"
)
  throw Error("Unexpected Vercel project/team");
const config = JSON.parse(await readFile("vercel.json", "utf8"));
const staticRoot = resolve(output, "static");
if (staticRoot !== resolve(root, ".vercel/output/static"))
  throw Error("Unexpected static output path");
await rm(staticRoot, { recursive: true, force: true });
await mkdir(staticRoot, { recursive: true });
await cp("dist", resolve(output, "static"), { recursive: true, force: true });
await rm(resolve(output, "builds.json"), { force: true }); // Discard failed CLI builder metadata; this package has its own reproducible build.
await writeFile(
  resolve(output, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        ...config.headers.map((h) => ({
          src: h.source,
          headers: Object.fromEntries(h.headers.map((v) => [v.key, v.value])),
          continue: true,
        })),
        { src: "/", dest: "/index.html" },
        { handle: "filesystem" },
      ],
    },
    null,
    2,
  ),
);
console.log(
  "Build Output API v3: validated dist packaged for " + linked.projectName,
);
