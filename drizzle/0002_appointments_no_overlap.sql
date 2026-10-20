-- Trava contra agendamento duplo: o mesmo profissional nao pode ter dois
-- atendimentos com horarios sobrepostos. Intervalo semiaberto [inicio, fim):
-- atendimentos encostados (um termina 10h, outro comeca 10h) sao permitidos.
-- Cancelados e no-show nao ocupam o horario.
-- A extensao fica aqui porque num banco vazio as migrations rodam antes do
-- db/rls.sql.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "professional_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" NOT IN ('cancelled', 'no_show'));
