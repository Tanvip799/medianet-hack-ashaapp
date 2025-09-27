import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  age: { type: Number, min: 0, max: 130 },
  dob: { type: String }, // keep as string (YYYY-MM-DD)
  gender: { type: String, enum: ['male', 'female', 'other'], required: false },
  village: { type: String },
  contactNumber: { type: String },
  location: { type: String },
  diseases: [{ type: String }],
  notes: { type: String },
  govId: { type: String },
}, { timestamps: true });

patientSchema.index({ name: 1, village: 1 });

export default mongoose.models.Patient || mongoose.model('Patient', patientSchema);