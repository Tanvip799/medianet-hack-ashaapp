import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import mongoose from 'mongoose';
import Patient from './models/Patient.js';
import Appointment from './models/Appointment.js';
import referencePlans from './plans/referencePlans.js';
import BirthRecord from './models/BirthRecord.js';
import DeathRecord from './models/DeathRecord.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Groq API configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error('ERROR: GROQ_API_KEY environment variable is required');
  process.exit(1);
}

// System prompt for command processing
const systemPrompt = `
You are "Asha Sahayak," a smart assistant for ASHA health workers in India.
Your job is to understand user voice commands (in Hindi, Marathi, or Hinglish) and convert them into a STRICT JSON object with this top-level structure only:
{
  "intent": string,            // One of: REGISTER_PATIENT | SCHEDULE_APPOINTMENT | REQUEST_INFO
  "data": object,             // Payload for the intent (see below)
  "response"?: string         // Present ONLY for REQUEST_INFO, a concise question for the user
}
Today’s date is ${new Date().toLocaleDateString('en-CA')}.

Intents:
1. "REGISTER_PATIENT"
2. "SCHEDULE_APPOINTMENT"

Entity extraction rules:

1) REGISTER_PATIENT.data MUST include:
  - name: string (required)
  - age: number (optional)
  - dob: string (YYYY-MM-DD, optional)
  - gender: string (required; enum: male | female | other — keep in English)
  - village: string (optional)
  - contactNumber: string (optional)
  - diseases: string[] (optional) — an array of short condition names, de-duplicated
  - notes: string (optional) — a concise summary sentence(s) including conditions if mentioned

2) SCHEDULE_APPOINTMENT.data MUST include (use EXACT keys in English):
  - appointment_name: string (required)
  - date: string (YYYY-MM-DD, required)
  - reason: string (optional)
  - hospital: string (optional)
  - diseases: string[] (optional) — an array of short condition names, de-duplicated

Language and script instructions:
- Detect the user's language automatically.
- If the user speaks Hindi or Marathi, all user-facing natural-language values MUST be in Devanagari script.
  Examples of user-facing values: response, reason, diseases (values inside the array), notes. Keep JSON keys and enum-like values (e.g., intent names, gender) in English.
- Preserve proper nouns (names, villages) as spoken. If they are clearly Romanized Hindi/Marathi, you MAY transliterate them to Devanagari when confident; otherwise keep as-is.
- If "intent" must be "REQUEST_INFO", the "response" question SHOULD be in the same language as the user (Hindi/Marathi in Devanagari, else English).

General rules:
- If required information is missing (e.g., name or age/dob for REGISTER_PATIENT, patient_name or date for SCHEDULE_APPOINTMENT), set:
  "intent": "REQUEST_INFO"
  and include a concise "response" question.
- Always respond ONLY with JSON (no markdown or extra text). Do not wrap the JSON in backticks or prose.
- Dates must be YYYY-MM-DD.
- Return UTF-8 JSON so Devanagari is preserved correctly.
- Do NOT invent fields. Only use the fields listed above. Place all extracted fields under "data".
`;

// MongoDB / Mongoose setup
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.warn('⚠️  MONGODB_URI not set. Database features will be disabled until you provide it in a .env file.');
} else {
  const connectWithRetry = async (retries = 5, delayMs = 3000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await mongoose.connect(MONGODB_URI, {
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
        });
        console.log('✅ Connected to MongoDB');
        break;
      } catch (err) {
        console.error(`MongoDB connection attempt ${attempt} failed:`, err.message);
        if (attempt === retries) {
          console.error('❌ Could not connect to MongoDB after multiple attempts. Continuing without database.');
        } else {
          console.log(`Retrying in ${delayMs / 1000}s...`);
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
  };
  connectWithRetry();
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'ASHA Voice Assistant Backend is running',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Command processing endpoint
app.post('/api/process-command', async (req, res) => {
  try {
    const { text } = req.body;

    // Validate input
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: 'Text is required and must be a string'
      });
    }

    console.log('Processing command:', text);

    // Call Groq Chat API for command understanding
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: text
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500
    }, {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

  const aiResponse = response.data.choices[0].message.content.trim();
    console.log('AI Response:', aiResponse);

    // Parse the JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', aiResponse);
      // Fallback response
      parsedResponse = {
        intent: 'REQUEST_INFO',
        response: 'मुझे समझने में कठिनाई हो रही है। कृपया फिर से कोशिश करें।'
      };
    }

    // Normalize to strict { intent, data, response? } shape
    const intent = parsedResponse.intent || parsedResponse.action || parsedResponse.type || 'REQUEST_INFO';
    const originalData = parsedResponse.data ?? (() => {
      // If model returned fields at top level, move non-intent/response keys into data
      const { intent: _i, action: _a, type: _t, response, ...rest } = parsedResponse || {};
      return rest;
    })();

    const data = { ...(originalData || {}) };

    // Coerce diseases into a string[] if present in any form
    const rawDiseases = data.diseases ?? data.conditions ?? data.issues ?? null;
    if (rawDiseases != null) {
      let list = [];
      if (Array.isArray(rawDiseases)) {
        list = rawDiseases;
      } else if (typeof rawDiseases === 'string') {
        // Split on commas, pipes, slashes, Hindi/English conjunctions
        list = rawDiseases
          .split(/[,|/;\n\r\t]|\band\b|\bऔर\b|\bwa\b/iu)
          .map(s => s.trim())
          .filter(Boolean);
      }
      // Dedupe (case-insensitive) while preserving Devanagari/user text
      const seen = new Set();
      data.diseases = list.filter(x => {
        const key = (x || '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Ensure notes is a string (join array if model provided an array)
    if (Array.isArray(data.notes)) {
      data.notes = data.notes.filter(Boolean).join(', ');
    } else if (data.notes != null && typeof data.notes !== 'string') {
      data.notes = String(data.notes);
    }

    // Normalize appointment fields: map appointment_name/name/title -> appointment_name
    if (data) {
      const apptName = data.appointment_name || data.name || data.title;
      if (apptName) {
        data.appointment_name = apptName;
      }
      // Normalize hospital naming if present in variants
      if (!data.hospital && typeof data.hospital_name === 'string') {
        data.hospital = data.hospital_name;
      }
    }

    const normalized = { intent, data };
    if (parsedResponse.response && typeof parsedResponse.response === 'string') {
      normalized.response = parsedResponse.response;
    }

    // Minimal debug to verify shaping (no secrets)
    try {
      console.log('Normalized command data:', {
        intent: normalized.intent,
        fields: Object.keys(normalized.data || {}),
        diseases: normalized.data?.diseases,
        notes: normalized.data?.notes,
      });
    } catch (_) {}

  // Send the normalized JSON back to client
  res.status(200).json(normalized);

  } catch (error) {
    console.error('Command processing error:', error.response?.data || error.message);
    
    res.status(500).json({
      error: 'Command processing failed',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// API routes for patients
app.post('/api/patients', async (req, res) => {
  try {
    const { name, age, dob, gender } = req.body;

    // Validate required fields
    if (!name || !age || !dob || !gender) {
      return res.status(400).json({ error: 'Name, age, dob, and gender are required.' });
    }

    // Allow optional fields like village, contactNumber, notes from AI extraction
    const payload = {
      ...req.body,
      name: name?.trim?.() || name,
      dob: typeof dob === 'string' ? dob.trim() : dob,
      village: typeof req.body.village === 'string' ? req.body.village.trim() : req.body.village,
      contactNumber: typeof req.body.contactNumber === 'string' ? req.body.contactNumber.trim() : req.body.contactNumber,
      notes: typeof req.body.notes === 'string' ? req.body.notes.trim() : req.body.notes,
      diseases: Array.isArray(req.body.diseases) ? req.body.diseases.filter(Boolean).map(String) : undefined,
    };
    const newPatient = new Patient(payload);
    const savedPatient = await newPatient.save();
    res.status(201).json(savedPatient);
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({ error: 'Failed to create patient.' });
  }
});

app.get('/api/patients', async (req, res) => {
  try {
    const patients = await Patient.find();
    res.status(200).json(patients);
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Failed to fetch patients.' });
  }
});

// Get a single patient by ID
app.get('/api/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found.' });
    }
    res.status(200).json(patient);
  } catch (error) {
    console.error('Error fetching patient by id:', error);
    res.status(500).json({ error: 'Failed to fetch patient.' });
  }
});

app.put('/api/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedPatient = await Patient.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedPatient) {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    res.status(200).json(updatedPatient);
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(500).json({ error: 'Failed to update patient.' });
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPatient = await Patient.findByIdAndDelete(id);

    if (!deletedPatient) {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    res.status(200).json({ message: 'Patient deleted successfully.' });
  } catch (error) {
    console.error('Error deleting patient:', error);
    res.status(500).json({ error: 'Failed to delete patient.' });
  }
});

// =====================
// Appointments Endpoints
// =====================

// Create appointment
app.post('/api/appointments', async (req, res) => {
  try {
    const { name, patientId, date, status } = req.body;
    if (!name || !patientId || !date) {
      return res.status(400).json({ error: 'name, patientId and date are required.' });
    }

    // ensure patient exists when DB is connected
    try {
      const patient = await Patient.findById(patientId);
      if (!patient) return res.status(404).json({ error: 'Patient not found.' });
    } catch (e) {
      // If DB not connected or invalid id format
      if (e?.name === 'CastError') return res.status(400).json({ error: 'Invalid patientId.' });
    }

  const appt = new Appointment({ ...req.body, status: status || 'scheduled' });
    const saved = await appt.save();
    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Failed to create appointment.' });
  }
});

// List appointments (optionally filter by patientId)
app.get('/api/appointments', async (req, res) => {
  try {
    const { patientId } = req.query;
    const q = patientId ? { patientId } : {};
    const list = await Appointment.find(q).sort({ date: -1, createdAt: -1 });
    res.status(200).json(list);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Failed to fetch appointments.' });
  }
});

// Get appointment by id
app.get('/api/appointments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
    res.status(200).json(appt);
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ error: 'Failed to fetch appointment.' });
  }
});

// Delete appointment by id
app.delete('/api/appointments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const appt = await Appointment.findByIdAndDelete(id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
    res.status(200).json({ message: 'Appointment deleted successfully.' });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: 'Failed to delete appointment.' });
  }
});

// Update appointment (e.g., status, date, name)
app.patch('/api/appointments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body || {};

    // If client tries to change patientId, ensure the patient exists
    if (update.patientId) {
      try {
        const p = await Patient.findById(update.patientId);
        if (!p) return res.status(404).json({ error: 'Patient not found for provided patientId.' });
      } catch (e) {
        if (e?.name === 'CastError') return res.status(400).json({ error: 'Invalid patientId.' });
      }
    }

    const appt = await Appointment.findByIdAndUpdate(id, update, { new: true });
    if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
    res.status(200).json(appt);
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Failed to update appointment.' });
  }
});

// Update only the notes field for a given appointment
app.patch('/api/appointments/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};

    if (notes != null && typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string if provided.' });
    }

    const appt = await Appointment.findByIdAndUpdate(
      id,
      { $set: { notes: notes?.trim?.() ?? '' } },
      { new: true }
    );
    if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
    res.status(200).json(appt);
  } catch (error) {
    console.error('Error updating appointment notes:', error);
    res.status(500).json({ error: 'Failed to update appointment notes.' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 ASHA Voice Assistant Backend running at http://localhost:${PORT}`);
  console.log(`🧠 Command processing endpoint: POST /api/process-command`);
  console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
});

// =====================
// Plans -> Bulk create appointments
// =====================
app.post('/api/patients/:id/plans/:planKey/apply', async (req, res) => {
  try {
    const { id, planKey } = req.params;
    const { startDate, hospital } = req.body || {};

    // Validate patient exists
    try {
      const p = await Patient.findById(id);
      if (!p) return res.status(404).json({ error: 'Patient not found.' });
    } catch (e) {
      if (e?.name === 'CastError') return res.status(400).json({ error: 'Invalid patientId.' });
    }

    const plan = referencePlans?.[planKey];
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    // Compute base date (noon to avoid TZ off-by-one in lists)
    const base = startDate ? new Date(startDate) : new Date();
    if (isNaN(base.getTime())) return res.status(400).json({ error: 'Invalid startDate.' });
    base.setHours(12, 0, 0, 0);

    const docs = (plan.steps || []).map(step => {
      const d = new Date(base);
      d.setDate(d.getDate() + (step.offsetDays || 0));
      return {
        name: step.name,
        patientId: id,
        date: d,
        status: 'scheduled',
        program: plan.label || plan.key,
        hospital: typeof hospital === 'string' ? hospital : undefined,
        desc: step.desc || undefined,
      };
    });

    if (!docs.length) return res.status(400).json({ error: 'Plan has no steps.' });

    // Insert many appointments
    const created = await Appointment.insertMany(docs);
    res.status(201).json(created);
  } catch (error) {
    console.error('Apply plan failed:', error);
    res.status(500).json({ error: 'Failed to apply plan.' });
  }
});

// =====================
// Birth records CRUD
// =====================
app.post('/api/births', async (req, res) => {
  try {
    const {
      mother_patient_id,
      birth_date,
      birth_time,
      birth_outcome,
      infant_sex,
      infant_weight_kg,
      place_of_delivery,
    } = req.body || {};

    if (!mother_patient_id || !birth_date) {
      return res.status(400).json({ error: 'mother_patient_id and birth_date are required.' });
    }

    // Validate mother and infant ids
    try {
      const mom = await Patient.findById(mother_patient_id);
      if (!mom) return res.status(404).json({ error: 'Mother patient not found.' });
    } catch (e) {
      if (e?.name === 'CastError') return res.status(400).json({ error: 'Invalid mother_patient_id.' });
    }
    const doc = await BirthRecord.create({
      mother_patient_id,
      birth_date: new Date(birth_date),
      birth_time: birth_time ? String(birth_time).trim() : undefined,
      birth_outcome: birth_outcome ? String(birth_outcome).trim() : undefined,
      infant_sex: infant_sex || 'unknown',
      infant_weight_kg: typeof infant_weight_kg === 'number' ? infant_weight_kg : (infant_weight_kg ? Number(infant_weight_kg) : undefined),
      place_of_delivery: place_of_delivery ? String(place_of_delivery).trim() : undefined,
    });
    res.status(201).json(doc);
  } catch (error) {
    console.error('Create birth record failed:', error);
    res.status(500).json({ error: 'Failed to create birth record.' });
  }
});

app.patch('/api/births/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.birth_date != null) updates.birth_date = new Date(updates.birth_date);
    if (updates.birth_time != null) updates.birth_time = String(updates.birth_time).trim();
    if (updates.birth_outcome != null) updates.birth_outcome = String(updates.birth_outcome).trim();
    if (updates.place_of_delivery != null) updates.place_of_delivery = String(updates.place_of_delivery).trim();
    if (updates.infant_weight_kg != null) updates.infant_weight_kg = Number(updates.infant_weight_kg);

    // Validate referenced patients if modified
    if (updates.mother_patient_id) {
      try {
        const mom = await Patient.findById(updates.mother_patient_id);
        if (!mom) return res.status(404).json({ error: 'Mother patient not found.' });
      } catch (e) {
        if (e?.name === 'CastError') return res.status(400).json({ error: 'Invalid mother_patient_id.' });
      }
    }
    const doc = await BirthRecord.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Birth record not found.' });
    res.json(doc);
  } catch (error) {
    console.error('Update birth record failed:', error);
    res.status(500).json({ error: 'Failed to update birth record.' });
  }
});

app.delete('/api/births/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await BirthRecord.findByIdAndDelete(id);
    if (!result) return res.status(404).json({ error: 'Birth record not found.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete birth record failed:', error);
    res.status(500).json({ error: 'Failed to delete birth record.' });
  }
});

// List births
app.get('/api/births', async (req, res) => {
  try {
    const { mother_patient_id, limit } = req.query || {};
    const q = {};
    if (mother_patient_id) q.mother_patient_id = mother_patient_id;
    const lim = Math.max(0, Math.min(Number(limit) || 0, 200));
    const cursor = BirthRecord.find(q).sort({ birth_date: -1, createdAt: -1 });
    if (lim) cursor.limit(lim);
    const list = await cursor.lean();
    res.json(list);
  } catch (error) {
    console.error('List births failed:', error);
    res.status(500).json({ error: 'Failed to list birth records.' });
  }
});

// =====================
// Death records CRUD
// =====================
app.post('/api/deaths', async (req, res) => {
  try {
    const {
      deceased_patient_id,
      death_date,
      death_time,
      place_of_death,
      reported_cause_of_death,
      is_maternal_death,
      is_infant_death,
    } = req.body || {};

    if (!deceased_patient_id || !death_date) {
      return res.status(400).json({ error: 'deceased_patient_id and death_date are required.' });
    }

    // Validate patient id
    try {
      const p = await Patient.findById(deceased_patient_id);
      if (!p) return res.status(404).json({ error: 'Deceased patient not found.' });
    } catch (e) {
      if (e?.name === 'CastError') return res.status(400).json({ error: 'Invalid deceased_patient_id.' });
    }

    const doc = await DeathRecord.create({
      deceased_patient_id,
      death_date: new Date(death_date),
      death_time: death_time ? String(death_time).trim() : undefined,
      place_of_death: place_of_death ? String(place_of_death).trim() : undefined,
      reported_cause_of_death: reported_cause_of_death ? String(reported_cause_of_death).trim() : undefined,
      is_maternal_death: Boolean(is_maternal_death),
      is_infant_death: Boolean(is_infant_death),
    });
    res.status(201).json(doc);
  } catch (error) {
    console.error('Create death record failed:', error);
    res.status(500).json({ error: 'Failed to create death record.' });
  }
});

app.patch('/api/deaths/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.death_date != null) updates.death_date = new Date(updates.death_date);
    if (updates.death_time != null) updates.death_time = String(updates.death_time).trim();
    if (updates.place_of_death != null) updates.place_of_death = String(updates.place_of_death).trim();
    if (updates.reported_cause_of_death != null) updates.reported_cause_of_death = String(updates.reported_cause_of_death).trim();
    if (updates.is_maternal_death != null) updates.is_maternal_death = Boolean(updates.is_maternal_death);
    if (updates.is_infant_death != null) updates.is_infant_death = Boolean(updates.is_infant_death);

    if (updates.deceased_patient_id) {
      try {
        const p = await Patient.findById(updates.deceased_patient_id);
        if (!p) return res.status(404).json({ error: 'Deceased patient not found.' });
      } catch (e) {
        if (e?.name === 'CastError') return res.status(400).json({ error: 'Invalid deceased_patient_id.' });
      }
    }

    const doc = await DeathRecord.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Death record not found.' });
    res.json(doc);
  } catch (error) {
    console.error('Update death record failed:', error);
    res.status(500).json({ error: 'Failed to update death record.' });
  }
});

app.delete('/api/deaths/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await DeathRecord.findByIdAndDelete(id);
    if (!result) return res.status(404).json({ error: 'Death record not found.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete death record failed:', error);
    res.status(500).json({ error: 'Failed to delete death record.' });
  }
});

// List deaths
app.get('/api/deaths', async (req, res) => {
  try {
    const { deceased_patient_id, limit } = req.query || {};
    const q = {};
    if (deceased_patient_id) q.deceased_patient_id = deceased_patient_id;
    const lim = Math.max(0, Math.min(Number(limit) || 0, 200));
    const cursor = DeathRecord.find(q).sort({ death_date: -1, createdAt: -1 });
    if (lim) cursor.limit(lim);
    const list = await cursor.lean();
    res.json(list);
  } catch (error) {
    console.error('List deaths failed:', error);
    res.status(500).json({ error: 'Failed to list death records.' });
  }
});