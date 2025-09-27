import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// --- API URL Configuration ---
const getBaseUrl = () => {
  const env = (process.env as any)?.EXPO_PUBLIC_API_URL as string | undefined;
  if (env) return env;
  if (Platform.OS === 'android') return 'http://172.16.146.125:3000';
  return 'http://172.16.146.125:3000';
};
const API_BASE = getBaseUrl();

// helpers
const formatDateForDisplay = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const getStatusTextStyle = (status?: string) => {
  switch (status) {
    case 'completed':
      return { color: '#16A34A' };
    case 'cancelled':
    case 'missed':
      return { color: '#B91C1C' };
    case 'scheduled':
    case 'pending':
    default:
      return { color: '#DC2626' };
  }
};

export default function AppointmentsScreen() {
  const [loading, setLoading] = useState(true);
  const [appts, setAppts] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [aRes, pRes] = await Promise.all([
        fetch(`${API_BASE}/api/appointments`),
        fetch(`${API_BASE}/api/patients`),
      ]);
      if (!aRes.ok) throw new Error('Failed to load appointments');
      if (!pRes.ok) throw new Error('Failed to load patients');
      const a = await aRes.json();
      const p = await pRes.json();
      setAppts(Array.isArray(a) ? a : []);
      setPatients(Array.isArray(p) ? p : []);
    } catch (e) {
      console.warn('Load data failed', (e as any)?.message);
      setAppts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const patientNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of patients) {
      if (p && p._id) m[p._id] = p.name || p._id;
    }
    return m;
  }, [patients]);

  const { upcoming, past } = useMemo(() => {
    const past = appts
      .filter(a => ['completed', 'cancelled', 'missed'].includes(a.status))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const upcoming = appts
      .filter(a => ['scheduled', 'pending'].includes(a.status))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return { upcoming, past };
  }, [appts]);

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
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Upcoming</ThemedText>
        </View>
        {upcoming.length === 0 ? (
          <View style={styles.centeredMessage}><ThemedText>No upcoming appointments.</ThemedText></View>
        ) : (
          upcoming.map(item => (
            <View key={item._id} style={styles.card}>
              <View style={styles.cardLeftPane}>
                <MaterialCommunityIcons name="doctor" size={28} color="#0a7ea4" />
              </View>
              <View style={styles.cardBody}>
                <ThemedText style={styles.cardTitle} numberOfLines={1}>{item.name}</ThemedText>
                <ThemedText style={styles.cardMeta} numberOfLines={1}>
                  <Ionicons name="person-circle-outline" size={14} color="#64748B" /> {patientNameById[item.patientId] || 'Unknown patient'}
                </ThemedText>
                {item.desc ? <ThemedText style={styles.cardDescription} numberOfLines={2}>{item.desc}</ThemedText> : null}
                <ThemedText style={[styles.cardStatus, getStatusTextStyle(item.status)]}>{item.status}</ThemedText>
              </View>
              <View style={styles.cardRightPane}>
                <View style={styles.rightPaneRow}>
                  <ThemedText style={styles.cardDate}>{formatDateForDisplay(item.date)}</ThemedText>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <ThemedText style={styles.sectionTitle}>Past</ThemedText>
        </View>
        {past.length === 0 ? (
          <View style={styles.centeredMessage}><ThemedText>No past appointments.</ThemedText></View>
        ) : (
          past.map(item => (
            <View key={item._id} style={styles.card}>
              <View style={styles.cardLeftPane}>
                <MaterialCommunityIcons name="doctor" size={28} color="#0a7ea4" />
              </View>
              <View style={styles.cardBody}>
                <ThemedText style={styles.cardTitle} numberOfLines={1}>{item.name}</ThemedText>
                <ThemedText style={styles.cardMeta} numberOfLines={1}>
                  <Ionicons name="person-circle-outline" size={14} color="#64748B" /> {patientNameById[item.patientId] || 'Unknown patient'}
                </ThemedText>
                {item.desc ? <ThemedText style={styles.cardDescription} numberOfLines={2}>{item.desc}</ThemedText> : null}
                <ThemedText style={[styles.cardStatus, getStatusTextStyle(item.status)]}>{item.status}</ThemedText>
              </View>
              <View style={styles.cardRightPane}>
                <View style={styles.rightPaneRow}>
                  <ThemedText style={styles.cardDate}>{formatDateForDisplay(item.date)}</ThemedText>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centeredMessage: { marginTop: 12, alignItems: 'center' },
  contentContainer: { paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 40 },
  sectionHeader: { marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#0c4a6e' },
  // Card styles (reused look-and-feel from patient details)
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, flexDirection: 'row', overflow: 'hidden' },
  cardLeftPane: { width: 50, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', padding: 8 },
  cardBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#1E293B', marginBottom: 2 },
  cardMeta: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  cardDescription: { fontSize: 13, color: '#64748B', marginBottom: 6 },
  cardStatus: { fontSize: 14, fontWeight: 'bold', textTransform: 'capitalize' },
  cardRightPane: { paddingVertical: 10, paddingRight: 12, paddingLeft: 4, justifyContent: 'flex-start', alignItems: 'flex-end' },
  rightPaneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardDate: { fontSize: 12, color: '#64748B' },
});