import { useEffect } from "react";

export const confirmDiscardUnsavedChanges = (isDirty: boolean) => {
  if (!isDirty || typeof window === "undefined") {
    return true;
  }

  return window.confirm(
    "You have unsaved changes in this tender stage. Leave without saving?",
  );
};

export const useUnsavedChangesWarning = (isDirty: boolean) => {
  useEffect(() => {
    if (!isDirty || typeof window === "undefined") {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);
};
