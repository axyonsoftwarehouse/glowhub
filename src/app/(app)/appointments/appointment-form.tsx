"use client";

import { useState, useTransition } from "react";
import {
  createAppointmentAction,
  getAvailabilityAction,
} from "./actions";
import {
  initialAppointmentActionState,
  type AppointmentActionState,
  type BranchOption,
  type ClientOption,
  type ProfessionalOption,
  type ServiceOption,
} from "./types";

const selectClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function AppointmentForm({
  branches,
  professionals,
  services,
  clients,
}: {
  branches: BranchOption[];
  professionals: ProfessionalOption[];
  services: ServiceOption[];
  clients: ClientOption[];
}) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<AppointmentActionState>(
    initialAppointmentActionState,
  );
  const [loadingSlots, startSlots] = useTransition();
  const [saving, startSave] = useTransition();

  const branchProfessionals = professionals.filter((professional) =>
    professional.branchIds.includes(branchId),
  );
  const selectedProfessional = professionals.find(
    (professional) => professional.id === professionalId,
  );
  const professionalServices = services.filter((service) =>
    selectedProfessional?.serviceIds.includes(service.id),
  );

  function handleBranchChange(value: string) {
    setBranchId(value);
    setProfessionalId("");
    setServiceId("");
    setSlots(null);
    setSelectedTime(null);
  }

  function handleProfessionalChange(value: string) {
    setProfessionalId(value);
    setServiceId("");
    setSlots(null);
    setSelectedTime(null);
  }

  function loadSlots() {
    setResult(initialAppointmentActionState);
    startSlots(async () => {
      const response = await getAvailabilityAction({
        branchId,
        professionalId,
        serviceId,
        date,
      });
      if ("error" in response) {
        setResult({ status: "error", message: response.error });
        setSlots([]);
        return;
      }
      setSlots(response.slots);
      setSelectedTime(null);
    });
  }

  function submit() {
    if (!selectedTime) {
      setResult({ status: "error", message: "Escolha um horário." });
      return;
    }

    const formData = new FormData();
    formData.set("branchId", branchId);
    formData.set("professionalId", professionalId);
    formData.set("serviceId", serviceId);
    formData.set("date", date);
    formData.set("time", selectedTime);
    formData.set("clientId", clientId);
    formData.set("newClientName", newClientName);
    formData.set("notes", notes);

    startSave(async () => {
      const next = await createAppointmentAction(
        initialAppointmentActionState,
        formData,
      );
      setResult(next);
      if (next.status === "success") {
        setSlots(null);
        setSelectedTime(null);
        setClientId("");
        setNewClientName("");
        setNotes("");
      }
    });
  }

  const canLoad = Boolean(branchId && professionalId && serviceId && date);

  return (
    <section className="rounded-2xl border border-border bg-white/70 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
        Novo agendamento
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-xs font-medium text-foreground/60">Filial</label>
          <select
            value={branchId}
            onChange={(event) => handleBranchChange(event.target.value)}
            className={`mt-1 ${selectClass}`}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60">
            Profissional
          </label>
          <select
            value={professionalId}
            onChange={(event) => handleProfessionalChange(event.target.value)}
            className={`mt-1 ${selectClass}`}
          >
            <option value="">Selecione</option>
            {branchProfessionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60">Serviço</label>
          <select
            value={serviceId}
            onChange={(event) => {
              setServiceId(event.target.value);
              setSlots(null);
              setSelectedTime(null);
            }}
            className={`mt-1 ${selectClass}`}
          >
            <option value="">Selecione</option>
            {professionalServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60">Data</label>
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setSlots(null);
              setSelectedTime(null);
            }}
            className={`mt-1 ${selectClass}`}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={loadSlots}
          disabled={!canLoad || loadingSlots}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {loadingSlots ? "Buscando..." : "Buscar horários"}
        </button>
        {selectedProfessional && professionalServices.length === 0 && (
          <p className="text-xs text-foreground/50">
            Este profissional não realiza serviços ainda.
          </p>
        )}
      </div>

      {slots !== null && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
            Horários disponíveis
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {slots.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setSelectedTime(slot)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  selectedTime === slot
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border bg-white hover:bg-muted"
                }`}
              >
                {slot}
              </button>
            ))}
            {slots.length === 0 && (
              <p className="text-sm text-foreground/60">
                Nenhum horário disponível.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-foreground/60">
            Cliente existente
          </label>
          <select
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              if (event.target.value) setNewClientName("");
            }}
            className={`mt-1 ${selectClass}`}
          >
            <option value="">—</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60">
            ou novo cliente
          </label>
          <input
            value={newClientName}
            onChange={(event) => {
              setNewClientName(event.target.value);
              if (event.target.value) setClientId("");
            }}
            placeholder="Nome do novo cliente"
            className={`mt-1 ${selectClass}`}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60">
            Observações
          </label>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={`mt-1 ${selectClass}`}
          />
        </div>
      </div>

      {result.status === "error" && result.message && (
        <p className="mt-3 text-sm text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="mt-3 text-sm text-emerald-700">{result.message}</p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={saving || !selectedTime}
        className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
      >
        {saving ? "Agendando..." : "Agendar"}
      </button>
    </section>
  );
}
