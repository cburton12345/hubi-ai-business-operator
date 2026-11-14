"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  House,
  Menu,
  Phone,
  Sparkles,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type MobileNavigationIcon =
  "ask" | "calls" | "customers" | "money" | "schedule" | "today" | "work";

export type MobileNavigationItem = {
  href: string;
  icon: MobileNavigationIcon;
  label: string;
  paths: readonly string[];
};

export type MobileToolSection = {
  label: string;
  links: ReadonlyArray<readonly [label: string, href: string]>;
};

const icons: Record<MobileNavigationIcon, LucideIcon> = {
  ask: Sparkles,
  calls: Phone,
  customers: UsersRound,
  money: CircleDollarSign,
  schedule: CalendarDays,
  today: House,
  work: BriefcaseBusiness,
};

export function isMobilePathActive(
  currentPath: string,
  paths: readonly string[],
) {
  return paths.some(
    (path) =>
      currentPath === path ||
      (path !== "/app" && currentPath.startsWith(`${path}/`)),
  );
}

export function MobileAppNav({
  items,
  sections,
  workspaceName,
}: {
  items: readonly MobileNavigationItem[];
  sections: readonly MobileToolSection[];
  workspaceName: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  const closeMenu = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => moreButtonRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;

      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleDialogKeys);
    };
  }, [closeMenu, open]);

  return (
    <>
      {open ? (
        <div
          aria-label="All Ferocity tools"
          aria-modal="true"
          className="mobile-tools-dialog"
          role="dialog"
        >
          <button
            aria-label="Close all tools"
            className="mobile-tools-backdrop"
            onClick={() => closeMenu()}
            type="button"
          />
          <section
            className="mobile-tools-sheet"
            id="ferocity-mobile-tools"
            ref={sheetRef}
          >
            <header>
              <div>
                <span>Workspace</span>
                <strong>{workspaceName}</strong>
              </div>
              <button
                aria-label="Close all tools"
                className="mobile-tools-close"
                onClick={() => closeMenu()}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </header>
            <div className="mobile-tools-sections">
              {sections.map((section) => (
                <section key={section.label}>
                  <p>{section.label}</p>
                  <div>
                    {section.links.map(([label, href]) => (
                      <Link
                        aria-current={
                          isMobilePathActive(pathname, [href])
                            ? "page"
                            : undefined
                        }
                        href={href}
                        key={`${section.label}-${href}`}
                        onClick={() => closeMenu(false)}
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <nav className="mobile-app-nav" aria-label="Ferocity mobile navigation">
        {items.map((item) => {
          const Icon = icons[item.icon];
          const active = isMobilePathActive(pathname, item.paths);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={
                item.icon === "ask" ? "mobile-app-nav-primary" : undefined
              }
              href={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
            >
              <span>
                <Icon aria-hidden="true" size={20} />
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          aria-controls="ferocity-mobile-tools"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          ref={moreButtonRef}
          type="button"
        >
          <span>
            <Menu aria-hidden="true" size={20} />
          </span>
          More
        </button>
      </nav>
    </>
  );
}
