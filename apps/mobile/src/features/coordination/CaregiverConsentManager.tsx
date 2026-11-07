import React, { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { mobileApiFetch } from '../../api/client';

type Consent = { id: string; caregiverName: string; caregiverEmail: string; relationship: string; status: string; permissions: string[] };

export default function CaregiverConsentManager() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [manageAppointments, setManageAppointments] = useState(false);
  const [viewObservations, setViewObservations] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await mobileApiFetch<{ consents: Consent[] }>('/consents');
      setConsents(result.consents);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load caregiver access.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function grant() {
    const permissions = [manageAppointments && 'MANAGE_CONSULTATIONS', viewObservations && 'VIEW_OBSERVATIONS'].filter(Boolean);
    if (!name.trim() || !email.trim() || !relationship.trim() || !permissions.length) {
      setError('Enter caregiver details and select at least one permission.'); return;
    }
    setBusy(true);
    setMessage('');
    try {
      await mobileApiFetch('/consents', { method: 'POST', body: JSON.stringify({ caregiverName: name.trim(), caregiverEmail: email.trim(), relationship: relationship.trim(), permissions }) });
      setName(''); setEmail(''); setRelationship(''); setManageAppointments(false); setViewObservations(false);
      await load();
      setMessage('Caregiver access granted.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to grant access.'); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true);
    setMessage('');
    try { await mobileApiFetch(`/consents/${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); setMessage('Caregiver access revoked.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to revoke access.'); }
    finally { setBusy(false); }
  }
  const inputStyle = { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, marginTop: 8 } as const;
  return <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 14, marginBottom: 16 }}>
    <Text style={{ fontSize: 18, fontWeight: '700' }}>Caregiver access</Text>
    <Text>Grant access to the caregiver's account email. Revocation takes effect on the server.</Text>
    {loading && <Text>Loading caregiver access…</Text>}
    {consents.map(c => <View key={c.id} style={{ paddingVertical: 10 }}>
      <Text>{c.caregiverName} ({c.caregiverEmail}) • {c.status}</Text>
      <Text>{c.relationship}: {c.permissions.join(', ')}</Text>
      {c.status === 'ACTIVE' && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void revoke(c.id)}><Text style={{ color: '#B91C1C', paddingVertical: 8 }}>Revoke access</Text></TouchableOpacity>}
    </View>)}
    <TextInput accessibilityLabel="Caregiver name" placeholder="Caregiver name" value={name} onChangeText={setName} style={inputStyle} />
    <TextInput accessibilityLabel="Caregiver email" placeholder="Caregiver account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={inputStyle} />
    <TextInput accessibilityLabel="Relationship" placeholder="Relationship" value={relationship} onChangeText={setRelationship} style={inputStyle} />
    <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: manageAppointments }} onPress={() => setManageAppointments(!manageAppointments)}><Text style={{ paddingVertical: 8 }}>{manageAppointments ? '☑' : '☐'} Manage appointments and consultations</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: viewObservations }} onPress={() => setViewObservations(!viewObservations)}><Text style={{ paddingVertical: 8 }}>{viewObservations ? '☑' : '☐'} View health observations</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void grant()}><Text style={{ color: '#C2410C', fontWeight: '700', paddingVertical: 8 }}>Grant access</Text></TouchableOpacity>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}
    {!!error && <TouchableOpacity accessibilityRole="button" onPress={() => void load()}><Text style={{ color: '#C2410C', paddingVertical: 8 }}>Retry loading</Text></TouchableOpacity>}
    {!!message && <Text accessibilityRole="alert" style={{ color: '#166534' }}>{message}</Text>}
  </View>;
}
