/**
 * Import Vlad's conditions (texts + images from public/2026.07.23).
 * Run: node scripts/import-vlad-conditions.mjs
 */
import { randomUUID } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "public", "2026.07.23");
const dataDir = path.join(root, "data");
const projectsPath = path.join(root, "config", "projects.json");
const dbPath = path.join(dataDir, "app.db");

const GRISEL = `😊 Condiciones para trabajar conmigo:

👮‍♂️ El trabajo se realiza dentro del marco legal
⏰ El trabajo toma de 2 a 4 horas 
💛 Estoy disponible 24/7, siempre lista para escucharle y responder sus preguntas 

💸 Depósitos para invertir

600 pesos >>> 70,000 pesos 🇲🇽
850 pesos >>> 180,000 pesos 🇲🇽
1,000 pesos >>> 250,000 pesos 🇲🇽

Listos para empezar a invertir? 🥰`;

const MELISSA_1 = `Ahora te contaré mi historia ❤️
1️⃣ Soy de Argentina 🇦🇷 y nací en Puerto Madero 🇦🇷
2️⃣ Actualmente reside en Puerto Madero 🏠
3️⃣ Mi trabajo no es apostar y no es un casino. Trabajo en los mercados financieros de criptomonedas. 📈
4️⃣ Mi experiencia en el mercado de criptomonedas: 5 años 🤑
5️⃣ Estoy entre las 100 personas más ricas del Argentina 💵
No siempre he sido rica. Nací en un barrio pobre. En mi casa, cuando llovía, el techo goteaba. Esa vida no me convenía. Y comencé a explorar el mundo de las criptomonedas. Sé lo malo que es vivir sin dinero. Y es por eso que quiero ayudar a mis conciudadanos a ganar dinero para que haya menos gente pobre en nuestro país 🇦🇷❤️`;

const MELISSA_2 = `Aquí tienes las opciones de inversión disponibles para hoy, sin riesgo, tu depósito está asegurado, no puedes perder dinero 🏦🤗

📈 Plan de ganancias:
🔷 Con 40.000Ars obtendrás 2.200.000Ars 🇦🇷 💰
🔷 Con 50.000Ars obtendrás 3.500.000Ars 🇦🇷 💰
🔷 Con 120.000Ars obtendrás 7.500.000Ars 🇦🇷 💰
Mayormente mis clientes toman la segunda opción, es la más rentable 💵❤️

Cuánto estás dispuesto a invertir? 👌🇦🇷`;

const PAOLA = `💸 INVERSIONES EN CRIPTO CON
PAOLA 💸

❗️ Términos de inversión ❗️

💰 Haces un depósito de 850 MXN 🇲🇽

🏦 En 1-3 horas obtienes una ganancia
garantizada de ~60,000 MXN 🇲🇽

Esto es posible con mi ayuda! ✅

📊 Me encargo de todas las
operaciones en el mercado de valores
para multiplicar tu dinero 📈

🔒 La seguridad total de tus inversiones
está garantizada 📑 Todo el trabajo está
protegido por el estado ❗️

⬆️ El pago se realiza a través de
cualquier método electrónico que te
resulte cómodo 🤝 💳

Si aún tienes alguna duda, escribe, me
encanta responder ❤️`;

const FRANCESCA = `En este post encontrarás toda la información que necesitas. Y si todavía tiene preguntas, pregúnteme, estoy dispuesto a responder 🥰
1️⃣ Importe del depósito: 20.000 Bs
2️⃣ Ingresos: a partir de 700.000 Bs
3️⃣ Duración del trabajo: de 1 a 5 horas
4️⃣ Mi comisión: 10% del importe de las
ganancias
5️⃣ Pago: en tarjeta bancaria, o crypto wallet (a su solicitud)💳💸

🔹 Toda la actividad de trabajo 100% oficial, legal y segura. Listo para empezar a trabajar ahora mismo?❤️`;

function findSource(predicate) {
  if (!existsSync(srcDir)) throw new Error(`Missing folder: ${srcDir}`);
  const names = readdirSync(srcDir);
  const hit = names.find(predicate);
  if (!hit) throw new Error(`File not found in ${srcDir}: ${names.join(", ")}`);
  return path.join(srcDir, hit);
}

function importImage(projectId, srcPath, filename) {
  const destDir = path.join(dataDir, "media", "conditions", projectId);
  mkdirSync(destDir, { recursive: true });
  const destAbs = path.join(destDir, filename);
  copyFileSync(srcPath, destAbs);
  const relativePath = `data/media/conditions/${projectId}/${filename}`;

  if (existsSync(dbPath)) {
    const db = new Database(dbPath);
    const existing = db
      .prepare("SELECT id FROM media_assets WHERE project_id = ? AND type = 'conditions' AND path = ?")
      .get(projectId, relativePath);
    if (!existing) {
      db.prepare(
        `INSERT INTO media_assets (id, project_id, type, filename, path, mime_type, created_at)
         VALUES (?, ?, 'conditions', ?, ?, 'image/jpeg', ?)`,
      ).run(randomUUID(), projectId, filename, relativePath, new Date().toISOString());
    }
    db.close();
  }

  return relativePath;
}

const nancySrc = findSource((n) => /условия|работ/i.test(n));
const francescaSrc = findSource((n) => /^photo_/i.test(n));

const nancyPath = importImage("nancy", nancySrc, "condiciones.jpg");
const francescaPath = importImage("francesca", francescaSrc, "condiciones.jpg");

const projects = JSON.parse(readFileSync(projectsPath, "utf8"));

for (const p of projects.projects) {
  if (p.id === "nancy") {
    p.conditionsImagePath = nancyPath;
    delete p.conditionsTexts;
  }
  if (p.id === "grisel") {
    p.conditionsTexts = [GRISEL];
    delete p.conditionsImagePath;
  }
  if (p.id === "melissa") {
    p.conditionsTexts = [MELISSA_1, MELISSA_2];
    delete p.conditionsImagePath;
  }
  if (p.id === "paola") {
    p.conditionsTexts = [PAOLA];
    delete p.conditionsImagePath;
  }
  if (p.id === "francesca") {
    p.conditionsImagePath = francescaPath;
    p.conditionsTexts = [FRANCESCA];
  }
}

writeFileSync(projectsPath, `${JSON.stringify(projects, null, 2)}\n`, "utf8");
console.log("OK");
console.log("nancy image:", nancyPath);
console.log("francesca image:", francescaPath);
console.log("texts: grisel, melissa×2, paola, francesca");
