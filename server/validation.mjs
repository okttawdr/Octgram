import { HttpError } from "./http.mjs";

export const invalid = (message = "Data yang dikirim tidak valid.") => new HttpError(422, "VALIDATION_ERROR", message);
export function integer(value, { min = 1 } = {}) { const n = Number(value); if (!Number.isSafeInteger(n) || n < min) throw invalid(); return n; }
export function optionalInteger(value) { return value == null || value === "" ? null : integer(value); }
export function boolean(value) { if (typeof value !== "boolean") throw invalid(); return value; }
export function string(value, { min = 0, max = 2200 } = {}) { if (typeof value !== "string" || value.trim().length < min || value.length > max) throw invalid(); return value; }
export function uuid(value) { const text = string(value, { min: 36, max: 36 }); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw invalid(); return text; }
export function object(value) { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(); return value; }
export function media(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw invalid("Pilih 1–20 foto.");
  return value.map((item) => {
    object(item);
    return { path: string(item.path, { min: 42, max: 180 }), width: integer(item.width), height: integer(item.height), bytes: integer(item.bytes, { min: 1 }) > 1150000 ? (() => { throw invalid("Foto melebihi 1 MB setelah kompresi."); })() : integer(item.bytes) };
  });
}
