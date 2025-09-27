// Static reference plan templates. Keep simple and declarative.
// Dates are computed as: startDate (if provided) else today, plus offsetDays.

export const referencePlans = {
  immunization: {
    key: 'immunization',
    label: 'Immunization Plan',
    steps: [
      { offsetDays: 0, name: 'Immunization Visit 1' },
      { offsetDays: 28, name: 'Immunization Visit 2' },
      { offsetDays: 70, name: 'Immunization Visit 3' },
      { offsetDays: 98, name: 'Immunization Visit 4' },
    ],
  },
  pregnancy: {
    key: 'pregnancy',
    label: 'Pregnancy Plan',
    steps: [
      { offsetDays: 0, name: 'ANC Checkup' },
      { offsetDays: 28, name: 'ANC Checkup' },
      { offsetDays: 56, name: 'ANC Checkup' },
      { offsetDays: 84, name: 'ANC Checkup' },
    ],
  },
  family_planning: {
    key: 'family_planning',
    label: 'Family Planning Plan',
    steps: [
      { offsetDays: 0, name: 'FP Counseling' },
      { offsetDays: 30, name: 'FP Follow-up' },
      { offsetDays: 90, name: 'FP Follow-up' },
      { offsetDays: 180, name: 'FP Follow-up' },
    ],
  },
  nutrition: {
    key: 'nutrition',
    label: 'Nutrition Support Plan',
    steps: [
      { offsetDays: 0, name: 'Nutrition Assessment' },
      { offsetDays: 14, name: 'Nutrition Follow-up' },
      { offsetDays: 28, name: 'Nutrition Follow-up' },
      { offsetDays: 42, name: 'Nutrition Follow-up' },
      { offsetDays: 56, name: 'Nutrition Follow-up' },
    ],
  },
  tb: {
    key: 'tb',
    label: 'TB Treatment Plan',
    steps: [
      // Intensive phase (weekly x8)
      ...Array.from({ length: 8 }, (_, i) => ({ offsetDays: i * 7, name: 'TB Intensive Phase Check' })),
      // Continuation phase (monthly x4)
      { offsetDays: 8 * 7 + 30, name: 'TB Continuation Phase Check' },
      { offsetDays: 8 * 7 + 60, name: 'TB Continuation Phase Check' },
      { offsetDays: 8 * 7 + 90, name: 'TB Continuation Phase Check' },
      { offsetDays: 8 * 7 + 120, name: 'TB Continuation Phase Check' },
    ],
  },
  ncd: {
    key: 'ncd',
    label: 'NCD Management Plan',
    steps: [
      { offsetDays: 0, name: 'NCD Baseline Check' },
      { offsetDays: 14, name: 'NCD Monitoring' },
      { offsetDays: 28, name: 'NCD Monitoring' },
      { offsetDays: 42, name: 'NCD Monitoring' },
      { offsetDays: 56, name: 'NCD Monitoring' },
      { offsetDays: 86, name: 'NCD Review' },
      { offsetDays: 116, name: 'NCD Review' },
      { offsetDays: 146, name: 'NCD Review' },
    ],
  },
};

export default referencePlans;
