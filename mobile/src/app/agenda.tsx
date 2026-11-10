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
  appointments,
  logout,
  me,
  type Appointment,
  type AppointmentStatus,
  type MeResponse,
} from "@/lib/api";
import { clearToken, getToken } from "@/lib/session";
import { colors, radius, spacing } from "@/theme";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  check_in: "Check-in",
  checkout: "Checkout",
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
    month: "2-digit",
  });
}

export default function AgendaScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [items, setItems] = useState<Appointment[]>([]);
  const [range, setRange] = useState<"today" | "week">("today");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (mode: "initial" | "pull" = "initial") => {
      const activeToken = await getToken();
      if (!activeToken) {
        router.replace("/");
        return;
      }
      setToken(activeToken);
      if (mode === "pull") setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const from = new Date();
        const to = new Date();
        to.setDate(to.getDate() + (range === "week" ? 7 : 1));

        const profileData = await me(activeToken);
        const agenda = await appointments(activeToken, {
          from: dateKey(from),
          to: dateKey(to),
          mine: Boolean(profileData.professional),
        });

        setProfile(profileData);
        setItems(agenda.appointments);
      } catch (cause) {
        if (cause instanceof ApiClientError && cause.status === 401) {
          await clearToken();
          router.replace("/");
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar a agenda.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range],
  );

  useFocusEffect(
    useCallback(() => {
      void refresh("initial");
    }, [refresh]),
  );

  async function handleLogout() {
    const activeToken = token ?? (await getToken());
    if (activeToken) {
      await logout(activeToken).catch(() => undefined);
    }
    await clearToken();
    router.replace("/");
  }

  const next = items.find(
    (item) => item.status !== "cancelled" && item.status !== "no_show",
  );

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
          <View style={styles.badges}>
            {profile?.tenant.isSolo ? (
              <Pill label="Modo solo" tone="brand" />
            ) : null}
            {profile ? (
              <Pill label={profile.role} tone="neutral" />
            ) : null}
            {profile?.professional ? (
              <Pill label={profile.professional.name} tone="neutral" />
            ) : null}
          </View>
        </View>

        <View style={styles.segmented}>
          {(["today", "week"] as const).map((value) => {
            const active = range === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setRange(value)}
                style={[
                  styles.segment,
                  active && styles.segmentActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    active && styles.segmentLabelActive,
                  ]}
                >
                  {value === "today" ? "Hoje" : "7 dias"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Card style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Atendimentos</Text>
            <Text style={styles.summaryValue}>{items.length}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Próximo</Text>
            <Text style={styles.summaryValue}>
              {next ? timeLabel(next.startsAt) : "—"}
            </Text>
          </View>
        </Card>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Button
              label="Tentar novamente"
              onPress={() => refresh("initial")}
              variant="ghost"
            />
          </View>
        ) : null}

        <View style={styles.list}>
          <SectionTitle>Agenda</SectionTitle>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : items.length === 0 ? (
            <Card style={styles.empty}>
              <Text style={styles.emptyTitle}>
                Nenhum atendimento neste período.
              </Text>
              <Text style={styles.emptyText}>
                Quando alguém agendar pelo painel ou pelo link público, aparece
                aqui.
              </Text>
            </Card>
          ) : (
            items.map((item) => (
              <Card key={item.id} style={styles.appointment}>
                <View style={styles.timeColumn}>
                  <Text style={styles.time}>{timeLabel(item.startsAt)}</Text>
                  <Text style={styles.day}>{dayLabel(item.startsAt)}</Text>
                </View>
                <View style={styles.appointmentBody}>
                  <View style={styles.appointmentTop}>
                    <Text style={styles.client}>{item.client.name}</Text>
                    <Pill
                      label={STATUS_LABEL[item.status]}
                      tone={STATUS_TONE[item.status]}
                    />
                  </View>
                  <Text style={styles.service}>{item.service.name}</Text>
                  <Text style={styles.meta}>
                    {item.professional.name} · {item.branch.name}
                  </Text>
                  <Text style={styles.price}>{money(item.priceCents)}</Text>
                </View>
              </Card>
            ))
          )}
        </View>
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
  tenant: {
    marginTop: spacing.xs,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.8,
    color: colors.text,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    borderRadius: radius.pill,
    paddingVertical: 9,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: colors.surfaceStrong,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  segmentLabelActive: {
    color: colors.text,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.border,
  },
  summaryLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  list: {
    gap: spacing.sm,
  },
  loadingBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  appointment: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  timeColumn: {
    width: 62,
    gap: 2,
  },
  time: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  day: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: colors.muted,
  },
  appointmentBody: {
    flex: 1,
    gap: 3,
  },
  appointmentTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  client: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  service: {
    fontSize: 14,
    color: colors.text,
  },
  meta: {
    fontSize: 12,
    color: colors.muted,
  },
  price: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
  },
  empty: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
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
});
