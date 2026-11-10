import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  Brand,
  Button,
  Card,
  Field,
  Pill,
  Screen,
  SectionTitle,
} from "@/components/ui";
import {
  createPublicBooking,
  publicAvailability,
  publicCatalog,
  publicTenantSlug,
  type PublicAvailabilityResponse,
  type PublicBranch,
  type PublicCatalogResponse,
  type PublicProfessional,
  type PublicService,
} from "@/lib/api";
import { colors, radius, spacing } from "@/theme";

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function friendlyDate(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export default function PublicBookingScreen() {
  const [catalog, setCatalog] = useState<PublicCatalogResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [service, setService] = useState<PublicService | null>(null);
  const [professional, setProfessional] = useState<PublicProfessional | null>(
    null,
  );
  const [branch, setBranch] = useState<PublicBranch | null>(null);
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [slot, setSlot] = useState<string | null>(null);
  const [availability, setAvailability] =
    useState<PublicAvailabilityResponse | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    publicCatalog()
      .then((data) => {
        if (!active) return;
        setCatalog(data);
        setDate(dateKey(new Date()));
      })
      .catch((cause) => {
        if (active) {
          setCatalogError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o catálogo.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (step !== 3 || !service || !professional || !branch || !date) return;
    let active = true;
    publicAvailability({
      branchId: branch.id,
      professionalId: professional.id,
      serviceId: service.id,
      date,
    })
      .then((data) => {
        if (!active) return;
        setAvailability(data);
        setSlotError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setAvailability(null);
        setSlotError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar os horários.",
        );
      });
    return () => {
      active = false;
    };
  }, [step, service, professional, branch, date]);

  const branchesForProfessional = professional
    ? (catalog?.branches ?? []).filter((item) =>
        professional.branchIds.includes(item.id),
      )
    : [];

  const professionalsForService = (catalog?.professionals ?? []).filter(
    (item) =>
      service && item.serviceIds.includes(service.id) && item.branchIds.length,
  );

  const dates = Array.from({ length: 14 }, (_, index) => {
    const value = new Date();
    value.setDate(value.getDate() + index);
    return { key: dateKey(value), label: friendlyDate(dateKey(value)) };
  });

  function close() {
    router.replace("/");
  }

  function back() {
    if (step === 1) {
      close();
      return;
    }
    setStep(step - 1);
    setBookingError(null);
  }

  function selectService(value: PublicService) {
    setService(value);
    setProfessional(null);
    setBranch(null);
    setSlot(null);
    setAvailability(null);
    setStep(2);
  }

  function selectProfessional(value: PublicProfessional) {
    const firstBranch = (catalog?.branches ?? []).find((item) =>
      value.branchIds.includes(item.id),
    );
    setProfessional(value);
    setBranch(firstBranch ?? null);
    setSlot(null);
    setAvailability(null);
    setSlotError(null);
    setStep(3);
  }

  function selectBranch(value: PublicBranch) {
    setBranch(value);
    setSlot(null);
    setAvailability(null);
    setSlotError(null);
  }

  function selectDate(value: string) {
    setDate(value);
    setSlot(null);
    setAvailability(null);
    setSlotError(null);
  }

  async function submit() {
    if (!service || !professional || !branch || !slot) return;
    if (name.trim().length < 2) {
      setBookingError("Informe seu nome.");
      return;
    }
    if (phone.trim().length < 8) {
      setBookingError("Informe um telefone válido.");
      return;
    }
    if (email.trim() && !email.includes("@")) {
      setBookingError("E-mail inválido.");
      return;
    }

    setSubmitting(true);
    setBookingError(null);
    try {
      const result = await createPublicBooking({
        branchId: branch.id,
        professionalId: professional.id,
        serviceId: service.id,
        date,
        time: slot,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setConfirmation(result.label);
    } catch (cause) {
      setBookingError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir o agendamento.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setConfirmation(null);
    setStep(1);
    setService(null);
    setProfessional(null);
    setBranch(null);
    setSlot(null);
    setAvailability(null);
    setSlotError(null);
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setBookingError(null);
  }

  if (confirmation) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.confirmationIcon}>
            <Text style={styles.confirmationCheck}>✓</Text>
          </View>
          <Text style={styles.confirmationTitle}>Agendamento reservado</Text>
          <Text style={styles.confirmationText}>
            {service?.name} com {professional?.name} em {confirmation}.
          </Text>
          <Text style={styles.confirmationMuted}>
            Você recebe a confirmação por e-mail quando o salão processar a
            caixa de saída.
          </Text>
          <Button label="Agendar outro" onPress={reset} />
          <Button label="Voltar ao início" onPress={close} variant="ghost" />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Brand compact />
            <Button label="Fechar" onPress={close} variant="ghost" />
          </View>
          <Text style={styles.title}>Agende seu horário</Text>
          <Text style={styles.subtitle}>
            {catalog?.tenant.name ?? `Tenant ${publicTenantSlug()}`}
          </Text>
          <View style={styles.progress}>
            {[1, 2, 3, 4].map((value) => (
              <View
                key={value}
                style={[
                  styles.progressBar,
                  value <= step && styles.progressBarActive,
                ]}
              />
            ))}
          </View>
          <Text style={styles.stepLabel}>Passo {step} de 4</Text>
        </View>

        {catalogError ? (
          <Card style={styles.errorBox}>
            <Text style={styles.errorText}>{catalogError}</Text>
            <Button
              label="Tentar novamente"
              onPress={() => router.replace("/book")}
              variant="ghost"
            />
          </Card>
        ) : !catalog ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <>
            {step === 1 && (
              <View style={styles.section}>
                <SectionTitle>Escolha o serviço</SectionTitle>
                {catalog.services.map((item) => {
                  const selected = service?.id === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      onPress={() => selectService(item)}
                      style={[
                        styles.option,
                        selected && styles.optionSelected,
                      ]}
                    >
                      <View style={styles.optionBody}>
                        <Text style={styles.optionTitle}>{item.name}</Text>
                        <Text style={styles.optionMeta}>
                          {item.durationMinutes} min ·{" "}
                          {money(item.priceCents)}
                        </Text>
                      </View>
                      <Text style={styles.optionArrow}>→</Text>
                    </Pressable>
                  );
                })}
                {catalog.services.length === 0 && (
                  <Text style={styles.emptyText}>
                    Nenhum serviço disponível no momento.
                  </Text>
                )}
              </View>
            )}

            {step === 2 && service && (
              <View style={styles.section}>
                <SectionTitle>Com quem você quer atendimento?</SectionTitle>
                {professionalsForService.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => selectProfessional(item)}
                    style={styles.option}
                  >
                    <View style={styles.optionBody}>
                      <Text style={styles.optionTitle}>{item.name}</Text>
                      <Text style={styles.optionMeta}>
                        {service.name} · {service.durationMinutes} min
                      </Text>
                    </View>
                    <Text style={styles.optionArrow}>→</Text>
                  </Pressable>
                ))}
                {professionalsForService.length === 0 && (
                  <Text style={styles.emptyText}>
                    Nenhum profissional disponível para este serviço.
                  </Text>
                )}
              </View>
            )}

            {step === 3 && service && professional && branch && (
              <View style={styles.section}>
                <SectionTitle>Escolha o dia e o horário</SectionTitle>

                {branchesForProfessional.length > 1 && (
                  <View style={styles.chips}>
                    {branchesForProfessional.map((item) => (
                      <Pressable
                        key={item.id}
                        accessibilityRole="button"
                        onPress={() => selectBranch(item)}
                        style={[
                          styles.chip,
                          branch.id === item.id && styles.chipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipLabel,
                            branch.id === item.id && styles.chipLabelSelected,
                          ]}
                        >
                          {item.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dates}
                >
                  {dates.map((item) => {
                    const selected = date === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        accessibilityRole="button"
                        onPress={() => selectDate(item.key)}
                        style={[
                          styles.dateChip,
                          selected && styles.dateChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dateLabel,
                            selected && styles.dateLabelSelected,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {!availability && !slotError ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator color={colors.brand} />
                  </View>
                ) : slotError ? (
                  <Card style={styles.errorBox}>
                    <Text style={styles.errorText}>{slotError}</Text>
                  </Card>
                ) : (
                  <View style={styles.slots}>
                    {availability?.slots.map((item) => {
                      const selected = slot === item;
                      return (
                        <Pressable
                          key={item}
                          accessibilityRole="button"
                          onPress={() => setSlot(item)}
                          style={[
                            styles.slot,
                            selected && styles.slotSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.slotLabel,
                              selected && styles.slotLabelSelected,
                            ]}
                          >
                            {item}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {availability?.slots.length === 0 && (
                      <Text style={styles.emptyText}>
                        Sem horários neste dia. Escolha outra data.
                      </Text>
                    )}
                  </View>
                )}

                <Button
                  label="Continuar"
                  onPress={() => setStep(4)}
                  disabled={!slot}
                />
              </View>
            )}

            {step === 4 && service && professional && branch && slot && (
              <View style={styles.section}>
                <SectionTitle>Seus dados</SectionTitle>
                <Card style={styles.summary}>
                  <Text style={styles.summaryTitle}>{service.name}</Text>
                  <Text style={styles.summaryText}>
                    {professional.name} · {branch.name}
                  </Text>
                  <Text style={styles.summaryStrong}>
                    {friendlyDate(date)} às {slot}
                  </Text>
                  <Pill label={money(availability?.priceCents ?? service.priceCents)} tone="brand" />
                </Card>

                <Field
                  label="Nome"
                  value={name}
                  onChangeText={setName}
                  placeholder="Seu nome"
                  autoCapitalize="words"
                />
                <Field
                  label="Telefone"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(11) 99999-9999"
                  keyboardType="phone-pad"
                />
                <Field
                  label="E-mail (opcional)"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="voce@exemplo.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Field
                  label="Observação (opcional)"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Alguma preferência?"
                />

                {bookingError ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{bookingError}</Text>
                  </View>
                ) : null}

                <Button
                  label="Confirmar agendamento"
                  onPress={submit}
                  loading={submitting}
                />
              </View>
            )}

            {step > 1 && (
              <Button label="Voltar" onPress={back} variant="ghost" />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.xs,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    marginTop: spacing.xs,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8,
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  progress: {
    flexDirection: "row",
    gap: 4,
    marginTop: spacing.md,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  progressBarActive: {
    backgroundColor: colors.brand,
  },
  stepLabel: {
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  section: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  optionSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  optionBody: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  optionMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  optionArrow: {
    fontSize: 18,
    color: colors.brand,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.text,
  },
  chipLabelSelected: {
    color: colors.brandForeground,
  },
  dates: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  dateChip: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 86,
  },
  dateChipSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.text,
    textTransform: "capitalize",
  },
  dateLabelSelected: {
    color: colors.brandForeground,
  },
  slots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  slot: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  slotSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  slotLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  slotLabelSelected: {
    color: colors.brandForeground,
  },
  loadingBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
  },
  errorBox: {
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  summary: {
    gap: spacing.xs,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  summaryText: {
    fontSize: 13,
    color: colors.muted,
  },
  summaryStrong: {
    marginTop: spacing.xs,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    textTransform: "capitalize",
  },
  confirmationIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: spacing.xl,
  },
  confirmationCheck: {
    fontSize: 38,
    color: colors.success,
  },
  confirmationTitle: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: colors.text,
    textAlign: "center",
  },
  confirmationText: {
    fontSize: 16,
    color: colors.text,
    textAlign: "center",
    lineHeight: 23,
  },
  confirmationMuted: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 19,
  },
});
