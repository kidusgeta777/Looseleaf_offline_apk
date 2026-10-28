import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, AppState, PermissionsAndroid, Platform, Pressable, ScrollView,
  Share, StatusBar, StyleSheet, Switch, Text, View,
} from 'react-native';
import LooseOverlay from './modules/loose-overlay';

// Alert.alert does nothing in the browser, so use window.alert / confirm there.
function ask(title, message, buttons) {
  if (Platform.OS !== 'web') { Alert.alert(title, message, buttons); return; }
  const text = title + (message ? '\n\n' + message : '');
  const action = (buttons || []).find((b) => b.onPress);
  if (action && buttons.length > 1) { if (window.confirm(text)) action.onPress(); }
  else window.alert(text);
}

const COLORS = {
  bg: '#14123a', bg2: '#231a54', card: 'rgba(255,255,255,0.10)', line: 'rgba(255,255,255,0.22)',
  text: '#ffffff', soft: 'rgba(255,255,255,0.68)', green: '#4cd964', ink: '#2a1f5e', red: '#ff8a8a',
};

const fmt = (ts) => { try { return new Date(ts).toLocaleString(); } catch (e) { return ''; } };

async function shareText(message) {
  try { await Share.share({ message }); } catch (e) { /* cancelled or unavailable */ }
}

function Main() {
  const [ideas, setIdeas] = useState([]);
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');
  const wantOn = useRef(false);   // user asked for "on" and we are waiting for the overlay permission

  const askNotifications = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS); } catch (e) { /* optional */ }
    }
  };

  const turnOn = useCallback(async () => {
    if (!LooseOverlay.canDrawOverlays()) {
      ask(
        'Allow display over other apps',
        'The floating circle needs the "Display over other apps" permission. Turn it on for Loose, then come back.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => { wantOn.current = true; LooseOverlay.requestOverlayPermission(); } },
        ]
      );
      return;
    }
    await askNotifications();
    const started = !!LooseOverlay.start();
    setOn(started);
    if (!started && LooseOverlay.error()) setMsg('Could not start the circle: ' + LooseOverlay.error());
  }, []);

  const turnOff = useCallback(() => {
    wantOn.current = false;
    LooseOverlay.stop();
    setOn(false);
  }, []);

  // Sync with the native side whenever the app comes back to the front.
  const refresh = useCallback(() => {
    setIdeas(LooseOverlay.getIdeas());
    if (wantOn.current && LooseOverlay.canDrawOverlays()) {
      wantOn.current = false;
      turnOn();
      return;
    }
    const enabled = LooseOverlay.isEnabled();
    if (enabled && LooseOverlay.canDrawOverlays() && !LooseOverlay.isRunning()) LooseOverlay.start();
    setOn(enabled && LooseOverlay.canDrawOverlays());
  }, [turnOn]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const onDelete = (id) => {
    ask('Delete this idea?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { LooseOverlay.deleteIdea(id); setIdeas(LooseOverlay.getIdeas()); } },
    ]);
  };

  const onClear = () => {
    ask('Delete all ideas?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: () => { LooseOverlay.clearIdeas(); setIdeas([]); } },
    ]);
  };

  const onShareAll = () => {
    shareText(ideas.map((i) => i.text + '\n(' + fmt(i.ts) + ')').join('\n\n----------\n\n'));
  };

  if (!LooseOverlay.supported) {
    return (
      <View style={[s.root, s.center]}>
        <Text style={s.title}>Loose</Text>
        <Text style={[s.soft, { textAlign: 'center', marginTop: 8 }]}>
          {Platform.OS === 'android' ? 'The floating circle could not start.' : 'The floating circle only works on Android.'}
        </Text>
        {LooseOverlay.error() ? <Text selectable style={[s.small, { textAlign: 'center', marginTop: 12, color: COLORS.red }]}>{LooseOverlay.error()}</Text> : null}
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Loose</Text>

        <View style={[s.card, s.row]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.cardTitle}>Floating circle</Text>
            <Text style={s.small}>{on ? 'On: tap the circle and type an idea' : 'Off: the circle is hidden'}</Text>
          </View>
          <Switch
            value={on}
            onValueChange={(v) => (v ? turnOn() : turnOff())}
            trackColor={{ false: 'rgba(255,255,255,0.25)', true: COLORS.green }}
            thumbColor="#ffffff"
          />
        </View>
        {msg ? <Text selectable style={[s.small, { color: COLORS.red, marginTop: 8 }]}>{msg}</Text> : null}

        <View style={[s.row, { marginTop: 22, marginBottom: 10 }]}>
          <Text style={[s.cardTitle, { flex: 1, marginBottom: 0 }]}>Saved ideas ({ideas.length})</Text>
          {ideas.length > 0 ? (
            <>
              <Pressable onPress={onShareAll} hitSlop={8}><Text style={s.link}>Share all</Text></Pressable>
              <Pressable onPress={onClear} hitSlop={8}><Text style={[s.link, { color: COLORS.red, marginLeft: 16 }]}>Delete all</Text></Pressable>
            </>
          ) : null}
        </View>

        {ideas.length === 0 ? (
          <View style={s.card}>
            <Text style={s.small}>No ideas yet. Turn the circle on, tap it from any app, type your idea and press send. Everything is saved on this phone, no internet needed.</Text>
          </View>
        ) : ideas.map((i) => (
          <View key={i.id} style={[s.card, { marginBottom: 10 }]}>
            <Text selectable style={s.ideaText}>{i.text}</Text>
            <View style={[s.row, { marginTop: 10 }]}>
              <Text style={[s.small, { flex: 1 }]}>{fmt(i.ts)}</Text>
              <Pressable onPress={() => shareText(i.text)} hitSlop={8}><Text style={s.link}>Share</Text></Pressable>
              <Pressable onPress={() => onDelete(i.id)} hitSlop={8}><Text style={[s.link, { color: COLORS.red, marginLeft: 16 }]}>Delete</Text></Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { flexGrow: 1, paddingHorizontal: 18, paddingTop: (StatusBar.currentHeight || 24) + 20, paddingBottom: 34 },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '700', letterSpacing: 0.3, marginBottom: 18 },
  card: { backgroundColor: COLORS.card, borderColor: COLORS.line, borderWidth: 1, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 18 },
  row: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 3 },
  small: { color: COLORS.soft, fontSize: 13, lineHeight: 18 },
  soft: { color: COLORS.soft, fontSize: 15 },
  ideaText: { color: COLORS.text, fontSize: 16, lineHeight: 22 },
  link: { color: COLORS.green, fontWeight: '700', fontSize: 14 },
});

// Shows any crash on screen instead of silently closing the app.
class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
          <Text style={s.title}>Loose hit an error</Text>
          <Text selectable style={{ color: COLORS.red, fontSize: 13 }}>{String(this.state.error && (this.state.error.stack || this.state.error.message || this.state.error))}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <Boundary>
      <Main />
    </Boundary>
  );
}
