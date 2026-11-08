"use client";

import { useEffect, useState } from "react";
import type { WorkerLocale } from "@/lib/employee/worker-locale";

export function useWorkerDeviceLocale() {
  const [language, setLanguage] = useState<WorkerLocale>("en");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLanguage(localStorage.getItem("ferocity-field-language") === "es" ? "es" : "en");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return language;
}
