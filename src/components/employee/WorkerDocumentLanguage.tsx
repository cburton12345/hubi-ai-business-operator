"use client";

import { useEffect } from "react";
import type { WorkerLocale } from "@/lib/employee/worker-locale";

export function WorkerDocumentLanguage({ language }: { language: WorkerLocale }) {
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language === "es" ? "es-US" : "en-US";
    return () => {
      document.documentElement.lang = previous || "en";
    };
  }, [language]);
  return null;
}
