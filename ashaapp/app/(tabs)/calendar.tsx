import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ionicons } from '@expo/vector-icons';

// --- API URL Configuration ---
const getBaseUrl = () => {
  const env = (process.env as any)?.EXPO_PUBLIC_API_URL as string | undefined;
  if (env) return env;
  if (Platform.OS === 'android') return 'http://192.168.29.172:3000';
  return 'http://192.168.29.172:3000';
};
const API_BASE = getBaseUrl();

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as first day
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d: Date, n: number) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}
function dateKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmt(d: Date) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function CalendarScreen() {
  const [loading, setLoading] = useState(false);
  const [appts, setAppts] = useState<any[]>([]);
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(new Date()));

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)), [weekAnchor]);

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const day of weekDays) {
      const key = dateKeyLocal(day);
      map[key] = [];
    }
    for (const a of appts) {
      if (!a.date) continue;
      const key = dateKeyLocal(new Date(a.date));
      if (map[key]) map[key].push(a);
    }
    // sort each day by time/name
    Object.keys(map).forEach(k => map[k].sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()));
    return map;
  }, [appts, weekDays]);

  const todayKey = useMemo(() => dateKeyLocal(new Date()), []);
  const todayList = useMemo(() => {
    const list = appts.filter(a => a.date && dateKeyLocal(new Date(a.date)) === todayKey);
    return list.sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
  }, [appts, todayKey]);

  const loadAllAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/appointments`);
      if (!res.ok) throw new Error('Failed to load appointments');
      const data = await res.json();
      setAppts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Failed to load appointments', (e as any)?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAllAppointments(); }, [loadAllAppointments]);

  const prevWeek = () => setWeekAnchor(d => addDays(d, -7));
  const nextWeek = () => setWeekAnchor(d => addDays(d, 7));
  const thisWeek = () => setWeekAnchor(startOfWeek(new Date()));

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={prevWeek} style={styles.navBtn}><Ionicons name="chevron-back" size={20} color="#0a7ea4" /></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>
          {fmt(weekDays[0])} - {fmt(weekDays[6])}
        </ThemedText>
        <TouchableOpacity onPress={nextWeek} style={styles.navBtn}><Ionicons name="chevron-forward" size={20} color="#0a7ea4" /></TouchableOpacity>
      </View>
      <View style={styles.subHeader}>
        <TouchableOpacity onPress={thisWeek}><ThemedText style={styles.link}>This Week</ThemedText></TouchableOpacity>
        <TouchableOpacity onPress={loadAllAppointments}><ThemedText style={styles.link}>Refresh</ThemedText></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color="#0a7ea4" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {/* Today section */}
          <View style={[styles.todaySection, { marginBottom: 12 }]}>
            <View style={styles.dayHeader}>
              <ThemedText style={styles.dayTitle}>Today</ThemedText>
              <ThemedText style={styles.dayDate}>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'long' })}</ThemedText>
            </View>
            {todayList.length === 0 ? (
              <ThemedText style={styles.empty}>No items</ThemedText>
            ) : (
              todayList.map(item => (
                <View key={`today_${item._id}`} style={styles.card}>
                  <View style={styles.cardLeft}><Ionicons name="medkit-outline" size={22} color="#0a7ea4" /></View>
                  <View style={styles.cardBody}>
                    <ThemedText style={styles.cardTitle} numberOfLines={1}>{item.name}</ThemedText>
                    {item.hospital ? <ThemedText style={styles.cardMeta} numberOfLines={1}>{item.hospital}</ThemedText> : null}
                    {item.desc ? <ThemedText style={styles.cardDesc} numberOfLines={2}>{item.desc}</ThemedText> : null}
                  </View>
                  <View style={styles.cardRight}>
                    <ThemedText style={styles.cardTime}>{new Date(item.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</ThemedText>
                    <ThemedText style={[styles.status, { color: item.status === 'completed' ? '#16A34A' : '#0a7ea4' }]}>{item.status}</ThemedText>
                  </View>
                </View>
              ))
            )}
          </View>
          {weekDays.map((day) => {
            const key = dateKeyLocal(day);
            const list = groups[key] || [];
            return (
              <View key={key} style={styles.daySection}>
                <View style={styles.dayHeader}>
                  <ThemedText style={styles.dayTitle}>{day.toLocaleDateString('en-GB', { weekday: 'short' })}</ThemedText>
                  <ThemedText style={styles.dayDate}>{day.toLocaleDateString('en-GB', { day: '2-digit', month: 'long' })}</ThemedText>
                </View>
                {list.length === 0 ? (
                  <ThemedText style={styles.empty}>No items</ThemedText>
                ) : (
                  list.map(item => (
                    <View key={item._id} style={styles.card}>
                      <View style={styles.cardLeft}><Ionicons name="medkit-outline" size={22} color="#0a7ea4" /></View>
                      <View style={styles.cardBody}>
                        <ThemedText style={styles.cardTitle} numberOfLines={1}>{item.name}</ThemedText>
                        {item.hospital ? <ThemedText style={styles.cardMeta} numberOfLines={1}>{item.hospital}</ThemedText> : null}
                        {item.desc ? <ThemedText style={styles.cardDesc} numberOfLines={2}>{item.desc}</ThemedText> : null}
                      </View>
                      <View style={styles.cardRight}>
                        <ThemedText style={styles.cardTime}>{new Date(item.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</ThemedText>
                        <ThemedText style={[styles.status, { color: item.status === 'completed' ? '#16A34A' : '#0a7ea4' }]}>{item.status}</ThemedText>
                      </View>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 10 },
  navBtn: { padding: 8, backgroundColor: '#E2E8F0', borderRadius: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0c4a6e' },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 6 },
  link: { color: '#0a7ea4', fontWeight: '600' },
  todaySection: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  daySection: { marginBottom: 16, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  dayTitle: { color: '#334155', fontWeight: '700' },
  dayDate: { color: '#64748B' },
  empty: { color: '#64748B', paddingHorizontal: 12, paddingVertical: 10 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cardLeft: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTitle: { color: '#0f172a', fontWeight: '700' },
  cardMeta: { color: '#0f172a' },
  cardDesc: { color: '#64748B', fontSize: 12 },
  cardRight: { alignItems: 'flex-end' },
  cardTime: { color: '#475569', fontSize: 12 },
  status: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
});
