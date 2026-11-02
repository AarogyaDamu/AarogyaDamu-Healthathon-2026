import { useEffect, useState } from 'react';
import { apiFetch, setActiveTargetPatientId, getActiveTargetPatientId } from '../api/client';
import { Users } from 'lucide-react';

export default function PatientSwitcher() {
  const [caregivingFor, setCaregivingFor] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>(getActiveTargetPatientId() || 'self');

  useEffect(() => {
    apiFetch<{ caregivingFor: any[] }>('/caregivers')
      .then((res) => setCaregivingFor(res.caregivingFor || []))
      .catch(() => {});
  }, []);

  if (caregivingFor.length === 0) return null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedId(val);
    setActiveTargetPatientId(val === 'self' ? null : val);
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg text-xs">
      <Users className="h-4 w-4 text-teal-700" />
      <span className="font-semibold text-teal-900">Active Profile:</span>
      <select
        value={selectedId}
        onChange={handleChange}
        className="bg-white border border-teal-300 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
      >
        <option value="self">Self (Ramesh Deshmukh)</option>
        {caregivingFor.map((c) => (
          <option key={c.consentId} value={c.patientId}>
            Dependent: {c.patientName} ({c.relationship})
          </option>
        ))}
      </select>
    </div>
  );
}