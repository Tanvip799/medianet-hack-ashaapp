import mongoose from 'mongoose';

const { Schema } = mongoose;

const BirthRecordSchema = new Schema(
  {
    mother_patient_id: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    birth_date: { type: Date, required: true, index: true },
    // Store time as HH:mm (24h)
    birth_time: { type: String, trim: true },
    birth_outcome: { type: String, trim: true },
    infant_sex: { type: String, enum: ['male', 'female', 'other', 'unknown'], default: 'unknown' },
    infant_weight_kg: { type: Number },
    place_of_delivery: { type: String, trim: true },
  },
  { timestamps: true }
);

BirthRecordSchema.index({ mother_patient_id: 1, birth_date: -1 });

const BirthRecord = mongoose.models.BirthRecord || mongoose.model('BirthRecord', BirthRecordSchema);
export default BirthRecord;
