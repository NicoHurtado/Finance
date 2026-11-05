"use client";
import { useAccountsStore } from "@/lib/store/accounts";
import type { AccountType } from "@/lib/types";
import { AccountCard } from "./account-card";
import { ProductRow } from "./product-row";

const GROUPS: { type: AccountType; label: string }[] = [
  { type: "debit", label: "Débito" },
  { type: "credit", label: "Crédito" },
  { type: "fixed_income", label: "Renta Fija" },
  { type: "investment", label: "Inversiones" },
];

export function AccountsGrid({ homeOnly = false }: { homeOnly?: boolean }) {
  const all = useAccountsStore((s) => s.activeAccounts);
  const accounts = homeOnly ? all.filter((a) => a.showOnHome !== false) : all;

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {all.length > 0
          ? "No hay tarjetas visibles. Usa Organizar para mostrarlas aquí."
          : "Aún no tienes cuentas."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {GROUPS.map(({ type, label }) => {
        const group = accounts.filter((a) => a.type === type);
        if (group.length === 0) return null;
        return (
          <div key={type} className="space-y-2">
            <h3 className="text-[12px] font-medium tracking-[-0.005em] text-muted-foreground">
              {label}
              <span className="ml-2 font-normal opacity-70">{group.length}</span>
            </h3>
            {type === "fixed_income" || type === "investment" ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.map((a) => (
                  <ProductRow key={a.id} account={a} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                {group.map((a) => (
                  <div key={a.id} className="h-full [&>a]:min-w-0 [&>a]:max-w-none [&>a]:w-full">
                    <AccountCard account={a} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
