import { bearerToken, HttpError } from "./http.mjs";

export async function authenticate(request, gateway) {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Sesi tidak valid. Silakan masuk kembali.");
  const user = await gateway.authenticate(token);
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Sesi tidak valid. Silakan masuk kembali.");
  return { token, user };
}
