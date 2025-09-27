import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { WebView } from 'react-native-webview';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useLocalSearchParams, useRouter } from 'expo-router';

// --- Constants ---
const STATUS_OPTIONS = ['scheduled', 'completed', 'cancelled', 'missed', 'pending'];

// --- API URL Configuration ---
const getBaseUrl = () => {
    const env = (process.env || {}).EXPO_PUBLIC_API_URL;
    if (env) return env;
    // Note: The IP below is based on your original code. You may need to change it for your network.
    if (Platform.OS === 'android') return 'http://172.16.146.125:3000';
    return 'http://172.16.146.125:3000';
};
const API_BASE = getBaseUrl();
const TRANSCRIPTION_API = API_BASE.replace(':3000', ':5000');


// --- Helper function to format dates for display ---
const formatDateForDisplay = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    // e.g., "26 Sep 2025"
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// --- Helper for plain text status color ---
const getStatusTextStyle = (status) => {
    switch (status) {
        case 'completed':
            return { color: '#16A34A' }; // Green
        case 'cancelled':
        case 'missed':
            return { color: '#B91C1C' }; // Darker Red
        case 'scheduled':
        case 'pending':
        default:
            return { color: '#DC2626' }; // Red
    }
};


// --- Reusable Appointment Card Component ---
const AppointmentCard = ({ appointment, onEdit, onDelete, onToggleStatus, onAddNote, onPress }) => {
    const isCompleted = appointment.status === 'completed';
    const statusTextStyle = getStatusTextStyle(appointment.status);

    return (
        <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => onPress?.(appointment)}>
            {/* 1. Left Icon Pane */}
            <View style={styles.cardLeftPane}>
                 <MaterialCommunityIcons name="doctor" size={28} color="#0a7ea4" />
            </View>

            {/* 2. Main Body Content */}
            <View style={styles.cardBody}>
                <ThemedText style={styles.cardTitle} numberOfLines={1}>{appointment.name}</ThemedText>
                {appointment.desc ? (
                    <ThemedText style={styles.cardDescription} numberOfLines={2}>{appointment.desc}</ThemedText>
                ) : null}
                <ThemedText style={[styles.cardStatus, statusTextStyle]}>
                    {appointment.status}
                </ThemedText>
            </View>

            {/* 3. Right Pane for Date & Actions */}
            <View style={styles.cardRightPane}>
                {/* Top Row: Date & Edit */}
                <View style={styles.rightPaneRow}>
                    <ThemedText style={styles.cardDate}>{formatDateForDisplay(appointment.date)}</ThemedText>
                    <Pressable onPress={() => onEdit?.(appointment)} hitSlop={10} style={styles.actionIconBtn}>
                        <Ionicons name="create-outline" size={22} color="#475569" />
                    </Pressable>
                </View>

                {/* Bottom Row: Toggle & Delete */}
                <View style={styles.rightPaneRow}>
                    <Pressable onPress={() => onToggleStatus?.(appointment)} hitSlop={10} style={styles.actionIconBtn}>
                        <Ionicons
                            name={isCompleted ? 'refresh-circle' : 'checkmark-done-circle'}
                            size={26}
                            color={isCompleted ? '#64748B' : '#16A34A'}
                        />
                    </Pressable>
                    <Pressable onPress={() => onAddNote?.(appointment)} hitSlop={10} style={styles.actionIconBtn}>
                        <Ionicons name="add-circle" size={26} color="#0a7ea4" />
                    </Pressable>
                    <Pressable onPress={() => onDelete?.(appointment)} hitSlop={10} style={styles.actionIconBtn}>
                        <Ionicons name="trash-outline" size={22} color="#dc2626" />
                    </Pressable>
                </View>
            </View>
        </TouchableOpacity>
    );
};


// --- Main Screen Component ---
export default function PatientDetailsScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const id = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id), [params]);

    const [loading, setLoading] = useState(true);
    const [patient, setPatient] = useState(null);
    const [appts, setAppts] = useState([]);
    const [apptsLoading, setApptsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('Appointments');
    
    // Modal and Form state
    const [showModal, setShowModal] = useState(false);
    const [editingAppt, setEditingAppt] = useState(null);
    const [form, setForm] = useState({ name: '', date: new Date(), desc: '', status: 'scheduled' });
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // Voice to appointment state
    const [voiceModalVisible, setVoiceModalVisible] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recording, setRecording] = useState(null);
    const [transcribedText, setTranscribedText] = useState('');
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isSendingCommand, setIsSendingCommand] = useState(false);
    const [commandResult, setCommandResult] = useState(null);
    // Prefilled appointment form from voice
    const [voiceForm, setVoiceForm] = useState({ name: '', date: new Date(), desc: '', hospital: '' });
    const [voiceShowDatePicker, setVoiceShowDatePicker] = useState(false);
    const [savingVoiceAppt, setSavingVoiceAppt] = useState(false);
    // Patient selection for voice-created appointment
    const [allPatients, setAllPatients] = useState([]);
    const [patientsLoading, setPatientsLoading] = useState(false);
    const [voiceSelectedPatient, setVoiceSelectedPatient] = useState(null); // {_id, name}
    const [showPatientPicker, setShowPatientPicker] = useState(false);
    const [patientQuery, setPatientQuery] = useState('');

    // Quick Note state (per-appointment)
    const [noteModalVisible, setNoteModalVisible] = useState(false);
    const [noteForAppt, setNoteForAppt] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [noteIsRecording, setNoteIsRecording] = useState(false);
    const [noteRecording, setNoteRecording] = useState(null);
    const [noteIsTranscribing, setNoteIsTranscribing] = useState(false);
    const [noteSaving, setNoteSaving] = useState(false);

    // Plans (bulk schedule) state
    const [planModalVisible, setPlanModalVisible] = useState(false);
    const [planApplying, setPlanApplying] = useState(false);

    // Report preview state (in-app only)
    const [reportPreviewVisible, setReportPreviewVisible] = useState(false);
    const [reportHtml, setReportHtml] = useState('');

    // Navigate to Notes screen for an appointment
    const openApptNotes = (appt) => {
        if (!appt?._id) return;
        router.push({ pathname: '/(tabs)/patients/[id]/notes', params: { id, apptId: appt._id } });
    };

    // --- Form Handlers ---
    const openModal = () => {
        setForm({ name: '', date: new Date(), desc: '', status: 'scheduled' });
        setEditingAppt(null);
        setShowModal(true);
    };
    const openEdit = (appt) => {
        try {
            setForm({
                name: appt.name || '',
                date: appt.date ? new Date(appt.date) : new Date(),
                desc: appt.desc || '',
                status: appt.status || 'scheduled',
            });
            setEditingAppt(appt);
            setShowModal(true);
        } catch (e) {
            console.warn('Failed to open edit modal', e?.message);
        }
    };
    const closeModal = () => setShowModal(false);
    const handleFormChange = (key, value) => setForm(f => ({ ...f, [key]: value }));
    const handleDateChange = (event, selectedDate) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            setForm(f => ({ ...f, date: selectedDate }));
        }
    };
    const submitAppointment = async () => {
        if (!form.name || !form.date) {
            Alert.alert('Missing fields', 'Name and Date are required');
            return;
        }
        setSubmitting(true);
        try {
            const isEdit = !!editingAppt?._id;
            const url = isEdit ? `${API_BASE}/api/appointments/${editingAppt._id}` : `${API_BASE}/api/appointments`;
            const method = isEdit ? 'PATCH' : 'POST';
            const payload = isEdit ? { name: form.name, date: form.date, desc: form.desc, status: form.status } : { ...form, patientId: id };
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(await res.text());
            closeModal();
            await loadAppointments();
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Could not save appointment.');
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDeleteAppt = (appt) => {
        Alert.alert('Delete appointment', `Delete "${appt.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteAppointment(appt) },
        ]);
    };

    const deleteAppointment = async (appt) => {
        try {
            const res = await fetch(`${API_BASE}/api/appointments/${appt._id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            await loadAppointments();
        } catch (e) {
            console.error('Delete appointment failed:', e?.message);
            Alert.alert('Error', 'Failed to delete appointment');
        }
    };

    const toggleStatus = async (appt) => {
        const newStatus = appt.status === 'completed' ? 'pending' : 'completed';
        try {
            const res = await fetch(`${API_BASE}/api/appointments/${appt._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error(await res.text());
            await loadAppointments();
        } catch (e) {
            console.error('Toggle status failed:', e?.message);
            Alert.alert('Error', 'Failed to update status');
        }
    };

    // --- Quick Note handlers ---
    const openNoteModal = (appt) => {
        setNoteForAppt(appt);
        setNoteText(typeof appt?.notes === 'string' ? appt.notes : '');
        setNoteModalVisible(true);
    };
    const closeNoteModal = () => {
        if (noteIsRecording && noteRecording) {
            try { noteRecording.stopAndUnloadAsync(); } catch {}
        }
        setNoteIsRecording(false);
        setNoteRecording(null);
        setNoteIsTranscribing(false);
        setNoteModalVisible(false);
    };
    const startNoteRecording = async () => {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission denied', 'Microphone permission is required.');
                return;
            }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            setNoteIsRecording(true);
            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            setNoteRecording(recording);
        } catch (err) {
            console.error('Failed to start note recording', err);
            Alert.alert('Error', 'Could not start recording.');
            setNoteIsRecording(false);
        }
    };
    const stopAndTranscribeNote = async () => {
        if (!noteRecording) return;
        setNoteIsRecording(false);
        try { await noteRecording.stopAndUnloadAsync(); } catch {}
        const uri = noteRecording.getURI();
        setNoteRecording(null);
        if (!uri) {
            Alert.alert('Error', 'No audio captured.');
            return;
        }
        try {
            setNoteIsTranscribing(true);
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
            console.error('Note transcription failed', e);
            Alert.alert('Error', 'Failed to transcribe audio.');
        } finally {
            setNoteIsTranscribing(false);
        }
    };
    const saveNote = async () => {
        const apptId = noteForAppt?._id;
        if (!apptId) { closeNoteModal(); return; }
        setNoteSaving(true);
        try {
            const res = await fetch(`${API_BASE}/api/appointments/${apptId}/notes`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: (noteText || '').toString() })
            });
            if (!res.ok) throw new Error(await res.text());
            await loadAppointments();
            closeNoteModal();
        } catch (e) {
            console.error('Save note failed', e?.message);
            Alert.alert('Error', 'Failed to save note.');
        } finally {
            setNoteSaving(false);
        }
    };

    // --- Voice handlers ---
    const openVoiceModal = () => {
        setTranscribedText('');
        setCommandResult(null);
        setVoiceForm({ name: '', date: new Date(), desc: '', hospital: '' });
        setVoiceShowDatePicker(false);
        // default to current patient, but allow changing
        setVoiceSelectedPatient(patient ? { _id: id, name: patient.name } : null);
        // preload patients list
        loadAllPatients();
        setVoiceModalVisible(true);
    };
    const closeVoiceModal = () => {
        if (isRecording && recording) {
            try { recording.stopAndUnloadAsync(); } catch {}
        }
        setIsRecording(false);
        setRecording(null);
        setIsTranscribing(false);
        setVoiceModalVisible(false);
    };
    const startRecording = async () => {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission denied', 'Microphone permission is required.');
                return;
            }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            setIsRecording(true);
            setTranscribedText('Listening...');
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
            formData.append('audio', { uri, name: 'appointment-voice.m4a', type: 'audio/m4a' });
            const res = await fetch(`${TRANSCRIPTION_API}/transcribe`, { method: 'POST', body: formData });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Server error: ${res.status} ${errText}`);
            }
            const result = await res.json();
            const transcript = (result && (result.transcript || result.text)) || '';
            if (typeof transcript === 'string' && transcript.trim()) {
                setTranscribedText(transcript);
            } else {
                setTranscribedText('');
                Alert.alert('No transcript', 'No text returned from server.');
            }
        } catch (e) {
            console.error('Transcription failed', e);
            Alert.alert('Error', 'Failed to transcribe audio.');
            setTranscribedText('');
        } finally {
            setIsTranscribing(false);
        }
    };

    const sendTranscriptForProcessing = async () => {
        const text = (transcribedText || '').toString().trim();
        if (!text) {
            Alert.alert('No transcript', 'Record something first.');
            return;
        }
        try {
            setIsSendingCommand(true);
            setCommandResult(null);
            const res = await fetch(`${API_BASE}/api/process-command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Server error: ${res.status} ${errText}`);
            }
            const json = await res.json();
            setCommandResult(json);
            prefillVoiceFormFromCommand(json);
        } catch (e) {
            console.error('process-command failed', e);
            Alert.alert('Error', 'Failed to process command');
        } finally {
            setIsSendingCommand(false);
        }
    };

    const prefillVoiceFormFromCommand = (json) => {
        try {
            const data = json?.data ?? json ?? {};
            const name = data.appointment_name || data.name || data.title || '';
            const reason = data.reason || data.desc || data.description || '';
            const hospital = data.hospital || data.hospital_name || '';
            let date = new Date();
            const rawDate = data.appointment_date || data.date || data.when || '';
            if (typeof rawDate === 'string' && rawDate.trim()) {
                const lower = rawDate.trim().toLowerCase();
                if (lower.includes('tomorrow')) {
                    const d = new Date(); d.setDate(d.getDate() + 1); date = d;
                } else if (lower.includes('today')) {
                    date = new Date();
                } else {
                    const parsed = new Date(rawDate);
                    if (!isNaN(parsed.getTime())) date = parsed;
                }
            }
            setVoiceForm({ name, date, desc: reason, hospital });
        } catch (e) {
            console.warn('prefillVoiceFormFromCommand failed', e?.message);
        }
    };

    const saveVoiceAppointment = async () => {
        const name = (voiceForm.name || '').toString().trim();
        const date = voiceForm.date;
    const desc = (voiceForm.desc || '').toString();
    const hospital = (voiceForm.hospital || '').toString();
        if (!name || !date) {
            Alert.alert('Missing fields', 'Name and Date are required');
            return;
        }
        const patientIdToUse = (voiceSelectedPatient && voiceSelectedPatient._id) ? voiceSelectedPatient._id : id;
        setSavingVoiceAppt(true);
        try {
            const res = await fetch(`${API_BASE}/api/appointments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, date, desc, status: 'scheduled', patientId: patientIdToUse, hospital }),
            });
            if (!res.ok) throw new Error(await res.text());
            await loadAppointments();
            closeVoiceModal();
        } catch (e) {
            console.error('saveVoiceAppointment failed', e?.message);
            Alert.alert('Error', 'Could not save appointment.');
        } finally {
            setSavingVoiceAppt(false);
        }
    };

    // Load all patients for selector
    const loadAllPatients = useCallback(async () => {
        try {
            setPatientsLoading(true);
            const res = await fetch(`${API_BASE}/api/patients`);
            if (!res.ok) throw new Error('Failed to load patients');
            const data = await res.json();
            setAllPatients(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Patients load error', e?.message);
        } finally {
            setPatientsLoading(false);
        }
    }, []);

    const filteredPatients = useMemo(() => {
        const q = (patientQuery || '').toLowerCase().trim();
        if (!q) return allPatients;
        return allPatients.filter(p =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.village || '').toLowerCase().includes(q) ||
            (p.contactNumber || '').toString().includes(q)
        );
    }, [patientQuery, allPatients]);

    // --- Data Loading & Sorting ---
    const loadPatientData = useCallback(async () => {
        if (!id) return;
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/api/patients/${id}`);
            if (!res.ok) throw new Error('Failed to load patient');
            const data = await res.json();
            setPatient({ 
                ...data,
                edd: '17/03/2026',
                gravidaPara: 'G2P1',
            });
        } catch (_e) {
            Alert.alert('Error', 'Unable to load patient details');
        } finally {
            setLoading(false);
        }
    }, [id]);

    const loadAppointments = useCallback(async () => {
        if (!id) return;
        try {
            setApptsLoading(true);
            const res = await fetch(`${API_BASE}/api/appointments?patientId=${id}`);
            if (!res.ok) throw new Error('Failed to load appointments');
            const data = await res.json();
            setAppts(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Appointments load error', e?.message);
        } finally {
            setApptsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadPatientData();
        loadAppointments();
    }, [loadPatientData, loadAppointments]);
    
    const { upcomingAppts, pastAppts } = useMemo(() => {
        const past = appts.filter(a => ['completed', 'cancelled', 'missed'].includes(a.status)).sort((a, b) => new Date(b.date) - new Date(a.date));
        const upcoming = appts.filter(a => ['scheduled', 'pending'].includes(a.status)).sort((a, b) => new Date(a.date) - new Date(b.date));
        return { upcomingAppts: upcoming, pastAppts: past };
    }, [appts]);

    if (loading) { return <View style={styles.centered}><ActivityIndicator size="large" color="#0a7ea4" /></View>; }
    if (!patient) { return <View style={styles.centered}><ThemedText>Patient not found.</ThemedText></View>; }

    // --- Report: Fixed HTML template (Patient name, all appointments with notes) ---
    const buildReportHtml = () => {
        const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const rows = (appts || [])
            .slice()
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map(a => `
                <tr>
                    <td>${new Date(a.date).toLocaleDateString('en-GB')}</td>
                    <td>${(a.name || '').toString().replace(/</g,'&lt;')}</td>
                    <td>${(a.status || '').toString()}</td>
                    <td>${(a.desc || '').toString().replace(/</g,'&lt;')}</td>
                    <td>${(a.notes || '').toString().replace(/</g,'&lt;')}</td>
                </tr>
            `).join('');
        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
                    <title>Patient Report</title>
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
                </head>
                <body>
                    <div class="header">
                        <div class="title">Patient Report</div>
                        <div class="meta">Generated on ${today}</div>
                    </div>
                    <div class="section">
                        <h2>Patient</h2>
                        <div><strong>Name:</strong> ${(patient?.name || '').toString().replace(/</g,'&lt;')}</div>
                        ${patient?.village ? `<div><strong>Village:</strong> ${String(patient.village).replace(/</g,'&lt;')}</div>` : ''}
                        ${patient?.contactNumber ? `<div><strong>Phone:</strong> ${String(patient.contactNumber).replace(/</g,'&lt;')}</div>` : ''}
                    </div>
                    <div class="section">
                        <h2>Appointments</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Title</th>
                                    <th>Status</th>
                                    <th>Description</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows || ''}
                            </tbody>
                        </table>
                    </div>
                </body>
            </html>
        `;
    };

    // Removed old external-open generate function to prefer in-app preview

    // Open in-app report preview (HTML) without leaving the app
    const openReportPreview = () => {
        try {
            const html = buildReportHtml();
            setReportHtml(html);
            setReportPreviewVisible(true);
        } catch (_e) {
            Alert.alert('Error', 'Unable to build report preview.');
        }
    };

    // Download PDF from the preview HTML (no external open)
    const downloadReportPdf = async () => {
        try {
            const html = reportHtml || buildReportHtml();
            const Print = await import('expo-print');
            const FileSystem = await import('expo-file-system/legacy');
            const FS = await import('expo-file-system');
            // request base64 for SAF writes
            const tmp = await Print.printToFileAsync({ html, base64: true });
            if (!tmp?.uri) throw new Error('Failed to create PDF');
            const safeName = `${(patient?.name || 'Patient').toString().replace(/[^a-z0-9_\-]+/gi,'_')}`;
            const dateStr = new Date().toISOString().slice(0,10);
            const fileName = `PatientReport_${safeName}_${dateStr}.pdf`;
            // Always save an HTML copy for in-app preview listing
            const htmlDir = FileSystem.documentDirectory + 'reports/';
            try { await FileSystem.makeDirectoryAsync(htmlDir, { intermediates: true }); } catch {}
            const htmlName = `PatientReport_${safeName}_${dateStr}.html`;
            try { await FileSystem.deleteAsync(htmlDir + htmlName, { idempotent: true }); } catch {}
            await FileSystem.writeAsStringAsync(htmlDir + htmlName, html, { encoding: 'utf8' });

            if (Platform.OS === 'android' && FS?.StorageAccessFramework) {
                try {
                    const perm = await FS.StorageAccessFramework.requestDirectoryPermissionsAsync();
                    if (perm.granted) {
                        const dirUri = perm.directoryUri;
                        const fileUri = await FS.StorageAccessFramework.createFileAsync(dirUri, fileName, 'application/pdf');
                        await FS.StorageAccessFramework.writeFileAsync(fileUri, tmp.base64 || '', { encoding: FS.EncodingType.Base64 });
                        Alert.alert('Report saved', 'Saved to the selected folder.');
                        return;
                    }
                    // fallthrough to app documents if not granted
                } catch (safErr) {
                    console.warn('SAF save failed:', safErr?.message);
                }
            }

            // Fallback: save inside app documents
            const dir = FileSystem.documentDirectory + 'reports/';
            try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch {}
            const dest = `${dir}${fileName}`;
            try { await FileSystem.deleteAsync(dest, { idempotent: true }); } catch {}
            await FileSystem.moveAsync({ from: tmp.uri, to: dest });
            Alert.alert('Report saved', `Saved to: ${dest}`);
        } catch (e) {
            const msg = (e && e.message) || String(e);
            if (msg && (msg.includes('expo-print') || msg.includes('expo-file-system') || msg.includes('Cannot find module'))) {
                Alert.alert('Missing dependency', 'Please install: expo install expo-print expo-file-system');
                return;
            }
            console.error('Report download failed:', msg);
            Alert.alert('Error', 'Failed to save report.');
        }
    };

    // --- Main Render ---
    return (
        <ThemedView style={styles.container}>
            <View style={styles.headerContainer}>
                <View style={styles.headerAvatar}><Ionicons name="person-outline" size={28} color="#0c4a6e" /></View>
                <View style={styles.headerMain}>
                    <ThemedText style={styles.headerName}>{patient.name}</ThemedText>
                    <View style={styles.headerInfoRow}><Ionicons name="call-outline" size={14} color="#E0F2FE" /><ThemedText style={styles.headerInfoText}>{patient.contactNumber}</ThemedText></View>
                    <View style={styles.headerInfoRow}><Ionicons name="person-outline" size={14} color="#E0F2FE" /><ThemedText style={styles.headerInfoText}>{patient.age} yrs, {patient.gender}</ThemedText></View>
                </View>
                <View style={styles.headerMeta}>
                    <ThemedText style={styles.headerMetaLabel}>Village: <ThemedText style={styles.headerMetaValue}>{patient.village}</ThemedText></ThemedText>
                    {patient.edd && <ThemedText style={styles.headerMetaLabel}>EDD: <ThemedText style={styles.headerMetaValue}>{patient.edd}</ThemedText></ThemedText>}
                    {patient.gravidaPara && <ThemedText style={styles.headerMetaLabel}>Gravida/Para: <ThemedText style={styles.headerMetaValue}>{patient.gravidaPara}</ThemedText></ThemedText>}
                </View>
            </View>

            

            <View style={styles.tabContainer}>
                <TouchableOpacity onPress={() => setActiveTab('Details')} style={[styles.tabButton, activeTab === 'Details' && styles.tabButtonActive]}><ThemedText style={[styles.tabText, activeTab === 'Details' && styles.tabTextActive]}>Details</ThemedText></TouchableOpacity>
                <TouchableOpacity onPress={() => setActiveTab('Appointments')} style={[styles.tabButton, activeTab === 'Appointments' && styles.tabButtonActive]}><ThemedText style={[styles.tabText, activeTab === 'Appointments' && styles.tabTextActive]}>Appointments</ThemedText></TouchableOpacity>
            </View>
            
            <ScrollView contentContainerStyle={styles.contentContainer}>
                {activeTab === 'Appointments' ? (
                    <>
                        {apptsLoading ? <ActivityIndicator color="#0a7ea4" style={{marginTop: 20}} /> : (
                            <>
                                {/* Actions toolbar: generate report (left) + voice + add plan (right) */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                    <Pressable onPress={openReportPreview} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#BAE6FD' }}>
                                        <Ionicons name="download-outline" size={18} color="#0a7ea4" />
                                        <ThemedText style={{ color: '#0a7ea4', fontWeight: '600' }}>Generate Report</ThemedText>
                                    </Pressable>
                                    <Pressable onPress={openVoiceModal} hitSlop={10}>
                                        <Ionicons name="mic-circle" size={28} color="#0a7ea4" />
                                    </Pressable>
                                    <Pressable onPress={() => setPlanModalVisible(true)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 }}>
                                        <Ionicons name="calendar-outline" size={18} color="#0a7ea4" />
                                        <ThemedText style={{ color: '#0a7ea4', fontWeight: '600' }}>Add Plan</ThemedText>
                                    </Pressable>
                                </View>
                                {upcomingAppts.length > 0 && (
                                    <View style={styles.sectionHeader}>
                                        <ThemedText style={styles.sectionTitle}>Upcoming</ThemedText>
                                    </View>
                                )}
                                {upcomingAppts.map(appt => (
                                    <AppointmentCard key={appt._id} appointment={appt} onEdit={openEdit} onDelete={confirmDeleteAppt} onToggleStatus={toggleStatus} onAddNote={openNoteModal} onPress={openApptNotes} />
                                ))}
                                {pastAppts.length > 0 && <View style={[styles.sectionHeader, { marginTop: 24 }]}><ThemedText style={styles.sectionTitle}>Past</ThemedText></View>}
                                {pastAppts.map(appt => (
                                    <AppointmentCard key={appt._id} appointment={appt} onEdit={openEdit} onDelete={confirmDeleteAppt} onToggleStatus={toggleStatus} onAddNote={openNoteModal} onPress={openApptNotes} />
                                ))}
                                {appts.length === 0 && (
                                    <View style={styles.centeredMessage}><ThemedText>No appointments scheduled.</ThemedText></View>
                                )}
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <View style={styles.detailsContainer}>
                            <ThemedText style={styles.detailsTitle}>Patient Information</ThemedText>
                            <View style={styles.detailItem}><ThemedText style={styles.detailLabel}>Date of Birth</ThemedText><ThemedText style={styles.detailValue}>{patient.dob}</ThemedText></View>
                            <View style={styles.detailItem}><ThemedText style={styles.detailLabel}>Contact Number</ThemedText><ThemedText style={styles.detailValue}>{patient.contactNumber}</ThemedText></View>
                            <View style={styles.detailItem}><ThemedText style={styles.detailLabel}>Village</ThemedText><ThemedText style={styles.detailValue}>{patient.village}</ThemedText></View>
                        </View>
                        <View style={[styles.detailsContainer, { marginTop: 12 }]}>
                            <ThemedText style={styles.detailsTitle}>Notes</ThemedText>
                            {patient?.notes && patient.notes.trim().length > 0 ? (
                                <ThemedText style={{ fontSize: 15, color: '#1E293B', lineHeight: 20 }}>{patient.notes}</ThemedText>
                            ) : (
                                <ThemedText style={{ fontSize: 14, color: '#64748B' }}>No notes added.</ThemedText>
                            )}
                        </View>
                    </>
                )}
            </ScrollView>

            {/* Quick Note Modal */}
            <Modal visible={noteModalVisible} animationType="fade" transparent onRequestClose={closeNoteModal}>
                <Pressable style={styles.modalOverlay} onPress={closeNoteModal}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={100} style={{ width: '100%', alignItems: 'center' }}>
                        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                            <ThemedText style={styles.modalTitle}>Quick Note</ThemedText>
                            <View style={[styles.inputContainer, { minHeight: 100 }] }>
                                <Ionicons name="document-text-outline" size={20} color="#64748B" />
                                <TextInput
                                    style={[styles.inputText, { minHeight: 100, textAlignVertical: 'top' }]}
                                    placeholder="Type a note or use the mic"
                                    placeholderTextColor="#94A3B8"
                                    value={noteText}
                                    onChangeText={setNoteText}
                                    multiline
                                    editable={!noteIsTranscribing}
                                />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                                <TouchableOpacity onPress={startNoteRecording} disabled={noteIsRecording || noteIsTranscribing} style={[styles.voiceActionBtn, noteIsRecording && { opacity: 0.7 }]}>
                                    <Ionicons name="mic" size={22} color="#fff" />
                                    
                                </TouchableOpacity>
                                <TouchableOpacity onPress={stopAndTranscribeNote} disabled={!noteIsRecording || noteIsTranscribing} style={[styles.voiceActionBtnSecondary, (!noteIsRecording || noteIsTranscribing) && { opacity: 0.6 }]}>
                                    <Ionicons name="stop" size={20} color="#0a7ea4" />
                                    <ThemedText style={styles.voiceActionTextSecondary}>{noteIsTranscribing ? 'Transcribing…' : 'Stop'}</ThemedText>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.modalButtonContainer}>
                                <TouchableOpacity onPress={closeNoteModal} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                                    <ThemedText style={styles.modalBtnTextSecondary}>Cancel</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={saveNote} disabled={noteSaving} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                                    <ThemedText style={styles.modalBtnTextPrimary}>{noteSaving ? 'Saving…' : 'Save Note'}</ThemedText>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </KeyboardAvoidingView>
                </Pressable>
            </Modal>

            {/* In-app Report Preview Modal */}
            <Modal visible={reportPreviewVisible} animationType="slide" onRequestClose={() => setReportPreviewVisible(false)}>
                <View style={styles.previewContainer}>
                    <View style={styles.previewHeader}>
                        <TouchableOpacity onPress={() => setReportPreviewVisible(false)} hitSlop={10} style={{ padding: 6 }}>
                            <Ionicons name="close" size={22} color="#FFFFFF" />
                        </TouchableOpacity>
                        <ThemedText style={styles.previewHeaderTitle}>Patient Report</ThemedText>
                        <TouchableOpacity onPress={downloadReportPdf} hitSlop={10} style={{ padding: 6 }}>
                            <Ionicons name="download-outline" size={22} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>
                    <WebView originWhitelist={["*"]} source={{ html: reportHtml }} style={styles.webview} startInLoadingState />
                </View>
            </Modal>

            {/* Voice Bottom Sheet */}
            <Modal visible={voiceModalVisible} animationType="slide" transparent onRequestClose={closeVoiceModal}>
                <Pressable style={styles.modalOverlay} onPress={closeVoiceModal}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={120} style={{ width: '100%' }}>
                    <Pressable style={styles.voiceSheet} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.voiceSheetHeader}>
                            <ThemedText style={styles.voiceSheetTitle}>Voice to Appointment</ThemedText>
                            <Pressable onPress={closeVoiceModal} hitSlop={10}><Ionicons name="close" size={22} color="#334155" /></Pressable>
                        </View>
                        <View style={styles.voiceActionRow}>
                            <Pressable onPress={startRecording} disabled={isRecording || isTranscribing} style={[styles.voiceActionBtn, isRecording && { opacity: 0.7 }]}>
                                <Ionicons name="mic" size={22} color="#fff" />
                                <ThemedText style={styles.voiceActionText}>Start</ThemedText>
                            </Pressable>
                            <Pressable onPress={handleStopAndTranscribe} disabled={!isRecording || isTranscribing} style={[styles.voiceActionBtnSecondary, (!isRecording || isTranscribing) && { opacity: 0.6 }]}>
                                <Ionicons name="stop" size={20} color="#0a7ea4" />
                                <ThemedText style={styles.voiceActionTextSecondary}>Stop</ThemedText>
                            </Pressable>
                            <Pressable onPress={sendTranscriptForProcessing} disabled={!transcribedText.trim() || isTranscribing || isSendingCommand} style={[styles.voiceActionBtnSend, (!transcribedText.trim() || isTranscribing || isSendingCommand) && { opacity: 0.6 }]}>
                                <Ionicons name="send" size={20} color="#fff" />
                                <ThemedText style={styles.voiceActionText}> {isSendingCommand ? 'Sending…' : 'Send'} </ThemedText>
                            </Pressable>
                        </View>
                        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
                        <View style={styles.voiceTextboxContainer}>
                            <ThemedText style={styles.modalSectionLabel}>Transcript</ThemedText>
                            <TextInput
                                style={styles.voiceInput}
                                placeholder="Transcript will appear here..."
                                placeholderTextColor="#94A3B8"
                                value={isTranscribing ? 'Transcribing…' : transcribedText}
                                onChangeText={setTranscribedText}
                                multiline
                                editable={!isTranscribing}
                            />
                            {/* Prefilled fields from command: hidden until response arrives */}
                            {commandResult && !isSendingCommand ? (
                                <>
                                    <ThemedText style={[styles.modalSectionLabel, { marginTop: 12 }]}>Review & Save</ThemedText>
                                    {/* Patient picker (defaults to current patient) */}
                                    <TouchableOpacity style={styles.inputContainer} onPress={() => setShowPatientPicker(true)}>
                                        <Ionicons name="person-outline" size={20} color="#64748B" />
                                        <ThemedText style={[styles.inputText, { flex: 1 }] }>
                                            {voiceSelectedPatient?.name ? voiceSelectedPatient.name : 'Select Patient'}
                                        </ThemedText>
                                    </TouchableOpacity>
                                    <View style={styles.inputContainer}>
                                        <Ionicons name="create-outline" size={20} color="#64748B" />
                                        <TextInput
                                            style={styles.inputText}
                                            value={voiceForm.name}
                                            onChangeText={(v) => setVoiceForm(f => ({ ...f, name: v }))}
                                            placeholder="Appointment Name*"
                                            placeholderTextColor="#94A3B8"
                                        />
                                    </View>
                                    <TouchableOpacity style={styles.inputContainer} onPress={() => setVoiceShowDatePicker(true)}>
                                        <Ionicons name="calendar-outline" size={20} color="#64748B" />
                                        <ThemedText style={[styles.inputText, { flex: 1 }]}>
                                            {voiceForm.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                                        </ThemedText>
                                    </TouchableOpacity>
                                    {voiceShowDatePicker && (
                                        <DateTimePicker
                                            value={voiceForm.date || new Date()}
                                            mode="date"
                                            display="default"
                                            onChange={(_e, d) => { setVoiceShowDatePicker(Platform.OS === 'ios'); if (d) setVoiceForm(f => ({ ...f, date: d })); }}
                                        />
                                    )}
                                    <View style={styles.inputContainer}>
                                        <Ionicons name="document-text-outline" size={20} color="#64748B" />
                                        <TextInput
                                            style={[styles.inputText, { minHeight: 80, textAlignVertical: 'top' }]}
                                            value={voiceForm.desc}
                                            onChangeText={(v) => setVoiceForm(f => ({ ...f, desc: v }))}
                                            placeholder="Reason / Description"
                                            placeholderTextColor="#94A3B8"
                                            multiline
                                        />
                                    </View>
                                    <View style={styles.inputContainer}>
                                        <Ionicons name="business-outline" size={20} color="#64748B" />
                                        <TextInput
                                            style={styles.inputText}
                                            value={voiceForm.hospital}
                                            onChangeText={(v) => setVoiceForm(f => ({ ...f, hospital: v }))}
                                            placeholder="Hospital (optional)"
                                            placeholderTextColor="#94A3B8"
                                        />
                                    </View>
                                    <View style={[styles.modalButtonContainer, { marginTop: 8 }]}>
                                        <TouchableOpacity onPress={saveVoiceAppointment} style={[styles.modalBtn, styles.modalBtnPrimary]} disabled={savingVoiceAppt}>
                                            <ThemedText style={styles.modalBtnTextPrimary}>{savingVoiceAppt ? 'Saving…' : 'Save Appointment'}</ThemedText>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            ) : null}
                        </View>
                        </ScrollView>
                    </Pressable>
                    </KeyboardAvoidingView>
                </Pressable>
            </Modal>

            {/* Add Plan Modal */}
            <Modal visible={planModalVisible} animationType="fade" transparent onRequestClose={() => setPlanModalVisible(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setPlanModalVisible(false)}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80} style={{ width: '100%', alignItems: 'center' }}>
                        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                            <ThemedText style={styles.modalTitle}>Add Plan</ThemedText>
                            <ThemedText style={styles.modalSectionLabel}>Choose a plan to schedule multiple appointments</ThemedText>
                            <View style={{ gap: 10, marginTop: 6 }}>
                                {[
                                    { key: 'immunization', label: 'Immunization Plan' },
                                    { key: 'pregnancy', label: 'Pregnancy Plan' },
                                    { key: 'family_planning', label: 'Family Planning Plan' },
                                    { key: 'nutrition', label: 'Nutrition Support Plan' },
                                    { key: 'tb', label: 'TB Treatment Plan' },
                                    { key: 'ncd', label: 'NCD Management Plan' },
                                ].map(p => (
                                    <TouchableOpacity
                                        key={p.key}
                                        disabled={planApplying}
                                        onPress={async () => {
                                            try {
                                                setPlanApplying(true);
                                                const res = await fetch(`${API_BASE}/api/patients/${id}/plans/${p.key}/apply`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({})
                                                });
                                                if (!res.ok) {
                                                    const err = await res.text();
                                                    throw new Error(err || 'Failed');
                                                }
                                                await loadAppointments();
                                                setPlanModalVisible(false);
                                                Alert.alert('Plan applied', `${p.label} has been scheduled.`);
                                            } catch (e) {
                                                console.error('Apply plan failed', e?.message);
                                                Alert.alert('Error', 'Failed to apply plan.');
                                            } finally {
                                                setPlanApplying(false);
                                            }
                                        }}
                                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <Ionicons name="albums-outline" size={18} color="#0a7ea4" />
                                            <ThemedText style={{ color: '#0f172a', fontWeight: '600' }}>{p.label}</ThemedText>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color="#64748B" />
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <View style={[styles.modalButtonContainer, { marginTop: 16 }]}>
                                <TouchableOpacity onPress={() => setPlanModalVisible(false)} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                                    <ThemedText style={styles.modalBtnTextSecondary}>Close</ThemedText>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </KeyboardAvoidingView>
                </Pressable>
            </Modal>

            {/* Patient Picker Modal for voice appointment */}
            <Modal visible={showPatientPicker} animationType="fade" transparent onRequestClose={() => setShowPatientPicker(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setShowPatientPicker(false)}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80} style={{ width: '100%', alignItems: 'center' }}>
                        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                            <ThemedText style={styles.modalTitle}>Select Patient</ThemedText>
                            <View style={styles.inputContainer}>
                                <Ionicons name="search" size={20} color="#64748B" />
                                <TextInput
                                    style={styles.inputText}
                                    placeholder="Search by name, village or phone"
                                    placeholderTextColor="#94A3B8"
                                    value={patientQuery}
                                    onChangeText={setPatientQuery}
                                />
                            </View>
                            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                                {patientsLoading ? (
                                    <ActivityIndicator color="#0a7ea4" style={{ marginVertical: 12 }} />
                                ) : (
                                    filteredPatients.map(p => (
                                        <TouchableOpacity key={p._id} style={styles.patientRow} onPress={() => { setVoiceSelectedPatient({ _id: p._id, name: p.name }); setShowPatientPicker(false); }}>
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
                            <View style={styles.modalButtonContainer}>
                                <TouchableOpacity onPress={() => setShowPatientPicker(false)} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                                    <ThemedText style={styles.modalBtnTextSecondary}>Close</ThemedText>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </KeyboardAvoidingView>
                </Pressable>
            </Modal>

            {activeTab === 'Appointments' && (
                <>
                    <TouchableOpacity style={styles.fab} onPress={openModal}><Ionicons name="add" size={32} color="#fff" /></TouchableOpacity>
                    <Modal visible={showModal} animationType="slide" transparent onRequestClose={closeModal}>
                        <Pressable style={styles.modalOverlay} onPress={closeModal}>
                            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={120} style={{ width: '100%', alignItems: 'center' }}>
                            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                                <ThemedText style={styles.modalTitle}>{editingAppt ? 'Edit Appointment' : 'New Appointment'}</ThemedText>
                                <ScrollView style={{ maxHeight: 460, width: '100%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
                                    <View style={styles.inputContainer}><Ionicons name="create-outline" size={20} color="#64748B" /><TextInput style={styles.inputText} value={form.name} onChangeText={v => handleFormChange('name', v)} placeholder="Appointment Name*" placeholderTextColor="#94A3B8" /></View>
                                    <TouchableOpacity style={styles.inputContainer} onPress={() => setShowDatePicker(true)}><Ionicons name="calendar-outline" size={20} color="#64748B" /><ThemedText style={[styles.inputText, { flex: 1 }]}>{form.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</ThemedText></TouchableOpacity>
                                    {showDatePicker && <DateTimePicker value={form.date || new Date()} mode="date" display="default" onChange={handleDateChange} />}
                                    <View style={styles.inputContainer}><Ionicons name="document-text-outline" size={20} color="#64748B" /><TextInput style={[styles.inputText, { minHeight: 80, textAlignVertical: 'top' }]} value={form.desc} onChangeText={v => handleFormChange('desc', v)} placeholder="Description" placeholderTextColor="#94A3B8" multiline /></View>
                                    <ThemedText style={styles.modalSectionLabel}>Status</ThemedText>
                                    <View style={styles.statusPillContainer}>
                                        {STATUS_OPTIONS.map(status => (
                                            <TouchableOpacity key={status} onPress={() => handleFormChange('status', status)} style={[styles.statusPill, form.status === status && styles.statusPillSelected]}><ThemedText style={[styles.statusPillText, form.status === status && styles.statusPillTextSelected]}>{status}</ThemedText></TouchableOpacity>
                                        ))}
                                    </View>
                                    <View style={[styles.modalButtonContainer, { marginBottom: 8 }]}>
                                        <TouchableOpacity onPress={closeModal} style={[styles.modalBtn, styles.modalBtnSecondary]}><ThemedText style={styles.modalBtnTextSecondary}>Cancel</ThemedText></TouchableOpacity>
                                        <TouchableOpacity onPress={submitAppointment} style={[styles.modalBtn, styles.modalBtnPrimary]} disabled={submitting}><ThemedText style={styles.modalBtnTextPrimary}>{submitting ? 'Saving...' : 'Save'}</ThemedText></TouchableOpacity>
                                    </View>
                                </ScrollView>
                            </Pressable>
                            </KeyboardAvoidingView>
                        </Pressable>
                    </Modal>
                </>
            )}
        </ThemedView>
    );
}

// --- Styles ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    centeredMessage: { marginTop: 40, alignItems: 'center' },
    headerContainer: { backgroundColor: '#0c4a6e', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
    headerAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
    headerMain: { flex: 1 },
    headerName: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
    headerInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    headerInfoText: { color: '#E0F2FE', fontSize: 13 },
    headerMeta: { alignItems: 'flex-start' },
    headerMetaLabel: { color: '#BAE6FD', fontSize: 12 },
    headerMetaValue: { color: '#FFFFFF', fontWeight: 'bold' },
    tabContainer: { flexDirection: 'row', backgroundColor: '#FFFFFF' },
    tabButton: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#E2E8F0' },
    tabButtonActive: { borderBottomColor: '#0a7ea4' },
    tabText: { color: '#64748B', fontSize: 15, fontWeight: '500' },
    tabTextActive: { color: '#0a7ea4' },
    contentContainer: { paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 80 },
    sectionHeader: { marginBottom: 8 },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#0c4a6e' },
    detailsContainer: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9' },
    detailItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    detailLabel: { fontSize: 15, color: '#475569' },
    detailValue: { fontSize: 15, color: '#1E293B', fontWeight: '500' },
    
    // --- New Card Styles for the requested layout ---
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginBottom: 12,
        shadowColor: "#94A3B8",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        flexDirection: 'row',
        overflow: 'hidden',
    },
    cardLeftPane: {
        width: 50,
        backgroundColor: '#E0F2FE',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
    },
    cardBody: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        justifyContent: 'center',
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#1E293B',
        marginBottom: 4,
    },
    cardDescription: {
        fontSize: 13,
        color: '#64748B',
        marginBottom: 6,
    },
    cardStatus: {
        fontSize: 14,
        fontWeight: 'bold',
        textTransform: 'capitalize',
    },
    cardRightPane: {
        paddingVertical: 10,
        paddingRight: 12,
        paddingLeft: 4,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    rightPaneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cardDate: {
        fontSize: 12,
        color: '#64748B',
    },
    actionIconBtn: {
        padding: 4,
    },
    
    // --- FAB and Modal Styles ---
    fab: { position: 'absolute', right: 24, bottom: 32, backgroundColor: '#0a7ea4', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 4 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '94%', backgroundColor: '#fff', borderRadius: 16, padding: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1E293B', marginBottom: 20 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
    inputText: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15, color: '#1E293B' },
    modalSectionLabel: { fontSize: 15, fontWeight: '500', color: '#475569', marginBottom: 10 },
    statusPillContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
    statusPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
    statusPillSelected: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
    statusPillText: { fontSize: 13, fontWeight: '500', color: '#475569', textTransform: 'capitalize' },
    statusPillTextSelected: { color: '#FFFFFF' },
    modalButtonContainer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 },
    modalBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
    modalBtnPrimary: { backgroundColor: '#0a7ea4' },
    modalBtnSecondary: { backgroundColor: '#E2E8F0' },
    modalBtnTextPrimary: { color: '#FFFFFF', fontWeight: 'bold' },
    modalBtnTextSecondary: { color: '#334155', fontWeight: 'bold' },
    detailsTitle: { color : '#000000'},
    // Voice sheet styles
    voiceSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '85%' },
    voiceSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    voiceSheetTitle: { fontSize: 16, fontWeight: '600', color: '#0c4a6e' },
    voiceActionRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    voiceActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0a7ea4', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
    voiceActionText: { color: '#FFFFFF', fontWeight: '600' },
    voiceActionBtnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
    voiceActionTextSecondary: { color: '#0a7ea4', fontWeight: '600' },
    voiceTextboxContainer: { marginTop: 6 },
    voiceInput: { minHeight: 100, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, color: '#1E293B', textAlignVertical: 'top' },
    voiceActionBtnSend: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0a7ea4', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
    jsonBox: { marginTop: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, backgroundColor: '#F8FAFC' },
    jsonText: { color: '#334155', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 12 },
    patientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    // Preview modal styles
    previewContainer: { flex: 1, backgroundColor: '#FFFFFF' },
    previewHeader: { height: 48, backgroundColor: '#0c4a6e', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
    previewHeaderTitle: { color: '#FFFFFF', fontWeight: '600' },
    webview: { flex: 1 }
});