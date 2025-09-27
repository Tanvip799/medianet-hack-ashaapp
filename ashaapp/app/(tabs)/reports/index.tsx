import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as ExpoPrint from 'expo-print';
import * as ExpoFS from 'expo-file-system';
import * as ExpoFSLegacy from 'expo-file-system/legacy';

// API base (same approach as patient screen)
const getBaseUrl = () => {
  const env = (process.env || ({} as any)).EXPO_PUBLIC_API_URL as string | undefined;
  if (env) return env;
  if (Platform.OS === 'android') return 'http://172.16.146.125:3000';
  return 'http://172.16.146.125:3000';
};
const API_BASE = getBaseUrl();

type PatientLite = { _id: string; name: string; village?: string; contactNumber?: string };

const formatDateDisplay = (d?: Date) => (d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Pick date');
const formatTimeDisplay = (d?: Date) => (d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : 'Pick time');
const toHHmm = (d?: Date) => (d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');

export default function DashboardScreen() {
  const router = useRouter();
  // Shared patient picker state
  const [allPatients, setAllPatients] = useState<PatientLite[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [showMotherPicker, setShowMotherPicker] = useState(false);
  const [showDeceasedPicker, setShowDeceasedPicker] = useState(false);

  const filteredPatients = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return allPatients;
    return allPatients.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.village || '').toLowerCase().includes(q) ||
      (p.contactNumber || '').toString().includes(q)
    );
  }, [pickerQuery, allPatients]);

  const loadAllPatients = useCallback(async () => {
    try {
      setPatientsLoading(true);
      const res = await fetch(`${API_BASE}/api/patients`);
      const data = await res.json();
      setAllPatients(Array.isArray(data) ? data : []);
    } catch {
      setAllPatients([]);
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  // Birth modal state
  const [showBirthModal, setShowBirthModal] = useState(false);
  const [birthSubmitting, setBirthSubmitting] = useState(false);
  const [birthDate, setBirthDate] = useState<Date | undefined>(new Date());
  const [birthTime, setBirthTime] = useState<Date | undefined>();
  const [birthShowDatePicker, setBirthShowDatePicker] = useState(false);
  const [birthShowTimePicker, setBirthShowTimePicker] = useState(false);
  const [mother, setMother] = useState<PatientLite | null>(null);
  const [birthForm, setBirthForm] = useState({
    birth_outcome: '',
    infant_sex: 'unknown',
    infant_weight_kg: '',
    place_of_delivery: '',
  });

  // Death modal state
  const [showDeathModal, setShowDeathModal] = useState(false);
  const [deathSubmitting, setDeathSubmitting] = useState(false);
  const [deathDate, setDeathDate] = useState<Date | undefined>(new Date());
  const [deathTime, setDeathTime] = useState<Date | undefined>();
  const [deathShowDatePicker, setDeathShowDatePicker] = useState(false);
  const [deathShowTimePicker, setDeathShowTimePicker] = useState(false);
  const [deceased, setDeceased] = useState<PatientLite | null>(null);
  const [deathForm, setDeathForm] = useState({
    place_of_death: '',
    reported_cause_of_death: '',
    is_maternal_death: false,
    is_infant_death: false,
  });

  // Report preview state for births/deaths
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  // Saved reports list
  const [savedReports, setSavedReports] = useState<{ uri: string; name: string; size?: number; mtime?: number }[]>([]);

  const scanSavedReports = useCallback(async () => {
    try {
      const dir = `${ExpoFSLegacy.documentDirectory}reports/`;
      await ExpoFSLegacy.makeDirectoryAsync(dir, { intermediates: true });
      const files = await ExpoFSLegacy.readDirectoryAsync(dir);
      const detailed = await Promise.all(files.map(async (f) => {
        const info = await ExpoFSLegacy.getInfoAsync(dir + f);
        return { uri: info.uri, name: f, size: (info as any).size, mtime: (info as any).modificationTime };
      }));
      // newest first
      detailed.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
      setSavedReports(detailed);
    } catch {
      setSavedReports([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      scanSavedReports();
      return () => {};
    }, [scanSavedReports])
  );

  const openBirth = () => { setShowBirthModal(true); loadAllPatients(); };
  const openDeath = () => { setShowDeathModal(true); loadAllPatients(); };

  const submitBirth = async () => {
    if (!mother?._id || !birthDate) return;
    setBirthSubmitting(true);
    try {
      const payload: any = {
        mother_patient_id: mother!._id,
        birth_date: birthDate,
        birth_time: toHHmm(birthTime),
        birth_outcome: birthForm.birth_outcome.trim() || undefined,
        infant_sex: birthForm.infant_sex,
        infant_weight_kg: birthForm.infant_weight_kg ? Number(birthForm.infant_weight_kg) : undefined,
        place_of_delivery: birthForm.place_of_delivery.trim() || undefined,
      };
      const res = await fetch(`${API_BASE}/api/births`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      setShowBirthModal(false);
      // reset
      setBirthForm({ birth_outcome: '', infant_sex: 'unknown', infant_weight_kg: '', place_of_delivery: '' });
      setMother(null); setBirthDate(new Date()); setBirthTime(undefined);
    } catch (e) {
      console.warn('Create birth failed', (e as any)?.message);
    } finally {
      setBirthSubmitting(false);
    }
  };

  const submitDeath = async () => {
    if (!deceased?._id || !deathDate) return;
    setDeathSubmitting(true);
    try {
      const payload: any = {
        deceased_patient_id: deceased!._id,
        death_date: deathDate,
        death_time: toHHmm(deathTime),
        place_of_death: deathForm.place_of_death.trim() || undefined,
        reported_cause_of_death: deathForm.reported_cause_of_death.trim() || undefined,
        is_maternal_death: !!deathForm.is_maternal_death,
        is_infant_death: !!deathForm.is_infant_death,
      };
      const res = await fetch(`${API_BASE}/api/deaths`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      setShowDeathModal(false);
      // reset
      setDeathForm({ place_of_death: '', reported_cause_of_death: '', is_maternal_death: false, is_infant_death: false });
      setDeceased(null); setDeathDate(new Date()); setDeathTime(undefined);
    } catch (e) {
      console.warn('Create death failed', (e as any)?.message);
    } finally {
      setDeathSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.rowButtons}>
        <TouchableOpacity style={styles.actionBtn} onPress={openBirth}>
          <Ionicons name="add-circle" size={22} color="#0a7ea4" />
          <ThemedText style={styles.actionBtnText}>Record Birth</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={openDeath}>
          <Ionicons name="add-circle" size={22} color="#0a7ea4" />
          <ThemedText style={styles.actionBtnText}>Record Death</ThemedText>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.actionBtn, { alignSelf: 'flex-start', marginTop: 4 }]} onPress={() => router.push('/(tabs)/reports/reportdetails')}>
        <Ionicons name="list-outline" size={20} color="#0a7ea4" />
        <ThemedText style={styles.actionBtnText}>View Records</ThemedText>
      </TouchableOpacity>

      {/* Generate Birth/Death Reports */}
      <View style={[styles.rowButtons, { marginTop: 8 }] }>
        <TouchableOpacity style={styles.actionBtn} onPress={async () => {
          try {
            const res = await fetch(`${API_BASE}/api/births`);
            const births = await res.json();
            const html = buildBirthsReportHtml(births);
            setPreviewHtml(html);
            setPreviewVisible(true);
            // also persist an HTML copy now so it's visible in Saved Reports immediately
            const dir = `${ExpoFSLegacy.documentDirectory}reports/`;
            await ExpoFSLegacy.makeDirectoryAsync(dir, { intermediates: true });
            const dateStr = new Date().toISOString().slice(0,10);
            const name = `BirthsReport_${dateStr}.html`;
            try { await ExpoFSLegacy.deleteAsync(dir + name, { idempotent: true }); } catch {}
            await ExpoFSLegacy.writeAsStringAsync(dir + name, html, { encoding: 'utf8' });
            scanSavedReports();
          } catch (e) {
            console.warn('Births report failed', (e as any)?.message);
          }
        }}>
          <Ionicons name="download-outline" size={20} color="#0a7ea4" />
          <ThemedText style={styles.actionBtnText}>Generate Births Report</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={async () => {
          try {
            const res = await fetch(`${API_BASE}/api/deaths`);
            const deaths = await res.json();
            const html = buildDeathsReportHtml(deaths);
            setPreviewHtml(html);
            setPreviewVisible(true);
            const dir = `${ExpoFSLegacy.documentDirectory}reports/`;
            await ExpoFSLegacy.makeDirectoryAsync(dir, { intermediates: true });
            const dateStr = new Date().toISOString().slice(0,10);
            const name = `DeathsReport_${dateStr}.html`;
            try { await ExpoFSLegacy.deleteAsync(dir + name, { idempotent: true }); } catch {}
            await ExpoFSLegacy.writeAsStringAsync(dir + name, html, { encoding: 'utf8' });
            scanSavedReports();
          } catch (e) {
            console.warn('Deaths report failed', (e as any)?.message);
          }
        }}>
          <Ionicons name="download-outline" size={20} color="#0a7ea4" />
          <ThemedText style={styles.actionBtnText}>Generate Deaths Report</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Saved Reports List */}
      <View style={{ marginTop: 16 }}>
        <ThemedText style={{ fontWeight: '700', color: '#0c4a6e', marginBottom: 8 }}>Saved Reports</ThemedText>
        {savedReports.length === 0 ? (
          <ThemedText style={{ color: '#64748B' }}>No reports saved yet.</ThemedText>
        ) : (
          <ScrollView style={{ maxHeight: 240 }}>
            {savedReports.map((f) => (
              <View key={f.uri} style={styles.reportRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.reportName}>{f.name}</ThemedText>
                  {!!f.size && <ThemedText style={styles.reportMeta}>{(f.size/1024).toFixed(1)} KB</ThemedText>}
                </View>
                <TouchableOpacity style={styles.reportIconBtn} onPress={async () => {
                  try {
                    if (f.name.endsWith('.html')) {
                      const html = await ExpoFSLegacy.readAsStringAsync(f.uri);
                      setPreviewHtml(html);
                      setPreviewVisible(true);
                      return;
                    }
                    if (Platform.OS === 'android') {
                      const cUri = await ExpoFSLegacy.getContentUriAsync(f.uri);
                      const Intent = await import('expo-intent-launcher');
                      await (Intent as any).startActivityAsync('android.intent.action.VIEW', { data: cUri, flags: 1, type: 'application/pdf' });
                    } else {
                      Alert.alert('Open Report', 'This is a PDF. Use the preview Download flow to generate and view HTML inside the app.');
                    }
                  } catch {}
                }}>
                  <Ionicons name="open-outline" size={20} color="#0a7ea4" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.reportIconBtn} onPress={async () => {
                  try {
                    await ExpoFSLegacy.deleteAsync(f.uri, { idempotent: true });
                    scanSavedReports();
                  } catch {}
                }}>
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Birth Modal */}
      <Modal visible={showBirthModal} animationType="fade" transparent onRequestClose={() => setShowBirthModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowBirthModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={100} style={{ width: '100%', alignItems: 'center' }}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <ThemedText style={styles.modalTitle}>Record Birth</ThemedText>
              <ScrollView style={{ maxHeight: 520, width: '100%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 10 }}>
                <TouchableOpacity style={styles.inputContainer} onPress={() => { setPickerQuery(''); setShowMotherPicker(true); }}>
                  <Ionicons name="person-outline" size={18} color="#64748B" />
                  <ThemedText style={[styles.inputText, { flex: 1 }]}>{mother ? mother.name : 'Select Mother*'}</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity style={styles.inputContainer} onPress={() => setBirthShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={18} color="#64748B" />
                  <ThemedText style={[styles.inputText, { flex: 1 }]}>{formatDateDisplay(birthDate)}</ThemedText>
                </TouchableOpacity>
                {birthShowDatePicker && (
                  <DateTimePicker value={birthDate || new Date()} mode="date" display="default" onChange={(_e, d) => { setBirthShowDatePicker(Platform.OS === 'ios'); if (d) setBirthDate(d); }} />
                )}
                <TouchableOpacity style={styles.inputContainer} onPress={() => setBirthShowTimePicker(true)}>
                  <Ionicons name="time-outline" size={18} color="#64748B" />
                  <ThemedText style={[styles.inputText, { flex: 1 }]}>{formatTimeDisplay(birthTime)}</ThemedText>
                </TouchableOpacity>
                {birthShowTimePicker && (
                  <DateTimePicker value={birthTime || new Date()} mode="time" display="default" onChange={(_e, d) => { setBirthShowTimePicker(Platform.OS === 'ios'); if (d) setBirthTime(d); }} />
                )}

                <View style={styles.inputContainer}><Ionicons name="create-outline" size={18} color="#64748B" /><TextInput style={styles.inputText} placeholder="Birth Outcome" placeholderTextColor="#94A3B8" value={birthForm.birth_outcome} onChangeText={(v) => setBirthForm(f => ({ ...f, birth_outcome: v }))} /></View>
                <View style={styles.inputContainer}><Ionicons name="people-outline" size={18} color="#64748B" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {['male','female','other','unknown'].map(s => (
                      <TouchableOpacity key={s} onPress={() => setBirthForm(f => ({ ...f, infant_sex: s }))} style={[styles.pill, birthForm.infant_sex === s && styles.pillSelected]}>
                        <ThemedText style={[styles.pillText, birthForm.infant_sex === s && styles.pillTextSelected]}>{s}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={styles.inputContainer}><Ionicons name="fitness-outline" size={18} color="#64748B" /><TextInput style={styles.inputText} keyboardType="decimal-pad" placeholder="Infant Weight (kg)" placeholderTextColor="#94A3B8" value={birthForm.infant_weight_kg} onChangeText={(v) => setBirthForm(f => ({ ...f, infant_weight_kg: v }))} /></View>
                <View style={styles.inputContainer}><Ionicons name="business-outline" size={18} color="#64748B" /><TextInput style={styles.inputText} placeholder="Place of Delivery" placeholderTextColor="#94A3B8" value={birthForm.place_of_delivery} onChangeText={(v) => setBirthForm(f => ({ ...f, place_of_delivery: v }))} /></View>

                <View style={styles.modalButtonRow}>
                  <TouchableOpacity onPress={() => setShowBirthModal(false)} style={[styles.modalBtn, styles.modalBtnSecondary]}><ThemedText style={styles.modalBtnTextSecondary}>Cancel</ThemedText></TouchableOpacity>
                  <TouchableOpacity onPress={submitBirth} disabled={birthSubmitting} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                    <ThemedText style={styles.modalBtnTextPrimary}>{birthSubmitting ? 'Saving…' : 'Save'}</ThemedText>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Death Modal */}
      <Modal visible={showDeathModal} animationType="fade" transparent onRequestClose={() => setShowDeathModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDeathModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={100} style={{ width: '100%', alignItems: 'center' }}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <ThemedText style={styles.modalTitle}>Record Death</ThemedText>
              <ScrollView style={{ maxHeight: 520, width: '100%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 10 }}>
                <TouchableOpacity style={styles.inputContainer} onPress={() => { setPickerQuery(''); setShowDeceasedPicker(true); }}>
                  <Ionicons name="person-outline" size={18} color="#64748B" />
                  <ThemedText style={[styles.inputText, { flex: 1 }]}>{deceased ? deceased.name : 'Select Deceased*'}</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity style={styles.inputContainer} onPress={() => setDeathShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={18} color="#64748B" />
                  <ThemedText style={[styles.inputText, { flex: 1 }]}>{formatDateDisplay(deathDate)}</ThemedText>
                </TouchableOpacity>
                {deathShowDatePicker && (
                  <DateTimePicker value={deathDate || new Date()} mode="date" display="default" onChange={(_e, d) => { setDeathShowDatePicker(Platform.OS === 'ios'); if (d) setDeathDate(d); }} />
                )}
                <TouchableOpacity style={styles.inputContainer} onPress={() => setDeathShowTimePicker(true)}>
                  <Ionicons name="time-outline" size={18} color="#64748B" />
                  <ThemedText style={[styles.inputText, { flex: 1 }]}>{formatTimeDisplay(deathTime)}</ThemedText>
                </TouchableOpacity>
                {deathShowTimePicker && (
                  <DateTimePicker value={deathTime || new Date()} mode="time" display="default" onChange={(_e, d) => { setDeathShowTimePicker(Platform.OS === 'ios'); if (d) setDeathTime(d); }} />
                )}

                <View style={styles.inputContainer}><Ionicons name="business-outline" size={18} color="#64748B" /><TextInput style={styles.inputText} placeholder="Place of Death" placeholderTextColor="#94A3B8" value={deathForm.place_of_death} onChangeText={(v) => setDeathForm(f => ({ ...f, place_of_death: v }))} /></View>
                <View style={styles.inputContainer}><Ionicons name="document-text-outline" size={18} color="#64748B" /><TextInput style={[styles.inputText, { minHeight: 80, textAlignVertical: 'top' }]} multiline placeholder="Reported Cause of Death" placeholderTextColor="#94A3B8" value={deathForm.reported_cause_of_death} onChangeText={(v) => setDeathForm(f => ({ ...f, reported_cause_of_death: v }))} /></View>

                <View style={[styles.inputContainer, { justifyContent: 'space-between' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="woman-outline" size={18} color="#64748B" />
                    <ThemedText>Maternal Death</ThemedText>
                  </View>
                  <TouchableOpacity onPress={() => setDeathForm(f => ({ ...f, is_maternal_death: !f.is_maternal_death }))}>
                    <Ionicons name={deathForm.is_maternal_death ? 'checkbox' : 'square-outline'} size={22} color="#0a7ea4" />
                  </TouchableOpacity>
                </View>
                <View style={[styles.inputContainer, { justifyContent: 'space-between' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="body-outline" size={18} color="#64748B" />
                    <ThemedText>Infant Death</ThemedText>
                  </View>
                  <TouchableOpacity onPress={() => setDeathForm(f => ({ ...f, is_infant_death: !f.is_infant_death }))}>
                    <Ionicons name={deathForm.is_infant_death ? 'checkbox' : 'square-outline'} size={22} color="#0a7ea4" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalButtonRow}>
                  <TouchableOpacity onPress={() => setShowDeathModal(false)} style={[styles.modalBtn, styles.modalBtnSecondary]}><ThemedText style={styles.modalBtnTextSecondary}>Cancel</ThemedText></TouchableOpacity>
                  <TouchableOpacity onPress={submitDeath} disabled={deathSubmitting} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                    <ThemedText style={styles.modalBtnTextPrimary}>{deathSubmitting ? 'Saving…' : 'Save'}</ThemedText>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Shared Patient Picker Modal */}
      {(showMotherPicker || showDeceasedPicker) && (
        <Modal visible animationType="fade" transparent onRequestClose={() => { setShowMotherPicker(false); setShowDeceasedPicker(false); }}>
          <Pressable style={styles.modalOverlay} onPress={() => { setShowMotherPicker(false); setShowDeceasedPicker(false); }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80} style={{ width: '100%', alignItems: 'center' }}>
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                <ThemedText style={styles.modalTitle}>Select Patient</ThemedText>
                <View style={styles.inputContainer}>
                  <Ionicons name="search" size={18} color="#64748B" />
                  <TextInput style={styles.inputText} placeholder="Search by name, village or phone" placeholderTextColor="#94A3B8" value={pickerQuery} onChangeText={setPickerQuery} />
                </View>
                <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                  {patientsLoading ? (
                    <ActivityIndicator color="#0a7ea4" style={{ marginVertical: 12 }} />
                  ) : (
                    filteredPatients.map(p => (
                      <TouchableOpacity key={p._id} style={styles.patientRow} onPress={() => {
                        if (showMotherPicker) setMother(p);
                        if (showDeceasedPicker) setDeceased(p);
                        setShowMotherPicker(false); setShowDeceasedPicker(false);
                      }}>
                        <Ionicons name="person-circle-outline" size={22} color="#0a7ea4" />
                        <View style={{ marginLeft: 8 }}>
                          <ThemedText style={{ color: '#0f172a', fontWeight: '600' }}>{p.name}</ThemedText>
                          <ThemedText style={{ color: '#64748B', fontSize: 12 }}>{p.village} {p.contactNumber ? `• ${p.contactNumber}` : ''}</ThemedText>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                  {(!patientsLoading && filteredPatients.length === 0) && (
                    <ThemedText style={{ color: '#64748B', textAlign: 'center', marginTop: 12 }}>No patients found.</ThemedText>
                  )}
                </ScrollView>
                <View style={styles.modalButtonRow}>
                  <TouchableOpacity onPress={() => { setShowMotherPicker(false); setShowDeceasedPicker(false); }} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                    <ThemedText style={styles.modalBtnTextSecondary}>Close</ThemedText>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>
      )}

      {/* Preview Modal */}
      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <View style={{ height: 48, backgroundColor: '#0c4a6e', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
            <TouchableOpacity onPress={() => setPreviewVisible(false)} style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <ThemedText style={{ color: '#FFFFFF', fontWeight: '600' }}>Report Preview</ThemedText>
            <TouchableOpacity onPress={() => downloadGenericReportPdf(previewHtml)} style={{ padding: 6 }}>
              <Ionicons name="download-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <WebView originWhitelist={["*"]} source={{ html: previewHtml }} style={{ flex: 1 }} startInLoadingState />
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
    backgroundColor: '#FFFFFF',
  },
  rowButtons: { flexDirection: 'row', gap: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#BAE6FD' },
  actionBtnText: { color: '#0a7ea4', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '94%', backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1E293B', marginBottom: 16 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  inputText: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15, color: '#1E293B' },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E2E8F0', borderWidth: 1, borderColor: '#CBD5E1', marginRight: 8 },
  pillSelected: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  pillText: { color: '#334155', fontWeight: '600', textTransform: 'capitalize' },
  pillTextSelected: { color: '#FFFFFF' },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  modalBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  modalBtnPrimary: { backgroundColor: '#0a7ea4' },
  modalBtnSecondary: { backgroundColor: '#E2E8F0' },
  modalBtnTextPrimary: { color: '#FFFFFF', fontWeight: 'bold' },
  modalBtnTextSecondary: { color: '#334155', fontWeight: 'bold' },
  patientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  reportRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  reportName: { color: '#0f172a', fontWeight: '600' },
  reportMeta: { color: '#64748B', fontSize: 12 },
  reportIconBtn: { paddingHorizontal: 10, paddingVertical: 6 }
});

// Helpers: Build HTML (with larger fonts and viewport)
const baseHead = `
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; margin: 16px; font-size: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: 22px; font-weight: 700; }
    .meta { color: #475569; font-size: 13px; }
    .section { margin-top: 16px; }
    .section h2 { font-size: 18px; margin: 0 0 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e2e8f0; padding: 10px; font-size: 14px; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; }
  </style>
`;

function buildBirthsReportHtml(list: any[]) {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const rows = (Array.isArray(list) ? list : []).map((b: any) => `
    <tr>
      <td>${b.birth_date ? new Date(b.birth_date).toLocaleDateString('en-GB') : ''}</td>
      <td>${(b.mother_patient_id?.name || b.mother_name || '').toString().replace(/</g,'&lt;')}</td>
      <td>${(b.birth_outcome || '').toString().replace(/</g,'&lt;')}</td>
      <td>${(b.infant_sex || '').toString()}</td>
      <td>${(b.infant_weight_kg ?? '').toString()}</td>
      <td>${(b.place_of_delivery || '').toString().replace(/</g,'&lt;')}</td>
    </tr>
  `).join('');
  return `<!DOCTYPE html><html><head>${baseHead}<title>Births Report</title></head><body>
    <div class="header"><div class="title">Births Report</div><div class="meta">Generated on ${today}</div></div>
    <div class="section"><h2>Records</h2>
      <table><thead><tr>
        <th>Date</th><th>Mother</th><th>Outcome</th><th>Infant Sex</th><th>Weight (kg)</th><th>Place</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>
  </body></html>`;
}

function buildDeathsReportHtml(list: any[]) {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const rows = (Array.isArray(list) ? list : []).map((d: any) => `
    <tr>
      <td>${d.death_date ? new Date(d.death_date).toLocaleDateString('en-GB') : ''}</td>
      <td>${(d.deceased_patient_id?.name || d.deceased_name || '').toString().replace(/</g,'&lt;')}</td>
      <td>${(d.place_of_death || '').toString().replace(/</g,'&lt;')}</td>
      <td>${(d.reported_cause_of_death || '').toString().replace(/</g,'&lt;')}</td>
      <td>${d.is_maternal_death ? 'Yes' : 'No'}</td>
      <td>${d.is_infant_death ? 'Yes' : 'No'}</td>
    </tr>
  `).join('');
  return `<!DOCTYPE html><html><head>${baseHead}<title>Deaths Report</title></head><body>
    <div class="header"><div class="title">Deaths Report</div><div class="meta">Generated on ${today}</div></div>
    <div class="section"><h2>Records</h2>
      <table><thead><tr>
        <th>Date</th><th>Deceased</th><th>Place</th><th>Cause</th><th>Maternal</th><th>Infant</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>
  </body></html>`;
}

async function downloadGenericReportPdf(html: string) {
  try {
    const tmp = await ExpoPrint.printToFileAsync({ html, base64: true });
    if (!tmp?.uri) throw new Error('Failed to create PDF');
    const dateStr = new Date().toISOString().slice(0,10);
    const fileName = `Report_${dateStr}.pdf`;
    const SAF: any = (ExpoFS as any).StorageAccessFramework;
    if (Platform.OS === 'android' && SAF) {
      try {
        const perm = await SAF.requestDirectoryPermissionsAsync();
        if (perm.granted) {
          const fileUri = await SAF.createFileAsync(perm.directoryUri, fileName, 'application/pdf');
          await SAF.writeFileAsync(fileUri, tmp.base64 || '', { encoding: 'base64' });
          Alert.alert('Report saved', 'Saved to the selected folder.');
          return;
        }
      } catch {}
    }
    const dir = ExpoFSLegacy.documentDirectory + 'reports/';
    try { await ExpoFSLegacy.makeDirectoryAsync(dir, { intermediates: true }); } catch {}
    const dest = `${dir}${fileName}`;
    try { await ExpoFSLegacy.deleteAsync(dest, { idempotent: true }); } catch {}
    await ExpoFSLegacy.moveAsync({ from: tmp.uri, to: dest });
    Alert.alert('Report saved', `Saved to: ${dest}`);
  } catch (e) {
    console.warn('Report save failed', (e as any)?.message);
    Alert.alert('Error', 'Failed to save report.');
  }
}