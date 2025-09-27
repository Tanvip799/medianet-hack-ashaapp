import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View, Pressable, TextInput, TouchableOpacity, KeyboardAvoidingView, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

const getBaseUrl = () => {
  const env = (process.env || {}).EXPO_PUBLIC_API_URL;
  if (env) return env;
  if (Platform.OS === 'android') return 'http://172.16.146.125:3000';
  return 'http://172.16.146.125:3000';
};
const API_BASE = getBaseUrl();
const TRANSCRIPTION_API = API_BASE.replace(':3000', ':5000');

const formatDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function AppointmentNotesScreen() {
  const params = useLocalSearchParams();
  const id = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id), [params]);
  const apptId = useMemo(() => (Array.isArray(params.apptId) ? params.apptId[0] : params.apptId), [params]);

  const [loading, setLoading] = useState(true);
  const [appt, setAppt] = useState(null);
  const [patient, setPatient] = useState(null);
  // Edit note state
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!id || !apptId) return;
    try {
      setLoading(true);
      const [aRes, pRes] = await Promise.all([
        fetch(`${API_BASE}/api/appointments/${apptId}`),
        fetch(`${API_BASE}/api/patients/${id}`),
      ]);
      if (!aRes.ok) throw new Error('Failed to load appointment');
      if (!pRes.ok) throw new Error('Failed to load patient');
      setAppt(await aRes.json());
      setPatient(await pRes.json());
    } catch (e) {
      console.warn('Load notes screen failed', e?.message);
    } finally {
      setLoading(false);
    }
  }, [id, apptId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    setNoteText(typeof appt?.notes === 'string' ? appt.notes : '');
  }, [appt?.notes]);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Microphone permission is required.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      setIsRecording(true);
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Could not start recording.');
      setIsRecording(false);
    }
  };

  const stopAndTranscribe = async () => {
    if (!recording) return;
    setIsRecording(false);
    try { await recording.stopAndUnloadAsync(); } catch {}
    const uri = recording.getURI();
    setRecording(null);
    if (!uri) {
      Alert.alert('Error', 'No audio captured.');
      return;
    }
    try {
      setIsTranscribing(true);
      const formData = new FormData();
      formData.append('audio', { uri, name: 'note-voice.m4a', type: 'audio/m4a' });
      const res = await fetch(`${TRANSCRIPTION_API}/transcribe`, { method: 'POST', body: formData });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server error: ${res.status} ${errText}`);
      }
      const result = await res.json();
      const transcript = (result && (result.transcript || result.text)) || '';
      if (typeof transcript === 'string' && transcript.trim()) {
        setNoteText(prev => prev ? `${prev.trim()} ${transcript.trim()}` : transcript.trim());
      } else {
        Alert.alert('No transcript', 'No text returned from server.');
      }
    } catch (e) {
      console.error('Transcription failed', e);
      Alert.alert('Error', 'Failed to transcribe audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const saveNotes = async () => {
    if (!apptId) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/appointments/${apptId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: (noteText || '').toString() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setAppt(updated);
      setEditing(false);
    } catch (e) {
      console.error('Save notes failed', e?.message);
      Alert.alert('Error', 'Failed to save notes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}><ActivityIndicator size="large" color="#0a7ea4" /></View>
    );
  }

  if (!appt) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.headerContainer}>
          <ThemedText style={styles.headerTitle}>Appointment</ThemedText>
        </View>
        <View style={styles.centered}><ThemedText>Appointment not found.</ThemedText></View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={styles.headerIcon}><MaterialCommunityIcons name="doctor" size={26} color="#0a7ea4" /></View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.headerTitle}>{appt.name}</ThemedText>
          <ThemedText style={styles.headerMeta}>{formatDateTime(appt.date)} • {appt.status}</ThemedText>
          {patient && (
            <ThemedText style={styles.headerMeta}>Patient: {patient.name}</ThemedText>
          )}
          {appt.hospital ? (
            <ThemedText style={styles.headerMeta}>Hospital: {appt.hospital}</ThemedText>
          ) : null}
        </View>
        <Pressable onPress={() => setEditing(e => !e)} hitSlop={10} style={{ padding: 6 }}>
          <Ionicons name={editing ? 'close' : 'create-outline'} size={22} color="#0a7ea4" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {appt.desc ? (
          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>Description</ThemedText>
            <ThemedText style={styles.cardText}>{appt.desc}</ThemedText>
          </View>
        ) : null}

        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Notes</ThemedText>
          {editing ? (
            <>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.inputContainer}>
                  <Ionicons name="document-text-outline" size={20} color="#64748B" />
                  <TextInput
                    style={[styles.inputText, { minHeight: 120, textAlignVertical: 'top' }]}
                    placeholder="Type notes or use the mic"
                    placeholderTextColor="#94A3B8"
                    value={noteText}
                    onChangeText={setNoteText}
                    multiline
                    editable={!isTranscribing}
                  />
                </View>
              </KeyboardAvoidingView>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <TouchableOpacity onPress={startRecording} disabled={isRecording || isTranscribing} style={[styles.voiceActionBtn, isRecording && { opacity: 0.7 }]}>
                  <Ionicons name="mic" size={22} color="#fff" />
                  <ThemedText style={styles.voiceActionText}>Start</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={stopAndTranscribe} disabled={!isRecording || isTranscribing} style={[styles.voiceActionBtnSecondary, (!isRecording || isTranscribing) && { opacity: 0.6 }]}>
                  <Ionicons name="stop" size={20} color="#0a7ea4" />
                  <ThemedText style={styles.voiceActionTextSecondary}>{isTranscribing ? 'Transcribing…' : 'Stop'}</ThemedText>
                </TouchableOpacity>
              </View>
              <View style={styles.buttonRow}>
                <TouchableOpacity onPress={() => { setEditing(false); setNoteText(typeof appt?.notes === 'string' ? appt.notes : ''); }} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                  <ThemedText style={styles.modalBtnTextSecondary}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveNotes} disabled={saving} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                  <ThemedText style={styles.modalBtnTextPrimary}>{saving ? 'Saving…' : 'Save Notes'}</ThemedText>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            appt.notes && appt.notes.trim().length > 0 ? (
              <ThemedText style={styles.cardText}>{appt.notes}</ThemedText>
            ) : (
              <ThemedText style={[styles.cardText, { color: '#64748B' }]}>No notes added yet.</ThemedText>
            )
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contentContainer: { padding: 16, paddingBottom: 40 },
  headerContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0c4a6e' },
  headerMeta: { fontSize: 13, color: '#475569', marginTop: 2 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#F1F5F9', marginTop: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#0c4a6e', marginBottom: 8 },
  cardText: { fontSize: 15, color: '#1E293B', lineHeight: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  inputText: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15, color: '#1E293B' },
  voiceActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0a7ea4', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  voiceActionText: { color: '#FFFFFF', fontWeight: '600' },
  voiceActionBtnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  voiceActionTextSecondary: { color: '#0a7ea4', fontWeight: '600' },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  modalBtnPrimary: { backgroundColor: '#0a7ea4' },
  modalBtnSecondary: { backgroundColor: '#E2E8F0' },
  modalBtnTextPrimary: { color: '#FFFFFF', fontWeight: 'bold' },
  modalBtnTextSecondary: { color: '#334155', fontWeight: 'bold' },
});
