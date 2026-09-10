import { useEffect, useState } from "react";
import { errorText } from "./lib";
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setValue(undefined);
    fn()
      .then((v) => {
        if (active) setValue(v);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [...deps, version]);
  return {
    value,
    setValue,
    error,
    busy,
    reload: () => setVersion((v) => v + 1),
  };
}
