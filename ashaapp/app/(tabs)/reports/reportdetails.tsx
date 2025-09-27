import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, TouchableOpacity, View, Animated, Easing } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ionicons } from '@expo/vector-icons';

const getBaseUrl = () => {
	const env = (process.env || ({} as any)).EXPO_PUBLIC_API_URL as string | undefined;
	if (env) return env;
	if (Platform.OS === 'android') return 'http://172.16.146.125:3000';
	return 'http://172.16.146.125:3000';
};
const API_BASE = getBaseUrl();

type Birth = {
	_id: string;
	mother_patient_id: string;
	birth_date: string;
	birth_time?: string;
	birth_outcome?: string;
	infant_sex?: string;
	infant_weight_kg?: number;
	place_of_delivery?: string;
};

type Death = {
	_id: string;
	deceased_patient_id: string;
	death_date: string;
	death_time?: string;
	place_of_death?: string;
	reported_cause_of_death?: string;
	is_maternal_death?: boolean;
	is_infant_death?: boolean;
};

const formatDateForDisplay = (dateString?: string) => {
	if (!dateString) return '';
	const date = new Date(dateString);
	return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function ReportDetailsScreen() {
	const [active, setActive] = useState<'births' | 'deaths'>('births');
	const [loading, setLoading] = useState(false);
	const [births, setBirths] = useState<Birth[]>([]);
	const [deaths, setDeaths] = useState<Death[]>([]);
	const [indicatorX] = useState(new Animated.Value(0));

	const load = async () => {
		try {
			setLoading(true);
			const [bRes, dRes] = await Promise.all([
				fetch(`${API_BASE}/api/births`),
				fetch(`${API_BASE}/api/deaths`),
			]);
			const [b, d] = await Promise.all([bRes.json(), dRes.json()]);
			setBirths(Array.isArray(b) ? b : []);
			setDeaths(Array.isArray(d) ? d : []);
			} catch {
			setBirths([]); setDeaths([]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	const toggleTo = (tab: 'births' | 'deaths') => {
		setActive(tab);
		const toValue = tab === 'births' ? 0 : 110;
		Animated.timing(indicatorX, { toValue, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
	};

	return (
		<ThemedView style={styles.container}>
			{/* Toggle */}
			<View style={styles.toggleWrap}>
				<View style={styles.toggleRail}>
					<Animated.View style={[styles.toggleIndicator, { transform: [{ translateX: indicatorX }] }]} />
					<TouchableOpacity style={styles.toggleBtn} onPress={() => toggleTo('births')}>
						<ThemedText style={[styles.toggleText, active === 'births' && styles.toggleTextActive]}>Births</ThemedText>
					</TouchableOpacity>
					<TouchableOpacity style={styles.toggleBtn} onPress={() => toggleTo('deaths')}>
						<ThemedText style={[styles.toggleText, active === 'deaths' && styles.toggleTextActive]}>Deaths</ThemedText>
					</TouchableOpacity>
				</View>
			</View>

			{loading ? (
				<ActivityIndicator color="#0a7ea4" style={{ marginTop: 16 }} />
			) : (
				<ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
					{active === 'births' ? (
						births.length ? births.map(b => (
							<View key={b._id} style={styles.card}>
								<View style={styles.cardIcon}><Ionicons name="heart-outline" size={22} color="#0a7ea4" /></View>
								<View style={{ flex: 1 }}>
									<ThemedText style={styles.cardTitle}>Birth</ThemedText>
									<ThemedText style={styles.cardLine}>Date: {formatDateForDisplay(b.birth_date)}{b.birth_time ? ` • ${b.birth_time}` : ''}</ThemedText>
									{b.birth_outcome ? <ThemedText style={styles.cardLine}>Outcome: {b.birth_outcome}</ThemedText> : null}
									{b.infant_sex ? <ThemedText style={styles.cardLine}>Infant: {b.infant_sex}{b.infant_weight_kg != null ? ` • ${b.infant_weight_kg} kg` : ''}</ThemedText> : null}
									{b.place_of_delivery ? <ThemedText style={styles.cardLine}>Place: {b.place_of_delivery}</ThemedText> : null}
								</View>
							</View>
						)) : <ThemedText style={{ color: '#64748B', textAlign: 'center', marginTop: 16 }}>No birth records yet.</ThemedText>
					) : (
						deaths.length ? deaths.map(d => (
							<View key={d._id} style={styles.card}>
								<View style={styles.cardIcon}><Ionicons name="medkit-outline" size={22} color="#dc2626" /></View>
								<View style={{ flex: 1 }}>
									<ThemedText style={styles.cardTitle}>Death</ThemedText>
									<ThemedText style={styles.cardLine}>Date: {formatDateForDisplay(d.death_date)}{d.death_time ? ` • ${d.death_time}` : ''}</ThemedText>
									{d.place_of_death ? <ThemedText style={styles.cardLine}>Place: {d.place_of_death}</ThemedText> : null}
									{d.reported_cause_of_death ? <ThemedText style={styles.cardLine}>Cause: {d.reported_cause_of_death}</ThemedText> : null}
									{(d.is_maternal_death || d.is_infant_death) ? (
										<ThemedText style={[styles.cardLine, { color: '#b91c1c' }]}>Flags: {d.is_maternal_death ? 'Maternal' : ''}{(d.is_maternal_death && d.is_infant_death) ? ', ' : ''}{d.is_infant_death ? 'Infant' : ''}</ThemedText>
									) : null}
								</View>
							</View>
						)) : <ThemedText style={{ color: '#64748B', textAlign: 'center', marginTop: 16 }}>No death records yet.</ThemedText>
					)}
				</ScrollView>
			)}
		</ThemedView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, padding: 16, backgroundColor: '#FFFFFF' },
	toggleWrap: { marginTop: 8, marginBottom: 8 },
	toggleRail: { position: 'relative', flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 12, padding: 4, width: 220, alignSelf: 'center' },
	toggleIndicator: { position: 'absolute', width: 110, height: '100%', backgroundColor: '#FFFFFF', borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
	toggleBtn: { width: 110, alignItems: 'center', paddingVertical: 8 },
	toggleText: { color: '#334155', fontWeight: '600' },
	toggleTextActive: { color: '#0a7ea4' },

	card: { flexDirection: 'row', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
	cardIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDFA' },
	cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
	cardLine: { color: '#475569', fontSize: 13 },
});
