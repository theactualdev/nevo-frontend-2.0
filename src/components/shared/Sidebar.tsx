"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Nevo Sidebar (Design System v2 §6) — left navigation across all three apps.
 * Expanded 240px / collapsed 64px, on the darker Cream Sidebar tone. Active item
 * = navy icon square + violet 3px accent bar.
 */
export function Sidebar({
  items,
  activeHref,
  user,
  defaultCollapsed = false,
  collapsed: collapsedProp,
  onToggle,
  className,
}: {
  items: NavItem[];
  activeHref?: string;
  user?: {
    name: string;
    subtitle?: string;
    initials: string;
    /** The disc's colours, when the person chose them. Navy otherwise. */
    tone?: { background: string; text: string };
    /**
     * Where the row leads: the person's own profile. `Nevo Sidebar Rail`
     * draws this row AS the way into Profile, with the same active state as a
     * tab. Inert without it, for a console that has not wired one.
     */
    href?: string;
  };
  defaultCollapsed?: boolean;
  /** Controlled collapse. Omit to let the sidebar manage its own state. */
  collapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  className?: string;
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const collapsed = collapsedProp ?? internalCollapsed;
  const toggle = () =>
    onToggle ? onToggle(!collapsed) : setInternalCollapsed((v) => !v);
  const userActive = !!user?.href && user.href === activeHref;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full flex-col gap-1 bg-nevo-cream-sidebar p-3 transition-[width] duration-200",
        collapsed ? "w-16 items-center" : "w-60",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-13 items-center",
          collapsed ? "justify-center" : "px-3",
        )}
      >
        {collapsed ? (
          /* Icon crop out of the padded 1080² file, as TeacherSidebar does. */
          <span className="relative block size-[22px] overflow-hidden">
            <Image
              src="/brand/logo-icon-purple.png"
              alt="Nevo"
              width={1080}
              height={1080}
              priority
              className="absolute block h-[135px] w-[135px] max-w-none -translate-x-[56.5px] -translate-y-[59.4px]"
            />
          </span>
        ) : (
          <Image
            src="/brand/nevo-wordmark.png"
            alt="Nevo"
            width={344}
            height={116}
            priority
            className="h-[18px] w-auto"
          />
        )}
      </div>

      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "relative flex h-12 items-center rounded-[10px] transition-colors duration-[130ms]",
              collapsed ? "w-full justify-center" : "gap-3 px-1",
              active ? "bg-nevo-navy/8" : "hover:bg-nevo-navy/5",
            )}
          >
            {active && (
              <span className="absolute top-3 left-0 h-6 w-[3px] rounded-full bg-nevo-violet" />
            )}
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-[10px]",
                !collapsed && "ml-1",
                active
                  ? "bg-nevo-navy text-nevo-cream"
                  : "text-nevo-near-black",
              )}
            >
              <Icon icon={item.icon} />
            </span>
            {!collapsed && (
              <span
                className={cn(
                  "text-[15px] whitespace-nowrap",
                  active
                    ? "font-medium text-nevo-navy"
                    : "text-nevo-near-black",
                )}
              >
                {item.label}
              </span>
            )}
          </Link>
        );
      })}

      <div className="flex-1" />

      <button
        type="button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={toggle}
        className="flex h-10 cursor-pointer items-center justify-center rounded-[10px] text-nevo-near-black transition-colors hover:bg-nevo-near-black/[0.04]"
      >
        <Icon icon={collapsed ? ChevronRight : ChevronLeft} size="dense" />
      </button>

      {user && (
        // The frame's hairline between the controls and the person.
        <div
          aria-hidden
          className="mt-1 h-px shrink-0 self-stretch bg-nevo-near-black/8"
        />
      )}
      {user && (
        <UserRow href={user.href} active={userActive} collapsed={collapsed}>
          <span
            style={
              user.tone
                ? { background: user.tone.background, color: user.tone.text }
                : undefined
            }
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-nevo-navy text-sm font-semibold text-nevo-cream"
          >
            {user.initials}
          </span>
          {!collapsed && (
            <div className="flex flex-col">
              <span
                className={cn(
                  "text-sm whitespace-nowrap text-nevo-near-black",
                  userActive ? "font-semibold" : "font-medium",
                )}
              >
                {user.name}
              </span>
              {user.subtitle && (
                <span className="text-xs whitespace-nowrap text-nevo-near-black/60">
                  {user.subtitle}
                </span>
              )}
            </div>
          )}
        </UserRow>
      )}
    </nav>
  );
}

/**
 * The person at the foot of the rail. A LINK when there is somewhere to go:
 * it was a plain `div`, so the one row the frame draws as the way into
 * Profile answered a tap with nothing.
 */
function UserRow({
  href,
  active,
  collapsed,
  children,
}: {
  href?: string;
  active: boolean;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const layout = cn(
    "relative flex items-center gap-3 rounded-[10px] py-2",
    collapsed ? "w-full justify-center" : "px-1",
  );
  if (!href) return <div className={layout}>{children}</div>;
  return (
    <Link
      href={href}
      aria-label="Profile"
      aria-current={active ? "page" : undefined}
      title={collapsed ? "Profile" : undefined}
      className={cn(
        layout,
        "cursor-pointer transition-colors duration-[130ms]",
        active ? "bg-nevo-navy/8" : "hover:bg-nevo-navy/5",
      )}
    >
      {active && (
        <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-nevo-violet" />
      )}
      {children}
    </Link>
  );
}
