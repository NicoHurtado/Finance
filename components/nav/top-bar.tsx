"use client";
import { usePathname } from "next/navigation";
import { Home, ListOrdered, Wallet, Target, BarChart3, LayoutGrid, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

const SECTIONS: { prefix: string; label: string; icon: LucideIcon }[] = [
  { prefix: "/historial", label: "Historial", icon: ListOrdered },
  { prefix: "/cuentas/suscripciones", label: "Suscripciones", icon: Wallet },
  { prefix: "/cuentas", label: "Cuentas", icon: Wallet },
  { prefix: "/metas", label: "Metas", icon: Target },
  { prefix: "/analisis", label: "Análisis", icon: BarChart3 },
  { prefix: "/", label: "Overview", icon: Home },
];

function resolveSection(pathname: string) {
  return (
    SECTIONS.find((s) => (s.prefix === "/" ? pathname === "/" : pathname.startsWith(s.prefix))) ??
    { label: "Coffee", icon: LayoutGrid }
  );
}

/**
 * Thin sticky strip above every desktop page: a breadcrumb-style page title
 * (derived from the route) on the left, quick actions on the right. Gives
 * every page a consistent anchor point instead of each PageHeader floating
 * at the top of its own scroll container.
 */
export function TopBar() {
  const pathname = usePathname();
  const section = resolveSection(pathname);
  const Icon = section.icon;

  return (
    <div className="hidden md:flex sticky top-0 z-30 h-14 items-center justify-between gap-4 border-b bg-background/90 px-6 backdrop-blur-md lg:px-8">
      <div className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.005em] text-foreground">
        <Icon className="size-4 text-muted-foreground" />
        {section.label}
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
      </div>
    </div>
  );
}
