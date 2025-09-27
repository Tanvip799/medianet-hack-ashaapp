import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Audio } from 'expo-av';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type Role = 'user' | 'assistant';
type Intent = 'REGISTER_PATIENT' | 'SCHEDULE_APPOINTMENT' | 'REQUEST_INFO' | string;

type Message = {
  id: string;
  role: Role;
  text?: string;
  intent?: Intent;
  data?: any;
  actionable?: boolean;
  status?: 'idle' | 'working' | 'done' | 'error';
};

// --- API URL Configuration ---
const getBaseUrl = () => {
  const env = (process.env as any)?.EXPO_PUBLIC_API_URL as string | undefined;
  if (env) return env;
  // Use your actual local IP address
  if (Platform.OS === 'android') return 'http://172.16.146.121:3000';
  return 'http://172.16.146.121:3000';
};
const API_BASE = getBaseUrl();
const TRANSCRIPTION_API = API_BASE.replace(':3000', ':5000');

// Helpers
const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const toDateDisplay = (d?: Date) => (d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '');

const normGender = (g: string | undefined) => {
  const v = (g || '').toLowerCase();
  if (v.startsWith('f')) return 'female';
  if (v.startsWith('m')) return 'male';
  if (v) return 'other';
  return undefined;
};

export default function ChatbotScreen() {
  const [messages, setMessages] = useState<Message[]>([{
    id: makeId(),
    role: 'assistant',
    text: 'नमस्ते! मैं आवाज़ या टेक्स्ट से मरीज रजिस्टर और अपॉइंटमेंट शेड्यूल करने में मदद करूँगी। बोलें या टाइप करें।',
  }]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const [patients, setPatients] = useState<any[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientPickerVisible, setPatientPickerVisible] = useState(false);
  const [patientPickerForMsgId, setPatientPickerForMsgId] = useState<string | null>(null);

  // No longer need scrollToEnd with inverted list
  // const scrollToEnd = () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

  const loadPatients = useCallback(async () => {
    try {
      setPatientsLoading(true);
      const res = await fetch(`${API_BASE}/api/patients`);
      if (!res.ok) throw new Error('Failed to load patients');
      const data = await res.json();
      if (Array.isArray(data)) setPatients(data);
    } catch (e) {
      console.warn('Load patients failed', (e as any)?.message);
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  useEffect(() => { loadPatients(); }, [loadPatients]);

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
    try { await recording.stopAndUnloadAsync(); } catch { }
    const uri = recording.getURI();
    setRecording(null);
    if (!uri) return;
    try {
      setIsTranscribing(true);
      const formData = new FormData();
      formData.append('audio', { uri, name: 'chat-voice.m4a', type: 'audio/m4a' } as any);
      const res = await fetch(`${TRANSCRIPTION_API}/transcribe`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      const transcript = (result?.transcript || result?.text || '').toString();
      if (transcript.trim()) setInput(transcript);
    } catch (e) {
      console.error('Transcription failed', e);
      Alert.alert('Error', 'Failed to transcribe audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = { id: makeId(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    // No longer need scrollToEnd with inverted list

    try {
      setIsSending(true);
      const res = await fetch(`${API_BASE}/api/process-command`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const intent: Intent = json?.intent || 'REQUEST_INFO';
      const data = json?.data || {};

      if (intent === 'REQUEST_INFO') {
        const msg: Message = { id: makeId(), role: 'assistant', text: json?.response || 'Please clarify.' };
        setMessages(prev => [...prev, msg]);
      } else if (intent === 'REGISTER_PATIENT' || intent === 'SCHEDULE_APPOINTMENT') {
        const msg: Message = { id: makeId(), role: 'assistant', intent, data, actionable: true };
        setMessages(prev => [...prev, msg]);
      } else {
        const msg: Message = { id: makeId(), role: 'assistant', text: 'I categorized your request, but this intent is not supported yet.' };
        setMessages(prev => [...prev, msg]);
      }
    } catch (e) {
      console.error('process-command failed', e);
      Alert.alert('Error', 'Failed to process command');
    } finally {
      setIsSending(false);
      // No longer need scrollToEnd with inverted list
    }
  };

  const updateAssistantData = (msgId: string, patch: any) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, data: { ...(m.data || {}), ...(patch || {}) } } : m));
  };

  const confirmAction = async (msg: Message) => {
    if (!msg.intent) return;
    const data = msg.data || {};
    try {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'working' } : m));
      if (msg.intent === 'REGISTER_PATIENT') {
        const payload: any = {
          name: (data.name || '').toString().trim(),
          age: data.age ? Number(data.age) : undefined,
          dob: data.dob || data.birthDate || undefined,
          gender: normGender(data.gender) || undefined,
          village: data.village,
          contactNumber: data.contactNumber,
          diseases: Array.isArray(data.diseases) ? data.diseases : (typeof data.diseases === 'string' ? data.diseases.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined),
          notes: data.notes,
        };
        if (!payload.name || !payload.dob || !payload.gender || !payload.age) {
          Alert.alert('Missing info', 'Name, age, DOB and gender are required to register a patient.');
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'idle' } : m));
          return;
        }
        const res = await fetch(`${API_BASE}/api/patients`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(await res.text());
        const saved = await res.json();
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'done', actionable: false, text: `मरीज जोड़ा गया: ${saved.name}` } : m));

      } else if (msg.intent === 'SCHEDULE_APPOINTMENT') {
        const apptName = data.appointment_name || data.name || '';
        const payload: any = {
          name: (apptName || '').toString().trim(),
          date: data.date,
          desc: data.reason || data.desc,
          hospital: data.hospital,
          status: 'scheduled',
          patientId: data.patientId,
        };
        if (!payload.name || !payload.date) {
          Alert.alert('Missing info', 'Appointment name and date are required.');
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'idle' } : m));
          return;
        }
        if (!payload.patientId) {
          Alert.alert('Select patient', 'Please select a patient for this appointment.');
          setPatientPickerForMsgId(msg.id);
          setPatientPickerVisible(true);
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'idle' } : m));
          return;
        }
        const res = await fetch(`${API_BASE}/api/appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(await res.text());
        const saved = await res.json();
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'done', actionable: false, text: `अपॉइंटमेंट जोड़ा गया: ${saved.name} (${toDateDisplay(new Date(saved.date))})` } : m));
      }
    } catch (e) {
      console.error('Confirm action failed', e);
      Alert.alert('Error', 'Failed to complete action');
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'error' } : m));
    }
  };

  const renderAssistantCard = (msg: Message) => {
    if (!msg.intent || !msg.actionable) {
      return (
        <View style={[styles.bubble, styles.assistantBubble]}>
          <ThemedText style={styles.bubbleText}>{msg.text}</ThemedText>
        </View>
      );
    }

    if (msg.intent === 'REGISTER_PATIENT') {
      const d = msg.data || {};
      return (
        <View style={[styles.card]}>
          <ThemedText style={styles.cardTitle}>Review Patient</ThemedText>
          <View style={styles.fieldRow}><ThemedText style={styles.fieldLabel}>Name</ThemedText><TextInput style={styles.fieldInput} value={d.name || ''} onChangeText={v => updateAssistantData(msg.id, { name: v })} placeholder="Full name" /></View>
          <View style={styles.fieldRow}><ThemedText style={styles.fieldLabel}>Age</ThemedText><TextInput style={styles.fieldInput} value={d.age?.toString?.() || ''} onChangeText={v => updateAssistantData(msg.id, { age: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="Age" /></View>
          <TouchableOpacity style={styles.fieldRow} onPress={() => updateAssistantData(msg.id, { _showDobPicker: true })}>
            <ThemedText style={styles.fieldLabel}>DOB</ThemedText>
            <ThemedText style={styles.fieldInputText}>{d.dob || 'Select date'}</ThemedText>
          </TouchableOpacity>
          {d._showDobPicker && (
            <DateTimePicker value={d.dob ? new Date(d.dob) : new Date()} mode="date" display="default" onChange={(_e, date) => updateAssistantData(msg.id, { _showDobPicker: Platform.OS === 'ios', dob: date ? new Date(date).toISOString().slice(0, 10) : d.dob })} />
          )}
          <ThemedText style={styles.fieldLabel}>Gender</ThemedText>
          <View style={styles.pillRow}>
            {['female', 'male', 'other'].map(g => (
              <TouchableOpacity key={g} style={[styles.pill, (normGender(d.gender) === g) && styles.pillActive]} onPress={() => updateAssistantData(msg.id, { gender: g })}>
                <ThemedText style={[styles.pillText, (normGender(d.gender) === g) && styles.pillTextActive]}>{g}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.fieldRow}><ThemedText style={styles.fieldLabel}>Village</ThemedText><TextInput style={styles.fieldInput} value={d.village || ''} onChangeText={v => updateAssistantData(msg.id, { village: v })} placeholder="Village" /></View>
          <View style={styles.fieldRow}><ThemedText style={styles.fieldLabel}>Contact</ThemedText><TextInput style={styles.fieldInput} value={d.contactNumber || ''} onChangeText={v => updateAssistantData(msg.id, { contactNumber: v })} keyboardType="phone-pad" placeholder="Phone" /></View>
          <View style={[styles.fieldRow, { alignItems: 'flex-start' }]}>
            <ThemedText style={styles.fieldLabel}>Diseases</ThemedText>
            <TextInput style={[styles.fieldInput, { minHeight: 60, textAlignVertical: 'top' }]} value={Array.isArray(d.diseases) ? d.diseases.join(', ') : (d.diseases || '')} onChangeText={v => updateAssistantData(msg.id, { diseases: v })} placeholder="Comma-separated" multiline />
          </View>
          <View style={[styles.fieldRow, { alignItems: 'flex-start' }]}>
            <ThemedText style={styles.fieldLabel}>Notes</ThemedText>
            <TextInput style={[styles.fieldInput, { minHeight: 60, textAlignVertical: 'top' }]} value={d.notes || ''} onChangeText={v => updateAssistantData(msg.id, { notes: v })} placeholder="Additional notes" multiline />
          </View>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => confirmAction(msg)} disabled={msg.status === 'working'}>
              <ThemedText style={styles.btnPrimaryText}>{msg.status === 'working' ? 'Saving…' : 'Confirm & Save'}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (msg.intent === 'SCHEDULE_APPOINTMENT') {
      const d = msg.data || {};
      return (
        <View style={[styles.card]}>
          <ThemedText style={styles.cardTitle}>Review Appointment</ThemedText>
          <View style={styles.fieldRow}><ThemedText style={styles.fieldLabel}>Title</ThemedText><TextInput style={styles.fieldInput} value={d.appointment_name || d.name || ''} onChangeText={v => updateAssistantData(msg.id, { appointment_name: v, name: v })} placeholder="Appointment title" /></View>
          <TouchableOpacity style={styles.fieldRow} onPress={() => updateAssistantData(msg.id, { _showApptDate: true })}>
            <ThemedText style={styles.fieldLabel}>Date</ThemedText>
            <ThemedText style={styles.fieldInputText}>{d.date || 'Select date'}</ThemedText>
          </TouchableOpacity>
          {d._showApptDate && (
            <DateTimePicker value={d.date ? new Date(d.date) : new Date()} mode="date" display="default" onChange={(_e, date) => updateAssistantData(msg.id, { _showApptDate: Platform.OS === 'ios', date: date ? new Date(date).toISOString().slice(0, 10) : d.date })} />
          )}

          {/* --- CHANGE 4: Use the new column style for the "Reason" field --- */}
          <View style={styles.fieldColumn}>
            <ThemedText style={styles.fieldLabel}>Reason</ThemedText>
            <TextInput style={[styles.fieldInput, { minHeight: 60, textAlignVertical: 'top' }]} value={d.reason || d.desc || ''} onChangeText={v => updateAssistantData(msg.id, { reason: v })} placeholder="Reason / description" multiline />
          </View>

          <View style={styles.fieldRow}><ThemedText style={styles.fieldLabel}>Hospital</ThemedText><TextInput style={styles.fieldInput} value={d.hospital || ''} onChangeText={v => updateAssistantData(msg.id, { hospital: v })} placeholder="Hospital (optional)" /></View>

          <TouchableOpacity style={styles.fieldRow} onPress={() => { setPatientPickerForMsgId(msg.id); setPatientPickerVisible(true); }}>
            <ThemedText style={styles.fieldLabel}>Patient</ThemedText>
            <ThemedText style={styles.fieldInputText}>
              {(() => {
                if (!d.patientId) return 'Select patient';
                const p = patients.find(x => x._id === d.patientId);
                return p ? p.name : d.patientId;
              })()}
            </ThemedText>
          </TouchableOpacity>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => confirmAction(msg)} disabled={msg.status === 'working'}>
              <ThemedText style={styles.btnPrimaryText}>{msg.status === 'working' ? 'Saving…' : 'Confirm & Save'}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.bubble, styles.assistantBubble]}>
        <ThemedText style={styles.bubbleText}>{msg.text || 'Unsupported action.'}</ThemedText>
      </View>
    );
  };

  const renderItem = ({ item }: { item: Message }) => {
    // --- CHANGE 2b: Because the list is inverted, user messages are on the left and assistant on the right.
    // We adjust the `alignSelf` styles to match this. ---
    if (item.role === 'user') {
      return (
        <View style={[styles.bubble, styles.userBubble, { alignSelf: 'flex-start' }]}>
          <ThemedText style={[styles.bubbleText, { color: '#fff' }]}>{item.text}</ThemedText>
        </View>
      );
    }
    return (
      <View style={{ alignSelf: 'flex-end', width: '100%' }}>
        {renderAssistantCard(item)}
      </View>
    );
  };

  const onPickPatient = (patientId: string) => {
    if (!patientPickerForMsgId) return;
    updateAssistantData(patientPickerForMsgId, { patientId });
    setPatientPickerVisible(false);
    setPatientPickerForMsgId(null);
  };

  return (
    <ThemedView style={styles.container}>
      {/* --- CHANGE 1: KeyboardAvoidingView now wraps the ENTIRE screen --- */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0} // Adjust this offset based on your header height
      >
        <FlatList
          ref={listRef}
          // --- CHANGE 2: Use inverted prop and pass reversed data ---
          inverted
          data={[...messages].reverse()}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 10 }} // Adjusted padding
          renderItem={renderItem}
        />
        <View style={styles.inputBar}>
          <TouchableOpacity onPress={isRecording ? stopAndTranscribe : startRecording} style={[styles.micBtn, isRecording && { backgroundColor: '#ef4444' }]} disabled={isTranscribing}>
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={20} color="#fff" />
          </TouchableOpacity>
          <TextInput
            style={styles.textEntry}
            placeholder="Type a message or use the mic"
            placeholderTextColor="#94A3B8"
            value={isTranscribing ? 'Transcribing…' : input}
            onChangeText={setInput}
            editable={!isTranscribing}
            multiline
          />
          <TouchableOpacity onPress={handleSend} style={[styles.sendBtn]} disabled={isSending || isTranscribing || !input.trim()}>
            {isSending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={patientPickerVisible} transparent animationType="fade" onRequestClose={() => setPatientPickerVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPatientPickerVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ThemedText style={styles.modalTitle}>Select Patient</ThemedText>
            {patientsLoading ? (
              <ActivityIndicator color="#0a7ea4" />
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {patients.map(p => (
                  <TouchableOpacity key={p._id} style={styles.patientRow} onPress={() => onPickPatient(p._id)}>
                    <Ionicons name="person-circle-outline" size={22} color="#0a7ea4" />
                    <ThemedText style={styles.patientName}>{p.name}</ThemedText>
                    <ThemedText style={styles.patientMeta}>{p.village ? ` • ${p.village}` : ''}</ThemedText>
                  </TouchableOpacity>
                ))}
                {patients.length === 0 && (
                  <ThemedText style={{ color: '#64748B' }}>No patients found.</ThemedText>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 12, marginBottom: 10 },
  // --- CHANGE 2c: Styles are reversed for inverted list. User is now on the left. ---
  userBubble: { backgroundColor: '#0a7ea4' /* alignSelf will be handled in renderItem */ },
  assistantBubble: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' /* alignSelf will be handled in renderItem */ },
  bubbleText: { color: '#1E293B', fontSize: 15 },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  micBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0a7ea4', alignItems: 'center', justifyContent: 'center' },
  textEntry: { flex: 1, maxHeight: 120, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#1E293B', fontSize: 15 }, // Added font size
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0a7ea4', alignItems: 'center', justifyContent: 'center' },

  // --- CHANGE 3: Card is now full-width ---
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, marginBottom: 10, alignSelf: 'stretch' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#0c4a6e', marginBottom: 8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  
  // --- CHANGE 5: New style for vertical fields ---
  fieldColumn: { flexDirection: 'column', alignItems: 'flex-start', gap: 4, backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  fieldLabel: { width: 90, color: '#475569', fontSize: 14, fontWeight: '500' }, // Added fontWeight
  fieldInput: { flex: 1, color: '#1E293B', paddingVertical: 6, width: '100%' }, // Ensure input takes full width in column layout
  fieldInputText: { flex: 1, color: '#1E293B' },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F1F5F9', borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  pillActive: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  pillText: { color: '#475569', textTransform: 'capitalize' },
  pillTextActive: { color: '#FFFFFF' },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#0a7ea4' },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '88%', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0c4a6e', marginBottom: 10 },
  patientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  patientName: { color: '#1E293B', fontSize: 15 },
  patientMeta: { color: '#64748B', fontSize: 13 },
});