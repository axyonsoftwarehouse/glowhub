import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  Brand,
  Button,
  Card,
  Pill,
  Screen,
  SectionTitle,
} from "@/components/ui";
import {
  ApiClientError,
  clientAppointments,
  clientLogout,
  clientMe,
  clientSwitchTenant,
  type AppointmentStatus,
  type ClientAppointment,
  type ClientMeResponse,
  type ClientTenant,
} from "@/lib/api";
import { clearClientToken, getClientToken, setClientToken } from "@/lib/session";
import { colors, radius, spacing } from "@/theme";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Aguardando confirmação",
  confirmed: "Confirmado",
  check_in: "Em atendimento",
  checkout: "Em atendimento",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const STATUS_TONE: Record<
  AppointmentStatus,
  "brand" | "success" | "warning" | "danger" | "neutral"
> = {
  pending: "warning",
  confirmed: "brand",
  check_in: "brand",
  checkout: "brand",
  completed: "success",
  cancelled: "neutral",
  no_show: "danger",
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function ClientScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<ClientMeResponse | null>(null);
  const [items, setItems] = useState<ClientAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const refresh = useCallback(async (mode: "initial" | "pull" = "initial") => {
    const activeToken = await getClientToken();
    if (!activeToken) {
      router.replace("/");
      return;
    }
    setToken(activeToken);
    if (mode === "pull") setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [meData, agenda] = await Promise.all([
        clientMe(activeToken),
        clientAppointments(activeToken),
      ]);
      setProfile(meData);
      setItems(agenda.appointments);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        await clearClientToken();
        router.replace("/");
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar seus agendamentos.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh("initial");
    }, [refresh]),
  );

  async function handleSwitch(tenant: ClientTenant) {
    const activeToken = token ?? (await getClientToken());
    if (!activeToken || tenant.id === profile?.tenant.id) return;

    setSwitchingId(tenant.id);
    setError(null);
    try {
      const result = await clientSwitchTenant(activeToken, tenant.id);
      await setClientToken(result.token);
      setToken(result.token);
      await refresh("initial");
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        await clearClientToken();
        router.replace("/");
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível trocar de empresa.",
      );
    } finally {
      setSwitchingId(null);
    }
  }

  async function handleLogout() {
    const activeToken = token ?? (await getClientToken());
    if (activeToken) {
      await clientLogout(activeToken).catch(() => undefined);
    }
    await clearClientToken();
    router.replace("/");
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => refresh("pull")}
            tintColor={colors.brand}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Brand compact />
            <Button label="Sair" onPress={handleLogout} variant="ghost" />
          </View>
          <Text style={styles.tenant}>
            {profile?.tenant.name ?? "Carregando..."}
          </Text>
          {profile ? (
            <Text style={styles.greeting}>Olá, {profile.client.name}</Text>
          ) : null}
          {profile ? <Text style={styles.email}>{profile.client.email}</Text> : null}
        </View>

        {profile && profile.tenants.length > 1 ? (
          <>
            <SectionTitle>Minhas empresas</SectionTitle>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tenantRow}
            >
              {profile.tenants.map((tenant) => {
                const active = tenant.id === profile.tenant.id;
                const busy = switchingId === tenant.id;
                return (
                  <Pressable
                    key={tenant.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, busy }}
                    disabled={busy}
                    onPress={() => handleSwitch(tenant)}
                    style={[
                      styles.tenantChip,
                      active && styles.tenantChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tenantChipLabel,
                        active && styles.tenantChipLabelActive,
                      ]}
                    >
                      {busy ? "..." : tenant.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.brand} style={styles.loading} />
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!loading ? (
          <View style={styles.list}>
            <SectionTitle>
              {items.length === 1
                ? "1 agendamento"
                : `${items.length} agendamentos`}
            </SectionTitle>

            {items.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.empty}>
                  Você ainda não tem agendamentos por aqui.
                </Text>
                <Button
                  label="Agendar agora"
                  onPress={() => router.push("/book")}
                />
              </Card>
            ) : (
              items.map((item) => (
                <Card key={item.id} style={styles.item}>
                  <View style={styles.itemTop}>
                    <View style={styles.itemWhen}>
                      <Text style={styles.itemDay}>{dayLabel(item.startsAt)}</Text>
                      <Text style={styles.itemTime}>
                        {timeLabel(item.startsAt)}
                      </Text>
                    </View>
                    <Pill
                      label={STATUS_LABEL[item.status]}
                      tone={STATUS_TONE[item.status]}
                    />
                  </View>
                  <Text style={styles.itemService}>{item.service.name}</Text>
                  <Text style={styles.itemMeta}>
                    {item.professional.name} · {item.branch.name}
                  </Text>
                  <Text style={styles.itemPrice}>{money(item.priceCents)}</Text>
                </Card>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tenant: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: colors.text,
  },
  email: {
    fontSize: 13,
    color: colors.muted,
  },
  tenantRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  tenantChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tenantChipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  tenantChipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  tenantChipLabelActive: {
    color: colors.brand,
  },
  loading: {
    marginTop: spacing.xl,
  },
  errorBox: {
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    padding: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  list: {
    gap: spacing.md,
  },
  emptyCard: {
    gap: spacing.md,
  },
  empty: {
    fontSize: 14,
    color: colors.muted,
  },
  item: {
    gap: spacing.xs,
  },
  itemTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  itemWhen: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  itemDay: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    textTransform: "capitalize",
  },
  itemTime: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.brand,
  },
  itemService: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  itemMeta: {
    fontSize: 13,
    color: colors.muted,
  },
  itemPrice: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
});
