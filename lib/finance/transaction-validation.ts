import { z } from "zod"
import type { Transaction } from "@/lib/types"
import { MAX_INSTALLMENTS } from "./installments"

const kindSchema = z.enum(["expense", "income", "adjustment", "transfer"])

export const installmentsSchema = z.object({
  count: z.number().int().min(2).max(MAX_INSTALLMENTS),
  rate: z.number().finite().min(0).max(1000),
  rateType: z.enum(["monthly", "annual"]),
})

export const transactionSchema = z
  .object({
    id: z.string().min(1),
    accountId: z.string().min(1),
    kind: kindSchema,
    amount: z.number().finite(),
    category: z.string().min(1),
    description: z.string().optional(),
    occurredAt: z
      .string()
      .refine((value) => Number.isFinite(Date.parse(value)), {
        message: "Fecha inválida",
      }),
    transferPairId: z.string().min(1).optional(),
    direction: z.enum(["in", "out"]).optional(),
    // null = quitar el plan de cuotas (volver a una cuota) en un PATCH.
    installments: installmentsSchema.nullable().optional(),
  })
  .superRefine((tx, ctx) => {
    if (tx.kind === "adjustment") {
      if (tx.amount < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: "El balance no puede ser negativo",
        })
      }
      return
    }
    if (tx.amount <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "El monto debe ser positivo",
      })
    }
    if (tx.installments && tx.kind !== "expense") {
      ctx.addIssue({
        code: "custom",
        path: ["installments"],
        message: "Solo los gastos se pueden diferir a cuotas",
      })
    }
    if (tx.kind === "transfer" && (!tx.direction || !tx.transferPairId)) {
      ctx.addIssue({
        code: "custom",
        message: "El traslado requiere dirección y pareja",
      })
    }
  })

export function parseTransaction(value: unknown): Transaction {
  const { installments, ...tx } = transactionSchema.parse(value)
  return (installments ? { ...tx, installments } : tx) as Transaction
}
