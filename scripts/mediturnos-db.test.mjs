import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

async function db() {
  const pg = new PGlite();
  await pg.waitReady;
  const auth = readFileSync(new URL("../migrations/0001_auth.sql", import.meta.url), "utf8");
  const app = readFileSync(new URL("../migrations/0002_mediturnos.sql", import.meta.url), "utf8");
  await pg.exec(auth);
  await pg.exec(app);
  await pg.exec(`
    insert into "user" (id, name, email, "emailVerified", "updatedAt") values
      ('prof', 'Dra', 'dra@test', false, now()),
      ('pac', 'Pac', 'pac@test', false, now());
    insert into patients (id, nombre, dni) values (1, 'Ana', '30111222');
  `);
  return pg;
}

test("no permite dos turnos activos en el mismo horario", async () => {
  const pg = await db();
  await pg.exec(`
    insert into turnos (patient_id, professional_user_id, fecha, hora, motivo, estado, created_by)
    values (1, 'prof', '2026-10-14', '11:00', 'Consulta', 'Pendiente', 'prof');
  `);
  await assert.rejects(() =>
    pg.exec(`
      insert into turnos (patient_id, professional_user_id, fecha, hora, motivo, estado, created_by)
      values (1, 'prof', '2026-10-14', '11:00', 'Control', 'Confirmado', 'prof');
    `),
  );
});

test("un turno cancelado libera el horario", async () => {
  const pg = await db();
  await pg.exec(`
    insert into turnos (patient_id, professional_user_id, fecha, hora, motivo, estado, created_by)
    values (1, 'prof', '2026-10-15', '09:00', 'Consulta', 'Cancelado', 'prof');
    insert into turnos (patient_id, professional_user_id, fecha, hora, motivo, estado, created_by)
    values (1, 'prof', '2026-10-15', '09:00', 'Control', 'Pendiente', 'prof');
  `);
  const rows = await pg.query("select count(*)::int as n from turnos");
  assert.equal(rows.rows[0].n, 2);
});

test("el DNI de paciente es único", async () => {
  const pg = await db();
  await assert.rejects(() => pg.exec("insert into patients (nombre, dni) values ('Otro', '30111222')"));
});
