import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist/admin", { recursive: true });
await copyFile("dist/index.html", "dist/admin/index.html");
await copyFile("dist/index.html", "dist/404.html");
