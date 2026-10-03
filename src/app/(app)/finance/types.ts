export type FinanceActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialFinanceActionState: FinanceActionState = { status: "idle" };

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "asset", label: "Ativo" },
  { value: "liability", label: "Passivo" },
  { value: "equity", label: "Patrimônio" },
  { value: "revenue", label: "Receita" },
  { value: "expense", label: "Despesa" },
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Ativo",
  liability: "Passivo",
  equity: "Patrimônio",
  revenue: "Receita",
  expense: "Despesa",
};

export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isActive: boolean;
};

export type JournalLine = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  direction: "debit" | "credit";
  amountCents: number;
};

export type JournalEntry = {
  id: string;
  occurredAt: string;
  description: string;
  lines: JournalLine[];
};

export type Charge = {
  id: string;
  description: string;
  totalCents: number;
  status: "open" | "paid" | "void";
};
