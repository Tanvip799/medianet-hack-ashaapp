// (tabs)/schemes.tsx
import React, { useEffect, useState } from "react";
import { ScrollView, View, ActivityIndicator, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// Import your local schemes JSON
import schemesData from "../../schemes.json";

interface Scheme {
  name: string;
  target_group: string;
  description: string;
  benefits: string;
  how_to_apply: string;
}


export default function SchemesScreen() {
  const [loading, setLoading] = useState(true);
  const [schemes, setSchemes] = useState<Scheme[]>([]);

  useEffect(() => {
    // Simulate loading delay
    setLoading(true);
    setTimeout(() => {
      setSchemes(schemesData); // directly load local JSON
      setLoading(false);
    }, 200); // tiny delay to show loader
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0a7ea4" />
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {schemes.map((scheme, idx) => (
          <View key={idx} style={styles.card}>
            <View style={styles.cardLeftPane}>
              <MaterialCommunityIcons name="hospital-box" size={28} color="#0a7ea4" />
            </View>
            <View style={styles.cardBody}>
              <ThemedText style={styles.cardTitle}>{scheme.name}</ThemedText>
              {/* <ThemedText style={styles.cardMeta}>{scheme.target_group}</ThemedText> */}
              <ThemedText style={styles.cardDescription}>{scheme.description}</ThemedText>
              <ThemedText style={styles.cardDescription}>
                <ThemedText style={{ fontWeight: "bold" }}>Benefits: </ThemedText>
                {scheme.benefits}
              </ThemedText>
              {/*<ThemedText style={styles.cardDescription}>
                <ThemedText style={{ fontWeight: "bold" }}>How to Apply: </ThemedText>
                {scheme.how_to_apply}
              </ThemedText>
              */}
            </View>
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  contentContainer: { paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 40 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#94A3B8",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: "row",
    overflow: "hidden",
  },
  cardLeftPane: { width: 50, backgroundColor: "#E0F2FE", alignItems: "center", justifyContent: "center", padding: 8 },
  cardBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, justifyContent: "center" },
  cardTitle: { fontSize: 17, fontWeight: "600", color: "#1E293B", marginBottom: 2 },
  cardMeta: { fontSize: 12, color: "#64748B", marginBottom: 4 },
  cardDescription: { fontSize: 13, color: "#64748B", marginBottom: 6 },
});
