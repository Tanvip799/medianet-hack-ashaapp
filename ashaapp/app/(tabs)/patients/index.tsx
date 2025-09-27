import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text, // Using basic Text for ThemedText placeholder
  TextInput,
  Linking,
  View, // Using basic View for ThemedView placeholder
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Audio } from 'expo-av';

// --- Placeholder Components ---
// These are likely custom components in your project (@/components/...).
// I've added simple placeholders here so the file is self-contained and runnable.
const ThemedView = (props: View['props']) => <View {...props} />;
const ThemedText = (props: Text['props'] & { type?: string }) => <Text {...props} />;
// --- End Placeholder Components ---


type Patient = {
  _id?: string;
  name: string;
  age: number | '';
  dob: string;
  gender: 'male' | 'female' | 'other' | '';
  village?: string;
  contactNumber?: string;
  notes?: string;
  diseases?: string[];
};

const getBaseUrl = () => {
  const env = (process.env as any).EXPO_PUBLIC_API_URL as string | undefined;
  if (env) return env;
  // Use a placeholder IP, as this will vary for each user's network.
  const API_HOST = '192.168.29.172'; // <-- IMPORTANT: Change this to your local network IP
  return `http://${API_HOST}:3000`;
};

const API_BASE = getBaseUrl();
// Assuming transcription server is on the same host but different port
const TRANSCRIPTION_API = API_BASE.replace(':3000', ':5000');


export default function PatientsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<Patient>({ name: '', age: '', dob: '', gender: '', village: '', contactNumber: '' });
  const [submitting, setSubmitting] = useState(false);

  // --- Voice Search State ---
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [hasTranscript, setHasTranscript] = useState(false);
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);
  // Intent can be used for branching UI in future; not displayed
  const [extractedIntent, setExtractedIntent] = useState('');
  const [extracted, setExtracted] = useState<Partial<Patient> & { diseases?: string[] }>({ name: '', age: '', dob: '', gender: '', village: '', contactNumber: '', notes: '', diseases: [] });
  // Keep last response as string for display; internal JSON not needed beyond action
  // --- End Voice Search State ---

  const loadPatients = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/patients`);
      const data = await res.json();
      setPatients(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error('Failed to load patients', e?.message);
      Alert.alert('Error', 'Unable to load patients from server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPatients();
    }, [loadPatients])
  );

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(p =>
      [p.name, p.village, p.gender, p.dob]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    );
  }, [patients, query]);

  // --- Voice Search Functions ---
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Sorry, we need microphone permissions for voice search!');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      setIsRecording(true);
      setTranscribedText('Listening...');
      setHasTranscript(false);
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Could not start recording.');
      setIsRecording(false);
    }
  };

  const handleStopAndTranscribe = async () => {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    if (!uri) {
        Alert.alert('Error', 'Could not get audio data to transcribe.');
        return;
    }
    try {
      setIsTranscribing(true);
      setTranscribedText('Sending for transcription...');
      const formData = new FormData();
      formData.append('audio', { uri, name: 'voice-search.m4a', type: 'audio/m4a' } as any);
      const res = await fetch(`${TRANSCRIPTION_API}/transcribe`, { method: 'POST', body: formData });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server error: ${res.status} ${errText}`);
      }
      const result = await res.json();
      const transcript: string | undefined = (result && (result.transcript || result.text)) as any;
      if (transcript && typeof transcript === 'string' && transcript.trim().length > 0) {
        setTranscribedText(transcript);
        setHasTranscript(true);
      } else {
        throw new Error('No transcript found in response.');
      }
    } catch (e: any) {
      console.error('Transcription failed', e);
      Alert.alert('Error', 'Failed to get transcription.');
      setTranscribedText('Error. Please try again.');
      setHasTranscript(false);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Removed old voice-to-search confirm; flow now uses command processing

  const onVoiceModalClose = () => {
    if (isRecording && recording) {
      recording.stopAndUnloadAsync();
    }
    setVoiceModalVisible(false);
    setIsRecording(false);
    setRecording(null);
    setTranscribedText('');
    setIsTranscribing(false);
    setHasTranscript(false);
    setIsSendingCommand(false);
    setExtractedIntent('');
  setExtracted({ name: '', age: '', dob: '', gender: '', village: '', contactNumber: '', notes: '', diseases: [] });
  };
  // --- End Voice Search Functions ---

  const onDobChange = (_event: any, selectedDate?: Date) => {
    // For Android, picker closes automatically; iOS needs explicit close if using modal mode (not here)
    setShowDobPicker(false);
    if (selectedDate) {
      // format YYYY-MM-DD
      const yyyy = selectedDate.getFullYear();
      const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const dd = String(selectedDate.getDate()).padStart(2, '0');
      const formatted = `${yyyy}-${mm}-${dd}`;
      setExtracted(prev => ({ ...prev, dob: formatted }));
    }
  };

  const handleSendCommand = async () => {
    if (!hasTranscript || !transcribedText.trim()) return;
    try {
      setIsSendingCommand(true);
      const res = await fetch(`${API_BASE}/api/process-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcribedText })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server error: ${res.status} ${errText}`);
      }
  const json = await res.json();
  await processCommandResult(json);
    } catch (e: any) {
      console.error('Send command failed', e);
      Alert.alert('Error', e?.message || 'Failed to process command');
    } finally {
      setIsSendingCommand(false);
    }
  };

  const normalizeGender = (g?: string): Patient['gender'] => {
    if (!g) return '';
    const s = g.toString().trim().toLowerCase();
    if (['m', 'male', 'man', 'boy'].includes(s)) return 'male';
    if (['f', 'female', 'woman', 'girl'].includes(s)) return 'female';
    if (['other', 'o', 'non-binary', 'nonbinary'].includes(s)) return 'other';
    return '';
  };

  // simple DOB format check used in modal validation
  const isValidDob = (dob?: string) => !!dob && /^\d{4}-\d{2}-\d{2}$/.test(dob);

  const mapPatientFromCommand = (src: any): Partial<Patient> & { diseases?: string[] } => {
    const json = src?.data ? src.data : src;
    const name = json?.name ?? json?.patient_name ?? '';
    const ageRaw = json?.age;
    const age = typeof ageRaw === 'number' ? ageRaw : (typeof ageRaw === 'string' ? Number(ageRaw.replace(/[^0-9]/g, '')) : undefined);
    const dob = json?.dob && typeof json.dob === 'string' ? json.dob : '';
    const gender = normalizeGender(json?.gender);
    const village = json?.village ?? '';
    const contactNumber = json?.contact_number ?? json?.contactNumber ?? '';
    // diseases may come as array or string; normalize to array
    let diseasesArr: string[] | undefined = undefined;
    const rawDiseases = json?.diseases;
    if (Array.isArray(rawDiseases)) {
      diseasesArr = rawDiseases.filter(Boolean).map(String);
    } else if (typeof rawDiseases === 'string') {
      diseasesArr = rawDiseases
        .split(/[,|/;\n\r\t]|\band\b|\bऔर\b|\bwa\b/iu)
        .map(s => s.trim())
        .filter(Boolean);
    }
    // notes: use only explicit notes (string or array); do NOT copy diseases into notes
    const notesArr = Array.isArray(json?.notes) ? json.notes : undefined;
    const notesRaw = typeof json?.notes === 'string' ? json.notes : undefined;
    const notes = notesRaw || notesArr?.filter(Boolean).join(', ') || '';
    return { name, age: (age as any) ?? '', dob, gender, village, contactNumber, notes, diseases: diseasesArr };
  };

  const processCommandResult = async (json: any) => {
    try {
      // Determine intent (case-insensitive); attempt light inference if missing
      const data = json?.data ?? json;
      let intent = (json?.intent || '').toString().trim().toUpperCase();
      if (!intent) {
        if (data?.name || data?.gender || data?.dob || data?.age) intent = 'REGISTER_PATIENT';
      }
      setExtractedIntent(intent);
      if (intent === 'REGISTER_PATIENT') {
        const mapped = mapPatientFromCommand(json);
        setExtracted(mapped);
      }
    } catch (err) {
      console.error('processCommandResult error:', err);
    }
  };

  const validateAndRegisterFromExtracted = async () => {
    const name = (extracted.name || '').toString().trim();
    const ageNum = typeof extracted.age === 'number' ? extracted.age : Number(extracted.age || 0);
    const dob = (extracted.dob || '').toString().trim();
    const gender = (extracted.gender as Patient['gender']) || '';

    if (!name || !ageNum || !dob || !gender) {
      Alert.alert('Missing fields', 'Name, Age, DOB, and Gender are required.');
      return;
    }
    if (isNaN(ageNum) || ageNum <= 0) {
      Alert.alert('Invalid age', 'Age must be a positive number.');
      return;
    }
    if (!isValidDob(dob)) {
      Alert.alert('Invalid DOB', 'DOB must be in YYYY-MM-DD format.');
      return;
    }

    await createPatientFromCommand({
      name,
      age: ageNum,
      dob,
      gender,
      village: (extracted.village || '').toString(),
      contactNumber: (extracted.contactNumber || '').toString(),
      notes: (extracted.notes || '').toString(),
      // Pass diseases array if present
      ...(Array.isArray(extracted.diseases) && extracted.diseases.length ? { diseases: extracted.diseases } : {}),
    });
  };

  const createPatientFromCommand = async (data: Partial<Patient>) => {
    try {
      const payload = {
        name: String(data.name).trim(),
        age: Number(data.age),
        dob: String(data.dob).trim(),
        gender: data.gender,
        village: (data.village || '').toString().trim() || undefined,
        contactNumber: (data.contactNumber || '').toString().trim() || undefined,
        notes: (data.notes || '').toString().trim() || undefined,
        ...(Array.isArray(data.diseases) && data.diseases.length ? { diseases: data.diseases } : {}),
      } as any;
      const res = await fetch(`${API_BASE}/api/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create patient');
      }
      await loadPatients();
      Alert.alert('Success', 'Patient registered successfully.');
      // Optionally, close the voice modal
      onVoiceModalClose();
    } catch (e: any) {
      console.error('createPatientFromCommand failed', e);
      Alert.alert('Error', e?.message || 'Failed to create patient');
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', age: '', dob: '', gender: '', village: '', contactNumber: '' });
    setModalVisible(true);
  };

  const openEdit = (p: Patient) => {
    setEditing(p);
    setForm({
      _id: p._id,
      name: p.name ?? '',
      age: p.age ?? '',
      dob: p.dob ?? '',
      gender: p.gender ?? '',
      village: p.village ?? '',
      contactNumber: p.contactNumber ?? '',
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (!submitting) setModalVisible(false);
  };

  const onChange = (key: keyof Patient, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const validateForm = () => {
    const ageNum = Number(form.age);
    if (!form.name?.trim() || !form.age || !form.dob?.trim() || !form.gender) {
      Alert.alert('Missing fields', 'Name, Age, DOB, and Gender are required.');
      return false;
    }
    if (isNaN(ageNum) || ageNum <= 0) {
      Alert.alert('Invalid age', 'Age must be a positive number.');
      return false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dob)) {
      Alert.alert('Invalid DOB', 'DOB must be in YYYY-MM-DD format.');
      return false;
    }
    return true;
  };

  const submitForm = async () => {
    if (!validateForm()) return;
    try {
      setSubmitting(true);
      const method = editing?._id ? 'PUT' : 'POST';
      const url = editing?._id ? `${API_BASE}/api/patients/${editing._id}` : `${API_BASE}/api/patients`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          age: Number(form.age),
          dob: form.dob.trim(),
          gender: form.gender,
          village: form.village?.trim(),
          contactNumber: form.contactNumber?.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Request failed');
      }
      closeModal();
      await loadPatients();
    } catch (e: any) {
      console.error('Save failed', e?.message);
      Alert.alert('Error', e?.message || 'Failed to save patient');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (p: Patient) => {
    Alert.alert('Delete patient', `Are you sure you want to delete ${p.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePatient(p) },
    ]);
  };

  const deletePatient = async (p: Patient) => {
    if (!p._id) return;
    try {
      const res = await fetch(`${API_BASE}/api/patients/${p._id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      await loadPatients();
    } catch (e: any) {
      console.error('Delete failed', e?.message);
      Alert.alert('Error', e?.message || 'Failed to delete');
    }
  };

  const dial = async (num?: string) => {
    if (!num) return;
    const url = `tel:${num.replace(/[^0-9+]/g, '')}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot make call', 'Calling is not supported on this device.');
      }
    } catch (err) {
      console.warn('Call failed', err);
    }
  };

  const renderItem = ({ item }: { item: Patient }) => {
    return (
        <View style={styles.card}>
          <Pressable style={{ flex: 1, flexDirection: 'row' }} onPress={() => item._id && router.push({ pathname: '/(tabs)/patients/[id]', params: { id: item._id } })}>
            <View style={styles.avatar}><Ionicons name="person-circle-outline" size={22} color="#687076" /></View>
            <View style={styles.contentContainer}>
              <ThemedText type="subtitle" style={styles.cardTitle}>{item.name}</ThemedText>
              <View style={styles.metaRow}>
                <View style={styles.metaLeft}>
                  {item.gender && <View style={styles.metaItemRow}><Ionicons name="person-outline" size={12} color="#687076" /><ThemedText style={styles.metaText}>{item.gender}</ThemedText></View>}
                  {typeof item.age === 'number' && <View style={styles.metaItemRow}><Ionicons name="calendar-outline" size={12} color="#687076" /><ThemedText style={styles.metaText}>{item.age} yrs</ThemedText></View>}
                </View>
              </View>
            </View>
          </Pressable>
          <View style={styles.actionsContainer}>
            {item.contactNumber && <Pressable onPress={() => dial(item.contactNumber)} style={[styles.actionButton, styles.callButton]} hitSlop={8}><Ionicons name="call-outline" size={16} color="#16a34a" /></Pressable>}
            <View style={styles.verticalButtons}>
              <Pressable onPress={() => openEdit(item)} style={styles.actionButton} hitSlop={8}><Ionicons name="create-outline" size={16} color="#687076" /></Pressable>
              <Pressable onPress={() => confirmDelete(item)} style={[styles.actionButton, styles.deleteButton]} hitSlop={8}><Ionicons name="trash-outline" size={16} color="#dc2626" /></Pressable>
            </View>
          </View>
        </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <ThemedView style={styles.container}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#687076" style={{ marginHorizontal: 8 }} />
          <TextInput placeholder="Search patients" value={query} onChangeText={setQuery} style={styles.searchInput} />
          {query.length > 0 && <Pressable onPress={() => setQuery('')} hitSlop={10}><Ionicons name="close-circle" size={18} color="#9BA1A6" style={{ marginHorizontal: 8 }} /></Pressable>}
          <Pressable onPress={() => setVoiceModalVisible(true)} style={{ paddingRight: 8, paddingLeft: 4 }}><Ionicons name="mic" size={20} color="#687076" /></Pressable>
        </View>

        {loading ? <View style={styles.centered}><ActivityIndicator color="#0a7ea4" /></View> : 
          <FlatList data={filtered} keyExtractor={item => item._id || item.name} renderItem={renderItem} contentContainerStyle={{ paddingBottom: 120 }}
            ListEmptyComponent={<View style={styles.empty}><Ionicons name="people-outline" size={48} color="#9BA1A6" /><ThemedText style={{ color: '#687076', marginTop: 8 }}>No patients found</ThemedText></View>}
          />
        }

        <Pressable style={styles.fab} onPress={openCreate} accessibilityLabel="Add patient"><Ionicons name="add" size={28} color="#FFFFFF" /></Pressable>

        {/* --- Create/Edit Modal with FULL FORM --- */}
        <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={closeModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.modalBackdrop} onPress={closeModal}>
             <Pressable style={styles.modalCard} onPress={() => {}}>
                <View style={styles.modalHeader}>
                    <ThemedText type="title">{editing ? 'Edit Patient' : 'Add New Patient'}</ThemedText>
                    <Pressable onPress={closeModal} hitSlop={8}><Ionicons name="close" size={24} color="#11181C" /></Pressable>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
                  <View style={styles.formRow}><ThemedText style={styles.label}>Name*</ThemedText><TextInput style={styles.input} value={form.name} onChangeText={v => onChange('name', v)} placeholder="Full Name" /></View>
                  <View style={styles.formRow}><ThemedText style={styles.label}>Age*</ThemedText><TextInput style={styles.input} value={String(form.age)} onChangeText={v => onChange('age', v)} keyboardType="number-pad" placeholder="e.g., 45" /></View>
                  <View style={styles.formRow}><ThemedText style={styles.label}>Date of Birth*</ThemedText><TextInput style={styles.input} value={form.dob} onChangeText={v => onChange('dob', v)} placeholder="YYYY-MM-DD" /></View>
                  <View style={styles.formRow}><ThemedText style={styles.label}>Contact Number</ThemedText><TextInput style={styles.input} value={form.contactNumber} onChangeText={v => onChange('contactNumber', v)} keyboardType="phone-pad" placeholder="e.g., 9876543210" /></View>
                  <View style={styles.formRow}><ThemedText style={styles.label}>Village</ThemedText><TextInput style={styles.input} value={form.village} onChangeText={v => onChange('village', v)} placeholder="Village Name" /></View>

                <View style={styles.formRow}>
                  <ThemedText style={styles.label}>Gender*</ThemedText>
                  <View style={styles.genderRow}>
                      {(['male', 'female', 'other'] as const).map(g => (
                          <Pressable key={g} style={[styles.chip, form.gender === g && styles.chipActive]} onPress={() => onChange('gender', g)}>
                              <ThemedText style={[styles.chipText, form.gender === g && styles.chipTextActive]}>{g.charAt(0).toUpperCase() + g.slice(1)}</ThemedText>
                          </Pressable>
                      ))}
                  </View>
                </View>
                </ScrollView>

                <Pressable style={styles.primaryBtn} onPress={submitForm} disabled={submitting}>
                    {submitting ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.primaryBtnText}>{editing ? 'Save Changes' : 'Create Patient'}</ThemedText>}
                </Pressable>
             </Pressable>
          </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* Voice Search Modal */}
        <Modal visible={voiceModalVisible} animationType="slide" transparent onRequestClose={onVoiceModalClose}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.modalBackdrop} onPress={onVoiceModalClose}>
            <Pressable style={styles.voiceSheetCard} onPress={() => {}}>
              <View style={styles.modalHeader}><ThemedText type="title">Voice Search</ThemedText><Pressable onPress={onVoiceModalClose} hitSlop={8}><Ionicons name="close" size={24} color="#11181C" /></Pressable></View>
              <View style={styles.transcriptionTextBox}><ThemedText style={styles.transcriptionText}>{transcribedText || 'Press the mic to start recording.'}</ThemedText></View>
              <View style={styles.voiceActionsContainer}>
                {(isTranscribing || isSendingCommand) ? (
                  <ActivityIndicator size="large" color="#0a7ea4" />
                ) : (
                  <>
                    <Pressable
                      style={[styles.voiceActionButton, (isRecording || hasTranscript) && styles.disabledButton]}
                      onPress={startRecording}
                      disabled={isRecording || hasTranscript}
                    >
                      <Ionicons name="mic" size={32} color="#FFFFFF" />
                    </Pressable>
                    <Pressable
                      style={[styles.voiceActionButton, styles.stopButton, !isRecording && styles.disabledButton]}
                      onPress={handleStopAndTranscribe}
                      disabled={!isRecording}
                    >
                      <Ionicons name="stop" size={32} color="#FFFFFF" />
                    </Pressable>
                    <Pressable
                      style={[styles.voiceActionButton, !hasTranscript && styles.disabledButton]}
                      onPress={handleSendCommand}
                      disabled={!hasTranscript}
                    >
                      <Ionicons name="send" size={28} color="#FFFFFF" />
                    </Pressable>
                  </>
                )}
              </View>
              {extractedIntent === 'REGISTER_PATIENT' && (
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
                  <View style={styles.formRow}>
                    <ThemedText style={styles.label}>Name</ThemedText>
                    <TextInput
                      style={styles.input}
                      value={(extracted.name as string) || ''}
                      onChangeText={(v) => setExtracted(prev => ({ ...prev, name: v }))}
                      placeholder="Full Name"
                    />
                  </View>
                  <View style={[styles.formRow, styles.row]}>
                    <View style={[styles.col, { marginRight: 6 }]}>
                      <ThemedText style={styles.label}>Age</ThemedText>
                      <TextInput
                        style={styles.input}
                        value={extracted.age === '' || extracted.age === undefined ? '' : String(extracted.age)}
                        onChangeText={(v) => {
                          const n = Number(v.replace(/[^0-9]/g, ''));
                          setExtracted(prev => ({ ...prev, age: isNaN(n) ? '' : n }));
                        }}
                        keyboardType="number-pad"
                        placeholder="e.g., 45"
                      />
                    </View>
                    <View style={[styles.col, { marginLeft: 6 }]}>
                      <ThemedText style={styles.label}>DOB</ThemedText>
                      <Pressable
                        onPress={() => setShowDobPicker(true)}
                      >
                        <View style={[styles.input, { justifyContent: 'center' }]}> 
                          <Text>{(extracted.dob as string) || 'YYYY-MM-DD'}</Text>
                        </View>
                      </Pressable>
                      {showDobPicker && (
                        <DateTimePicker
                          value={(extracted.dob && /^\d{4}-\d{2}-\d{2}$/.test(String(extracted.dob))) ? new Date(String(extracted.dob)) : new Date()}
                          mode="date"
                          display="spinner"
                          onChange={onDobChange}
                        />
                      )}
                    </View>
                  </View>
                  <View style={styles.formRow}>
                    <ThemedText style={styles.label}>Gender</ThemedText>
                    <View style={styles.dropdown}>
                      <Pressable style={styles.dropdownToggle}>
                        <ThemedText style={styles.dropdownText}>{(extracted.gender as string) ? String(extracted.gender)[0].toUpperCase() + String(extracted.gender).slice(1) : 'Select gender'}</ThemedText>
                        <Ionicons name="chevron-down" size={16} color="#687076" />
                      </Pressable>
                      <View style={styles.dropdownMenu}>
                        {(['male', 'female', 'other'] as const).map(g => (
                          <Pressable key={g} style={styles.dropdownItem} onPress={() => setExtracted(prev => ({ ...prev, gender: g }))}>
                            <ThemedText style={styles.dropdownItemText}>{g.charAt(0).toUpperCase() + g.slice(1)}</ThemedText>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                  <View style={[styles.formRow, styles.row]}>
                    <View style={[styles.col, { marginRight: 6 }]}>
                      <ThemedText style={styles.label}>Village</ThemedText>
                      <TextInput
                        style={styles.input}
                        value={(extracted.village as string) || ''}
                        onChangeText={(v) => setExtracted(prev => ({ ...prev, village: v }))}
                        placeholder="Village Name"
                      />
                    </View>
                    <View style={[styles.col, { marginLeft: 6 }]}>
                      <ThemedText style={styles.label}>Contact</ThemedText>
                      <TextInput
                        style={styles.input}
                        value={(extracted.contactNumber as string) || ''}
                        onChangeText={(v) => setExtracted(prev => ({ ...prev, contactNumber: v }))}
                        placeholder="e.g., 9876543210"
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>
                  <View style={styles.formRow}>
                    <ThemedText style={styles.label}>Notes (Additional remarks)</ThemedText>
                    <TextInput
                      style={[styles.input, { minHeight: 80 }]} multiline textAlignVertical="top"
                      value={(extracted.notes as string) || ''}
                      onChangeText={(v) => setExtracted(prev => ({ ...prev, notes: v }))}
                      placeholder="e.g., घर पर देखभाल की आवश्यकता"
                    />
                  </View>
                  <Pressable style={styles.primaryBtn} onPress={validateAndRegisterFromExtracted}>
                    <ThemedText style={styles.primaryBtnText}>Register Patient</ThemedText>
                  </Pressable>
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#FFFFFF' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F4F5', borderRadius: 12, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: '#EDEDED' },
  searchInput: { flex: 1, paddingVertical: 0, color: '#11181C', fontSize: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, marginVertical: 5, borderWidth: 1, borderColor: '#ECECEC', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: '#F4F4F5' },
  contentContainer: { flex: 1, marginRight: 10 },
  cardTitle: { fontWeight: '600', fontSize: 14, color: '#11181C', marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  metaItemRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#687076', fontSize: 12 },
  actionsContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  verticalButtons: { flexDirection: 'column', gap: 6 },
  actionButton: { width: 30, height: 30, borderRadius: 6, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  deleteButton: { backgroundColor: '#FEF2F2' },
  callButton: { backgroundColor: '#F0FDF4', alignSelf: 'flex-end' },
  fab: { position: 'absolute', right: 20, bottom: 30, width: 56, height: 56, borderRadius: 28, backgroundColor: '#0a7ea4', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 3 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, width: '92%', maxWidth: 560, shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 4 }, shadowRadius: 20, elevation: 5 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  formRow: { marginBottom: 12 },
  label: { color: '#687076', marginBottom: 6, fontSize: 14 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#11181C', backgroundColor: '#FFFFFF', fontSize: 16 },
  genderRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F4F4F5', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#E6F6FB', borderColor: '#0a7ea4' },
  chipText: { color: '#11181C' },
  chipTextActive: { color: '#0a7ea4', fontWeight: '600' },
  primaryBtn: { marginTop: 16, backgroundColor: '#0a7ea4', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  voiceSheetCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 30, width: '100%', borderWidth: 1, borderColor: '#ECECEC', position: 'absolute', bottom: 0 },
  transcriptionTextBox: { minHeight: 100, backgroundColor: '#F4F4F5', borderRadius: 12, padding: 16, justifyContent: 'center', alignItems: 'center', marginVertical: 20 },
  transcriptionText: { color: '#333', fontSize: 16, textAlign: 'center' },
  voiceActionsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 10, minHeight: 80 },
  voiceActionButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0a7ea4', justifyContent: 'center', alignItems: 'center' },
  stopButton: { backgroundColor: '#dc2626' },
  disabledButton: { opacity: 0.4, backgroundColor: '#9BA1A6' },
  sendButtonMain: { marginTop: 10, backgroundColor: '#16a34a', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  responseBox: { marginTop: 12, backgroundColor: '#F4F4F5', borderRadius: 12, padding: 12, maxHeight: 160 },
  responseText: { color: '#11181C', fontSize: 14 },
  // new layout helpers
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1 },
  // simple dropdown styles
  dropdown: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  dropdownToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  dropdownText: { color: '#11181C', fontSize: 16 },
  dropdownMenu: { borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 10 },
  dropdownItemText: { color: '#11181C', fontSize: 16 },
});