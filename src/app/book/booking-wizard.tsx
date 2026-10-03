"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import {
  createPublicBookingAction,
  getPublicAvailabilityAction,
} from "./actions";
import type {
  BookingBranch,
  BookingProfessional,
  BookingService,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function BookingWizard({
  services,
  branches,
  professionals,
}: {
  services: BookingService[];
  branches: BookingBranch[];
  professionals: BookingProfessional[];
}) {
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingSlots, startSlots] = useTransition();
  const [saving, startSave] = useTransition();

  const serviceProfessionals = professionals.filter((pro) =>
    serviceId ? pro.serviceIds.includes(serviceId) : false,
  );
  const selectedProfessional = professionals.find((p) => p.id === professionalId);
  const availableBranches = branches.filter((branch) =>
    selectedProfessional
      ? selectedProfessional.branchIds.includes(branch.id)
      : true,
  );

  const canLoad = Boolean(serviceId && professionalId && branchId && date);

  function loadSlots() {
    setError(null);
    setSuccess(null);
    startSlots(async () => {
      const response = await getPublicAvailabilityAction({
        branchId,
        professionalId,
        serviceId,
        date,
      });
      if ("error" in response) {
        setError(response.error);
        setSlots([]);
        return;
      }
      setSlots(response.slots);
      setTime(null);
    });
  }

  function confirm() {
    if (!time) {
      setError("Escolha um horário.");
      return;
    }
    setError(null);
    setSuccess(null);
    startSave(async () => {
      const result = await createPublicBookingAction({
        branchId,
        professionalId,
        serviceId,
        date,
        time,
        name,
        phone,
        email,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(`Agendamento confirmado para ${result.label}.`);
      setSlots(null);
      setTime(null);
      setName("");
      setPhone("");
      setEmail("");
    });
  }

  return (
    <div className="mt-8 space-y-5 rounded-2xl border border-border bg-white/70 p-5">
      <div>
        <label className="text-xs font-medium text-foreground/60">Serviço</label>
        <select
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            setProfessionalId("");
            setBranchId("");
            setSlots(null);
            setTime(null);
          }}
          className={`mt-1 ${inputClass}`}
        >
          <option value="">Selecione o serviço</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} · {formatCentsBRL(service.priceCents)} ·{" "}
              {service.durationMinutes} min
            </option>
          ))}
        </select>
      </div>

      {serviceId && (
        <div>
          <label className="text-xs font-medium text-foreground/60">
            Profissional
          </label>
          <select
            value={professionalId}
            onChange={(e) => {
              setProfessionalId(e.target.value);
              setBranchId("");
              setSlots(null);
              setTime(null);
            }}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Selecione</option>
            {serviceProfessionals.map((pro) => (
              <option key={pro.id} value={pro.id}>
                {pro.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {professionalId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-foreground/60">Filial</label>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setSlots(null);
                setTime(null);
              }}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">Selecione</option>
              {availableBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSlots(null);
                setTime(null);
              }}
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </div>
      )}

      {canLoad && (
        <button
          type="button"
          onClick={loadSlots}
          disabled={loadingSlots}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {loadingSlots ? "Buscando..." : "Ver horários"}
        </button>
      )}

      {slots !== null && (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setTime(slot)}
              className={`rounded-full border px-3 py-1 text-sm ${
                time === slot
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-white hover:bg-muted"
              }`}
            >
              {slot}
            </button>
          ))}
          {slots.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum horário disponível nesse dia.
            </p>
          )}
        </div>
      )}

      {time && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className={inputClass}
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Telefone/WhatsApp"
              className={inputClass}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail (opcional)"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={confirm}
            disabled={saving}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            {saving ? "Confirmando..." : "Confirmar agendamento"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-700">{success}</p>}
    </div>
  );
}
