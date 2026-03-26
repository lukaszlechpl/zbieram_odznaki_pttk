import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(process.cwd());
const sourceAppDir = resolve(rootDir, "OdznakaGO");
const sourceAssetsDir = resolve(rootDir, "zasoby");
const deployDir = resolve(rootDir, ".deploy");
const deployAppDir = resolve(deployDir, "OdznakaGO");

if (!existsSync(sourceAppDir)) {
  throw new Error("Brak katalogu OdznakaGO.");
}

if (!existsSync(sourceAssetsDir)) {
  throw new Error("Brak katalogu zasoby.");
}

rmSync(deployDir, { recursive: true, force: true });
mkdirSync(deployDir, { recursive: true });
mkdirSync(deployAppDir, { recursive: true });

cpSync(sourceAppDir, deployAppDir, { recursive: true });
cpSync(sourceAssetsDir, resolve(deployDir, "zasoby"), { recursive: true });
cpSync(sourceAssetsDir, resolve(deployAppDir, "zasoby"), { recursive: true });

writeFileSync(resolve(deployDir, ".nojekyll"), "");

// Redirect root URL (/) -> correct app path (/OdznakaGO/).
// GitHub Pages w trybie "root" wymaga pliku index.html w katalogu publikacji.
writeFileSync(
  resolve(deployDir, "index.html"),
  `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=./OdznakaGO/" />
    <title>OdznakaGO</title>
    <script>
      // Fallback redirect without relying solely on meta refresh.
      window.location.replace("./OdznakaGO/");
    </script>
  </head>
  <body>
    <p>Przekierowywanie do aplikacji... Jeśli nie zadziała automatycznie, przejdź: <a href="./OdznakaGO/">OdznakaGO</a></p>
  </body>
</html>
`,
);

console.log("Gotowe: przygotowano katalog .deploy do hostingu.");
