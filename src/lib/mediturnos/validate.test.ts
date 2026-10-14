import assert from "node:assert/strict";
import test from "node:test";
import {
  isWeekday,
  loginKey,
  normalizeDni,
  normalizeEmail,
  validatePassword,
  withinBookingWindow,
} from "./validate.ts";

test("normaliza correo y rechaza formatos inválidos", () => {
  assert.equal(normalizeEmail("  Ana@Mail.com "), "ana@mail.com");
  assert.equal(normalizeEmail("no-es-correo"), null);
});

test("normaliza DNI y exige entre 7 y 10 dígitos", () => {
  assert.equal(normalizeDni("32.456.789"), "32456789");
  assert.equal(normalizeDni("123"), null);
});

test("la política de contraseña rechaza 1234 y acepta Medi1234", () => {
  assert.match(validatePassword("1234") ?? "", /8 y 72/);
  assert.equal(validatePassword("Medi1234"), null);
  assert.match(validatePassword("sololetras") ?? "", /letra y un número/);
});

test("solo reserva días hábiles dentro de la ventana", () => {
  assert.equal(isWeekday("2026-10-17"), false);
  assert.equal(isWeekday("2026-10-14"), true);
  assert.equal(withinBookingWindow("2026-10-13", "2026-10-14"), false);
  assert.equal(withinBookingWindow("2026-10-14", "2026-10-14"), true);
});

test("la clave de intentos agrupa el mismo DNI con puntos", () => {
  assert.equal(loginKey("local", "32.456.789"), loginKey("local", "32456789"));
});
