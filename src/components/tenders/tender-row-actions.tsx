import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";

import { Button } from "../ui/button";
import type { TenderSummary } from "../../../shared/types";

type TenderRowActionsProps = {
  onArchive: (record: TenderSummary) => void;
  onContinue: (record: TenderSummary) => void;
  onDelete: (record: TenderSummary) => void;
  onDuplicate: (record: TenderSummary) => void;
  record: TenderSummary;
};

export const TenderRowActions = ({
  onArchive,
  onContinue,
  onDelete,
  onDuplicate,
  record,
}: TenderRowActionsProps) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      const menuWidth = 176;
      const estimatedMenuHeight = record.status === "DRAFT_INTAKE" ? 220 : 176;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const left = Math.max(16, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 16));
      const openAbove = rect.bottom + estimatedMenuHeight > viewportHeight - 16 && rect.top > estimatedMenuHeight;
      const top = openAbove ? Math.max(16, rect.top - estimatedMenuHeight - 8) : rect.bottom + 8;

      setPosition({ left, top });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open, record.status]);

  return (
    <div className="relative flex justify-end">
      <Button
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        size="sm"
        type="button"
        variant="ghost"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open
        ? createPortal(
            <div
              className="fixed z-[100] min-w-44 rounded-2xl border border-border bg-white p-2 shadow-xl"
              ref={menuRef}
              style={{ left: position.left, top: position.top }}
            >
              <NavLink
                className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => setOpen(false)}
                to={`/tenders/${record.tenderId}`}
              >
                View Tender
              </NavLink>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onContinue(record);
                }}
                type="button"
              >
                Continue Workflow
              </button>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onDuplicate(record);
                }}
                type="button"
              >
                Duplicate Tender
              </button>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onArchive(record);
                }}
                type="button"
              >
                Archive Tender
              </button>
              {record.status === "DRAFT_INTAKE" ? (
                <button
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  onClick={() => {
                    setOpen(false);
                    onDelete(record);
                  }}
                  type="button"
                >
                  Delete Tender
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
