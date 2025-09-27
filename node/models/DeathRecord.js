import mongoose from 'mongoose';

const { Schema } = mongoose;

const DeathRecordSchema = new Schema(
  {
    deceased_patient_id: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    death_date: { type: Date, required: true, index: true },
    // Store time as HH:mm (24h)
    death_time: { type: String, trim: true },
    place_of_death: { type: String, trim: true },
    reported_cause_of_death: { type: String, trim: true },
    is_maternal_death: { type: Boolean, default: false },
    is_infant_death: { type: Boolean, default: false },
  },
  { timestamps: true }
);

DeathRecordSchema.index({ deceased_patient_id: 1, death_date: -1 });

const DeathRecord = mongoose.models.DeathRecord || mongoose.model('DeathRecord', DeathRecordSchema);
export default DeathRecord;
