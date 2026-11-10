import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Brand, Button, Card, Field, Screen } from "@/components/ui";
import { apiBaseUrl, login } from "@/lib/api";
import { getToken, setToken } from "@/lib/session";
import { colors, spacing } from "@/theme";

export default function LoginScreen() {
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getToken()
      .then((token) => {
        if (mounted && token) router.replace("/agenda");
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

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
            <Text style={styles.cardTitle}>Entrar</Text>
            <Text style={styles.cardSubtitle}>
              Use a mesma conta do painel GlowHub.
            </Text>

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
  form: {
    gap: spacing.md,
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
