import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Brand, Button, Card, Field, Screen } from "@/components/ui";
import {
  apiBaseUrl,
  login,
  publicTenantSlug,
  requestClientOtp,
  verifyClientOtp,
} from "@/lib/api";
import {
  clearClientToken,
  clearToken,
  getClientToken,
  getToken,
  setClientToken,
  setToken,
} from "@/lib/session";
import { colors, spacing } from "@/theme";

export default function LoginScreen() {
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"staff" | "client">("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientEmail, setClientEmail] = useState("");
  const [clientSlug, setClientSlug] = useState(publicTenantSlug());
  const [clientCode, setClientCode] = useState("");
  const [clientStep, setClientStep] = useState<"email" | "code">("email");
  const [clientLoading, setClientLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([getToken(), getClientToken()])
      .then(([staffToken, clientToken]) => {
        if (!mounted) return;
        if (clientToken) router.replace("/client");
        else if (staffToken) router.replace("/agenda");
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  function changeMode(next: "staff" | "client") {
    setMode(next);
    setError(null);
  }

  async function handleRequestCode() {
    const normalizedEmail = clientEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Informe seu e-mail.");
      return;
    }
    setClientLoading(true);
    setError(null);
    try {
      const result = await requestClientOtp(normalizedEmail, clientSlug);
      setClientStep("code");
      setClientCode("");
      setDevCode(result.devCode ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível enviar o código.",
      );
    } finally {
      setClientLoading(false);
    }
  }

  async function handleClientLogin() {
    const normalizedEmail = clientEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Informe seu e-mail.");
      return;
    }
    if (!/^\d{6}$/.test(clientCode.trim())) {
      setError("Informe o código de 6 dígitos.");
      return;
    }
    setClientLoading(true);
    setError(null);
    try {
      const result = await verifyClientOtp(
        normalizedEmail,
        clientCode.trim(),
        clientSlug,
      );
      await setClientToken(result.token);
      await clearToken();
      router.replace("/client");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível entrar agora.",
      );
    } finally {
      setClientLoading(false);
    }
  }

  function resetClientEmail() {
    setClientStep("email");
    setClientCode("");
    setDevCode(null);
    setError(null);
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await login(email.trim().toLowerCase(), password);
      await setToken(result.token);
      await clearClientToken();
      router.replace("/agenda");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível entrar agora.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Brand />
            <Text style={styles.tagline}>Seu dia, em ordem.</Text>
            <Text style={styles.subtitle}>
              Agenda, clientes e caixa do seu negócio no celular.
            </Text>
          </View>

          <Card style={styles.card}>
            <View style={styles.segmented}>
              {(["staff", "client"] as const).map((value) => {
                const active = mode === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => changeMode(value)}
                    style={[styles.segment, active && styles.segmentActive]}
                  >
                    <Text
                      style={[
                        styles.segmentLabel,
                        active && styles.segmentLabelActive,
                      ]}
                    >
                      {value === "staff" ? "Equipe" : "Cliente"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.cardTitle}>
              {mode === "staff" ? "Entrar" : "Meus agendamentos"}
            </Text>
            <Text style={styles.cardSubtitle}>
              {mode === "staff"
                ? "Use a mesma conta do painel GlowHub."
                : "Entre com o e-mail usado no seu agendamento."}
            </Text>

            {mode === "staff" ? (
              <>
                <View style={styles.form}>
                  <Field
                    label="E-mail"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    placeholder="voce@empresa.com"
                    returnKeyType="next"
                  />
                  <Field
                    label="Senha"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    textContentType="password"
                    placeholder="Sua senha"
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                  />
                </View>

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Button
                  label="Entrar"
                  onPress={handleLogin}
                  loading={loading}
                />
              </>
            ) : (
              <>
                <View style={styles.form}>
                  <Field
                    label="E-mail"
                    value={clientEmail}
                    onChangeText={setClientEmail}
                    editable={clientStep === "email"}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    placeholder="voce@exemplo.com"
                    returnKeyType="next"
                  />
                  {clientStep === "email" ? (
                    <Field
                      label="Código do salão"
                      value={clientSlug}
                      onChangeText={setClientSlug}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="demo"
                      returnKeyType="go"
                      onSubmitEditing={handleRequestCode}
                    />
                  ) : (
                    <>
                      <Field
                        label="Código de 6 dígitos"
                        value={clientCode}
                        onChangeText={setClientCode}
                        keyboardType="number-pad"
                        maxLength={6}
                        placeholder="000000"
                        returnKeyType="go"
                        onSubmitEditing={handleClientLogin}
                      />
                      {devCode ? (
                        <Text style={styles.devHint}>
                          Código de teste: {devCode}
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {clientStep === "email" ? (
                  <Button
                    label="Receber código"
                    onPress={handleRequestCode}
                    loading={clientLoading}
                  />
                ) : (
                  <>
                    <Button
                      label="Entrar"
                      onPress={handleClientLogin}
                      loading={clientLoading}
                    />
                    <Button
                      label="Reenviar código"
                      onPress={handleRequestCode}
                      disabled={clientLoading}
                      variant="ghost"
                    />
                    <Button
                      label="Usar outro e-mail"
                      onPress={resetClientEmail}
                      disabled={clientLoading}
                      variant="ghost"
                    />
                  </>
                )}
              </>
            )}
          </Card>

          <Button
            label="Quero agendar sem conta"
            onPress={() => router.push("/book")}
            variant="ghost"
          />

          <Text style={styles.apiHint}>API: {apiBaseUrl()}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  hero: {
    gap: spacing.xs,
  },
  tagline: {
    marginTop: spacing.sm,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8,
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    maxWidth: 300,
  },
  card: {
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  cardSubtitle: {
    marginTop: -spacing.sm,
    fontSize: 13,
    color: colors.muted,
  },
  segmented: {
    flexDirection: "row",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "#F1EEF3",
    padding: 4,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: spacing.xs,
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
    color: colors.brand,
  },
  form: {
    gap: spacing.md,
  },
  devHint: {
    fontSize: 12,
    color: colors.muted,
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
  apiHint: {
    textAlign: "center",
    fontSize: 11,
    color: colors.muted,
  },
});
