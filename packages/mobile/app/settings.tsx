import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import { theme } from '../src/types/theme'
import { Header } from '../src/components/Header'
import { healthCheck, getAgentServerUrl, setAgentServerUrl } from '../src/services/api'

export default function SettingsScreen() {
  const [agentInput, setAgentInput] = useState(getAgentServerUrl())
  const [agentStatus, setAgentStatus] = useState<'unknown' | 'online' | 'offline'>('unknown')
  const [agentChecking, setAgentChecking] = useState(false)

  useEffect(() => {
    setAgentInput(getAgentServerUrl())
  }, [])

  async function handleAgentSave() {
    const url = agentInput.trim()
    if (!url) { Alert.alert('Error', 'Agent server URL cannot be empty'); return }
    setAgentServerUrl(url)
    Alert.alert('Saved', `Automation server URL updated`)
  }

  async function handleAgentCheck() {
    setAgentChecking(true); setAgentStatus('unknown')
    const ok = await healthCheck()
    setAgentStatus(ok ? 'online' : 'offline'); setAgentChecking(false)
  }

  return (
    <View style={styles.container}>
      <Header title="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Device Automation Server</Text>
        <Text style={styles.label}>Helper APK URL (default: http://127.0.0.1:19091)</Text>
        <Text style={styles.hint}>
          The Helper APK runs an HTTP server on your phone for automation commands.
          No internet required for device control.
        </Text>
        <TextInput style={styles.input} value={agentInput} onChangeText={setAgentInput}
          placeholder="http://127.0.0.1:19091" placeholderTextColor={theme.textMuted}
          autoCapitalize="none" autoCorrect={false} />
        <View style={styles.row}>
          <TouchableOpacity style={styles.btn} onPress={handleAgentSave}><Text style={styles.btnText}>Save</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.checkBtn]} onPress={handleAgentCheck} disabled={agentChecking}>
            <Text style={styles.btnText}>{agentChecking ? 'Checking...' : 'Test'}</Text>
          </TouchableOpacity>
        </View>
        {agentStatus !== 'unknown' && (
          <View style={[styles.statusBadge, agentStatus === 'online' ? styles.online : styles.offline]}>
            <Text style={styles.statusText}>{agentStatus === 'online' ? 'Helper APK Connected ✓' : 'Helper APK Not Connected ✗'}</Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>AI Connection</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            <Text style={styles.bold}>AI:</Text> Zyraxon.ai (free, no API key needed){'\n'}
            <Text style={styles.bold}>Internet:</Text> Required for AI responses{'\n'}
            <Text style={styles.bold}>Automation:</Text> Works offline via Helper APK
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>About</Text>
        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>ZYRAXON AI Mobile</Text>
          <Text style={styles.aboutVersion}>Version 2.0.0</Text>
          <Text style={styles.aboutDesc}>
            Full mobile AI agent with voice, vision, and device automation.{'\n'}
            AI powered by Zyraxon.ai (free models).{'\n'}
            Device control via Helper APK (Accessibility Service).
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 12 },
  label: { fontSize: 13, color: theme.textDim, marginBottom: 6 },
  hint: { fontSize: 12, color: theme.textMuted, marginBottom: 12, lineHeight: 18 },
  input: { backgroundColor: theme.inputBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, borderWidth: 1, borderColor: theme.inputBorder, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  checkBtn: { backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.border },
  btnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  statusBadge: { marginTop: 12, padding: 10, borderRadius: 8, alignItems: 'center' },
  online: { backgroundColor: '#22c55e20', borderWidth: 1, borderColor: '#22c55e' },
  offline: { backgroundColor: '#ef444420', borderWidth: 1, borderColor: '#ef4444' },
  statusText: { fontSize: 13, fontWeight: '600', color: theme.text },
  infoCard: { backgroundColor: theme.card, borderRadius: 10, padding: 14, marginBottom: 12 },
  infoText: { fontSize: 13, color: theme.textDim, lineHeight: 22 },
  bold: { fontWeight: '700', color: theme.text },
  aboutCard: { backgroundColor: theme.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: theme.cardBorder },
  aboutTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 },
  aboutVersion: { fontSize: 13, color: theme.textMuted, marginBottom: 8 },
  aboutDesc: { fontSize: 13, color: theme.textDim, lineHeight: 20 },
})
