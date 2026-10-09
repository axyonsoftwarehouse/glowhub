"use client";

import { useRef, useState, useTransition } from "react";
import {
  createGiftCardAction,
  redeemGiftCardAction,
  redeemPointsAction,
  saveLoyaltySettingsAction,
  sendCampaignAction,
} from "./actions";
import {
  initialLoyaltyActionState,
  type ClientOption,
  type LoyaltyActionState,
  type LoyaltySettingsView,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

function Feedback({ state }: { state: LoyaltyActionState }) {
  if (state.status === "error" && (state.message || state.fieldErrors)) {
    return (
      <p className="text-sm text-red-600">
        {state.message ?? Object.values(state.fieldErrors ?? {})[0]?.[0]}
      </p>
    );
  }
  if (state.status === "success" && state.message) {
    return <p className="text-sm text-emerald-700">{state.message}</p>;
  }
  return null;
}

function ClientSelect({ clients }: { clients: ClientOption[] }) {
  return (
    <select name="clientId" defaultValue="" className={inputClass}>
      <option value="">Sem cliente vinculado</option>
      {clients.map((client) => (
        <option key={client.id} value={client.id}>
          {client.name}
        </option>
      ))}
    </select>
  );
}

export function PointsSettingsForm({
  settings,
}: {
  settings: LoyaltySettingsView;
}) {
  const [result, setResult] = useState<LoyaltyActionState>(
    initialLoyaltyActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setResult(
        await saveLoyaltySettingsAction(initialLoyaltyActionState, formData),
      );
    });
  }

  return (
    <details className="rounded-2xl border border-border bg-white/70 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Programa de pontos
      </summary>
      <form action={handleSubmit} className="mt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={settings.isActive}
            className="h-4 w-4"
          />
          Programa ativo (acumula pontos ao quitar comandas)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Pontos por R$ 1,00
            </label>
            <input
              name="pointsPerReal"
              type="number"
              min={0}
              defaultValue={settings.pointsPerReal}
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Pontos por R$ 1,00 de crédito no resgate
            </label>
            <input
              name="redeemPointsPerReal"
              type="number"
              min={1}
              defaultValue={settings.redeemPointsPerReal}
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </div>
        <Feedback state={result} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar configurações"}
        </button>
      </form>
    </details>
  );
}

export function GiftCardForms({ clients }: { clients: ClientOption[] }) {
  const createRef = useRef<HTMLFormElement>(null);
  const redeemRef = useRef<HTMLFormElement>(null);
  const [createResult, setCreateResult] = useState<LoyaltyActionState>(
    initialLoyaltyActionState,
  );
  const [redeemResult, setRedeemResult] = useState<LoyaltyActionState>(
    initialLoyaltyActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const next = await createGiftCardAction(
        initialLoyaltyActionState,
        formData,
      );
      setCreateResult(next);
      if (next.status === "success") createRef.current?.reset();
    });
  }

  function handleRedeem(formData: FormData) {
    startTransition(async () => {
      const next = await redeemGiftCardAction(
        initialLoyaltyActionState,
        formData,
      );
      setRedeemResult(next);
      if (next.status === "success") redeemRef.current?.reset();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <details className="rounded-2xl border border-border bg-white/70 p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          Vender gift card
        </summary>
        <form ref={createRef} action={handleCreate} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="value" placeholder="Valor (R$)" className={inputClass} />
            <input
              name="expiresAt"
              type="date"
              aria-label="Validade"
              className={inputClass}
            />
          </div>
          <ClientSelect clients={clients} />
          <Feedback state={createResult} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            {pending ? "Criando..." : "Criar gift card"}
          </button>
        </form>
      </details>

      <details className="rounded-2xl border border-border bg-white/70 p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          Resgatar gift card
        </summary>
        <form ref={redeemRef} action={handleRedeem} className="mt-4 space-y-3">
          <input
            name="code"
            placeholder="Código (GC-XXXXX-XXXXX)"
            className={`${inputClass} uppercase`}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="amount" placeholder="Valor do resgate (R$)" className={inputClass} />
            <ClientSelect clients={clients} />
          </div>
          <Feedback state={redeemResult} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {pending ? "Resgatando..." : "Resgatar"}
          </button>
        </form>
      </details>
    </div>
  );
}

export function PointsRedeemForm({ clients }: { clients: ClientOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<LoyaltyActionState>(
    initialLoyaltyActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await redeemPointsAction(initialLoyaltyActionState, formData);
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="mt-4 flex flex-wrap items-end gap-3"
    >
      <div className="min-w-48 flex-1">
        <label className="text-xs font-medium text-foreground/60">Cliente</label>
        <select name="clientId" defaultValue="" className={`mt-1 ${inputClass}`}>
          <option value="" disabled>
            Selecione o cliente
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-foreground/60">Pontos</label>
        <input
          name="points"
          type="number"
          min={1}
          defaultValue={100}
          className={`mt-1 ${inputClass}`}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {pending ? "Resgatando..." : "Resgatar na carteira"}
      </button>
      <div className="w-full">
        <Feedback state={result} />
      </div>
    </form>
  );
}

const SEGMENTS = [
  { value: "todos", label: "Todos (com opt-in)" },
  { value: "novo", label: "Novos" },
  { value: "ativo", label: "Ativos" },
  { value: "em_risco", label: "Em risco" },
  { value: "inativo", label: "Inativos" },
  { value: "vip", label: "VIP" },
  { value: "aniversariantes", label: "Aniversariantes" },
];

export function CampaignForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<LoyaltyActionState>(
    initialLoyaltyActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await sendCampaignAction(initialLoyaltyActionState, formData);
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  return (
    <details className="rounded-2xl border border-border bg-white/70 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Nova campanha
      </summary>
      <form ref={formRef} action={handleSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="name" placeholder="Nome da campanha" className={inputClass} />
          <select name="segment" defaultValue="todos" className={inputClass}>
            {SEGMENTS.map((segment) => (
              <option key={segment.value} value={segment.value}>
                {segment.label}
              </option>
            ))}
          </select>
        </div>
        <input name="subject" placeholder="Assunto do e-mail" className={inputClass} />
        <textarea
          name="body"
          rows={4}
          placeholder="Mensagem (HTML simples)"
          className={inputClass}
        />
        <p className="text-xs text-foreground/60">
          Enviado para clientes com e-mail e que aceitam comunicações. As
          mensagens ficam na fila em Mensagens.
        </p>
        <Feedback state={result} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Enfileirando..." : "Criar campanha"}
        </button>
      </form>
    </details>
  );
}
