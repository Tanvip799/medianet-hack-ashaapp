import mongoose from 'mongoose';

const { Schema } = mongoose;

const AppointmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    desc: { type: String, trim: true },
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled', 'missed', 'pending'], default: 'scheduled', index: true },
    date: { type: Date, required: true, index: true },
    doctor: { type: String, trim: true },
    program: { type: String, trim: true },
    hospital: { type: String, trim: true },
  },
  { timestamps: true }
);

AppointmentSchema.index({ patientId: 1, date: -1 });

const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', AppointmentSchema);
export default Appointment;
