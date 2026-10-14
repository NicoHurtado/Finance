export type AccountType = "debit" | "credit" | "fixed_income" | "investment";
export type Currency = "USD" | "COP";
export type CardNetwork = "visa" | "mastercard" | "amex" | "other";

export type Category = string;

export type TransactionKind = "expense" | "income" | "adjustment" | "transfer";
export type TransferDirection = "in" | "out";

export interface BaseAccount {
  id: string;
  type: AccountType;
  institution: string;
  name: string;
  currency: Currency;
  initialBalance: number;
  createdAt: string;
  color?: string;
  presetId?: string;
  /** Real photo of the card, pasted by the user. Overrides the preset art. */
  artImageUrl?: string;
  /** Short label (~5 chars) shown inside the mini-card tile. */
  miniLabel?: string;
  active?: boolean;
  /** Defaults to visible. Only affects the account's presentation on Home. */
  showOnHome?: boolean;
}

export interface DebitAccount extends BaseAccount {
  type: "debit";
  last4?: string;
  network?: CardNetwork;
}
export interface InvestmentAccount extends BaseAccount {
  type: "investment";
  syncUrl?: string;
  syncToken?: string;
  lastSyncDate?: string; // YYYY-MM-DD — date of last successful sync
}
export interface CreditAccount extends BaseAccount {
  type: "credit";
  creditLimit: number;
  last4: string;
  expDate: string;
  network: CardNetwork;
}
export interface FixedIncomeAccount extends BaseAccount {
  type: "fixed_income";
  annualRate: number;
  startDate: string;
  maturityDate?: string;
  isGoal?: boolean;
  goalTarget?: number;
  goalName?: string;
}

export type Account =
  | DebitAccount
  | CreditAccount
  | FixedIncomeAccount
  | InvestmentAccount;

export interface Subscription {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  currency: Currency;
  category: Category;
  /** Day of month the subscription is charged (1-31). Clamped to the last day
   *  of shorter months (e.g. 31 charges on Feb 28/29). */
  billingDay: number;
  active: boolean;
  createdAt: string;
  /** "YYYY-MM" of the last month a transaction was auto-created for this
   *  subscription. Prevents the cron job from double-charging. */
  lastChargedMonth?: string;
}

export type InstallmentRateType = "monthly" | "annual";

/** Compra con tarjeta de crédito diferida a varias cuotas. Sin este campo la
 *  compra es a una sola cuota (el comportamiento por defecto). */
export interface Installments {
  /** Número de cuotas (2-72). */
  count: number;
  /** Tasa de interés en porcentaje (p. ej. 1.9 para 1,9%). 0 = sin interés. */
  rate: number;
  /** "monthly" = mes vencido (M.V.), "annual" = efectiva anual (E.A.). */
  rateType: InstallmentRateType;
}

export interface Transaction {
  id: string;
  accountId: string;
  kind: TransactionKind;
  amount: number;
  category: Category;
  description?: string;
  occurredAt: string;
  transferPairId?: string;
  /** Solo cuando kind === "transfer": "out" sale de la cuenta, "in" entra.
   *  Registros viejos sin este campo se tratan como "out" (compat). */
  direction?: TransferDirection;
  /** Solo gastos en tarjetas de crédito diferidos a más de una cuota. */
  installments?: Installments;
}
