import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Camera, Users, Map as MapIcon, Loader2, Search, X, LogOut, ArrowLeft, Trash2, CheckCircle2, Circle, Flag, Trophy, Crown } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- TENSORFLOW KI ---
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

// --- DEINE KEYS (Bereits eingefügt) ---
const SB_URL = "https://pbzwqiheskmmtkpwnqug.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiendxaWhlc2ttbXRrcHducXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE5ODksImV4cCI6MjA4MjI0Nzk4OX0.fkeP7Vi0qKyfHv4Z2wC0IZd145xc8i1aaFwme2OaESc";
const supabase = createClient(SB_URL, SB_KEY);

// Leaflet Fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// MASTER POOL (80 Objekte)
const MASTER_MISSIONS = [
  { id: 'm1', name: "Eine Person", points: 50, keywords: ["person"] },
  { id: 'm2', name: "Ein Fahrrad", points: 100, keywords: ["bicycle"] },
  { id: 'm3', name: "Ein Auto", points: 80, keywords: ["car"] },
  { id: 'm4', name: "Ein Motorrad", points: 120, keywords: ["motorcycle"] },
  { id: 'm5', name: "Ein Bus", points: 150, keywords: ["bus"] },
  { id: 'm6', name: "Ein LKW", points: 150, keywords: ["truck"] },
  { id: 'm7', name: "Eine Ampel", points: 200, keywords: ["traffic light"] },
  { id: 'm8', name: "Ein Stoppschild", points: 250, keywords: ["stop sign"] },
  { id: 'm9', name: "Eine Parkbank", points: 120, keywords: ["bench"] },
  { id: 'm10', name: "Ein Rucksack", points: 100, keywords: ["backpack"] },
  { id: 'm11', name: "Ein Regenschirm", points: 150, keywords: ["umbrella"] },
  { id: 'm12', name: "Eine Handtasche", points: 100, keywords: ["handbag"] },
  { id: 'm13', name: "Ein Ball", points: 80, keywords: ["sports ball", "soccer ball"] },
  { id: 'm14', name: "Eine Flasche", points: 60, keywords: ["bottle"] },
  { id: 'm15', name: "Ein Becher", points: 70, keywords: ["cup"] },
  { id: 'm16', name: "Ein Stuhl", points: 100, keywords: ["chair"] },
  { id: 'm17', name: "Eine Pflanze", points: 150, keywords: ["potted plant"] },
  { id: 'm18', name: "Ein Laptop", points: 200, keywords: ["laptop"] },
  { id: 'm19', name: "Ein Handy", points: 100, keywords: ["cell phone"] },
  { id: 'm20', name: "Ein Buch", points: 90, keywords: ["book"] },
  { id: 'm21', name: "Eine Uhr", points: 150, keywords: ["clock"] },
  { id: 'm22', name: "Ein Hund", points: 300, keywords: ["dog"] },
  { id: 'm23', name: "Eine Katze", points: 300, keywords: ["cat"] },
  { id: 'm24', name: "Ein Vogel", points: 200, keywords: ["bird"] },
  { id: 'm25', name: "Ein Skateboard", points: 250, keywords: ["skateboard"] }
];

function MapController({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 13); }, [center]);
  return null;
}

function App() {
  const [session, setSession] = useState(JSON.parse(localStorage.getItem("sk_session")) || null);
  const [authData, setAuthData] = useState({ user: "", pass: "" });
  const [view, setView] = useState('menu');
  const [loading, setLoading] = useState(false);

  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [setupData, setSetupData] = useState({ city: "", players: 2 });

  const [citySearch, setCitySearch] = useState("");
  const [cityResults, setCityResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [completedIds, setCompletedIds] = useState([]);
  const [currentScore, setCurrentScore] = useState(0);
  const [activeMission, setActiveMission] = useState(null);

  const [hasFinishedLocal, setHasFinishedLocal] = useState(false);

  const [mapCenter, setMapCenter] = useState([51.513, 7.465]);
  const [mapSearch, setMapSearch] = useState("");
  const [activeCityRank, setActiveCityRank] = useState({ name: "Dortmund", scores: [] });

  const [net, setNet] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);

  // 1. KI LADEN
  useEffect(() => {
    const loadModel = async () => {
      try {
        await tf.ready();
        const loadedNet = await cocoSsd.load();
        setNet(loadedNet);
        setModelLoading(false);
      } catch (err) { console.error(err); }
    };
    loadModel();
  }, []);

  // 2. REALTIME SYNC & SICHERHEITS-POLLING (Der Fix für Multiplayer!)
  useEffect(() => {
    if (!room) return;

    // A) LIVE VERBINDUNG (Reagiert sofort auf Datenbank-Events)
    const channel = supabase.channel(`room_channel_${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (p) => {
        if (p.eventType === 'DELETE') {
          alert("Raum wurde aufgelöst.");
          forceMenuReset();
        }
        if (p.eventType === 'UPDATE') {
          setRoom(prev => ({ ...prev, ...p.new }));
          if (p.new.is_started) setView('game');
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room.id}` }, (p) => {
        if (p.eventType === 'DELETE' && p.old && p.old.username === session.username) {
          alert("Du wurdest entfernt.");
          forceMenuReset();
        }
        fetchMembers();
      })
      .subscribe();

    // B) SICHERHEITS-CHECK (Alle 2 Sekunden nachfragen - falls Live Verbindung hängt)
    const interval = setInterval(async () => {
      // 1. Mitglieder neu laden (damit du deine Freundin siehst)
      fetchMembers();

      // 2. Prüfen ob Spiel gestartet ist (damit es bei ihr startet)
      const { data: currentRoom } = await supabase.from('rooms').select('*').eq('id', room.id).single();
      if (currentRoom) {
        if (currentRoom.is_started && view === 'lobby') {
          setView('game');
        }
      } else {
        // Falls Raum gelöscht wurde aber Realtime es verpasst hat
        forceMenuReset();
      }
    }, 2000);

    // Initial laden
    fetchMembers();

    // Aufräumen beim Verlassen
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [room, view]);


  useEffect(() => {
    if (view === 'game' && members.length > 0) {
      const allDone = members.every(m => m.is_finished === true);
      if (allDone) {
        setHasFinishedLocal(false);
        setView('scoreboard');
      }
    }
  }, [members, view]);

  const fetchMembers = async () => {
    if (!room) return;
    const { data } = await supabase.from('room_members').select('*').eq('room_id', room.id);
    if (data) setMembers(data);
  };

  const forceMenuReset = () => {
    setRoom(null); setView('menu'); setHasFinishedLocal(false); setCompletedIds([]); setCurrentScore(0); setLoading(false);
  };

  // --- ACTIONS ---

  const handleCloseRoomComplete = async () => {
    setLoading(true);
    try {
      if (room.host_name === session.username) {
        // Host archiviert und löscht
        await supabase.rpc('archive_and_close_room', { target_room_id: room.id });
      } else {
        // Mitglied verlässt
        await supabase.from('room_members').delete().eq('room_id', room.id).eq('username', session.username);
      }
    } catch (e) { console.error(e); }
    finally { forceMenuReset(); }
  };

  const handleFinishGame = async () => {
    if (!window.confirm("Punkte abgeben und beenden?")) return;
    setLoading(true);
    try {
      // Lokal sofort update
      setMembers(prev => prev.map(m => m.username === session.username ? { ...m, score: currentScore, is_finished: true } : m));

      // DB Update
      await supabase.from('room_members').update({ score: currentScore, is_finished: true }).eq('room_id', room.id).eq('username', session.username);

      // Leaderboard Summierung
      await supabase.rpc('add_score', { target_city: room.city, player_name: session.username, new_points: currentScore });

      const others = members.filter(m => m.username !== session.username);
      if (others.length === 0 || others.every(m => m.is_finished)) {
        setView('scoreboard');
      } else {
        setHasFinishedLocal(true);
      }
    } catch (e) { alert("Fehler: " + e.message); }
    setLoading(false);
  };

  const handleStartBattle = async () => {
    setLoading(true);
    const { error } = await supabase.from('rooms').update({ is_started: true }).eq('id', room.id);
    if (!error) setView('game');
    setLoading(false);
  };

  const handleAuth = async (mode) => {
    if (!authData.user || !authData.pass) return alert("Daten eingeben!"); setLoading(true);
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.from('players').insert([{ username: authData.user, password: authData.pass }]).select().single();
        if (error) throw error; setSession(data); localStorage.setItem("sk_session", JSON.stringify(data));
      } else {
        const { data } = await supabase.from('players').select('*').eq('username', authData.user).eq('password', authData.pass).single();
        if (!data) throw new Error("Falsch"); setSession(data); localStorage.setItem("sk_session", JSON.stringify(data));
      }
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (citySearch.length < 3) { setCityResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=de&q=${encodeURIComponent(citySearch)}`, { headers: { "User-Agent": "StreetKingApp/1.0" } });
        const data = await res.json(); setCityResults(Array.isArray(data) ? data : []);
      } catch (e) { setCityResults([]); }
    }, 500); return () => clearTimeout(t);
  }, [citySearch]);

  const createRoom = async () => {
    const finalCity = setupData.city || citySearch; if (!finalCity) return alert("Stadt?"); setLoading(true);
    try {
      const code = Math.random().toString(36).substring(2, 7).toUpperCase();
      // Zufällige Missionen
      const shuffled = [...MASTER_MISSIONS].sort(() => 0.5 - Math.random());
      const selectedMissions = shuffled.slice(0, 5);

      const { data: nr, error } = await supabase.from('rooms').insert([{
        room_code: code,
        city: finalCity,
        target_players: setupData.players,
        host_name: session.username,
        active_missions: selectedMissions
      }]).select().single();

      if (error) throw error;
      await supabase.from('room_members').insert([{ room_id: nr.id, username: session.username, is_host: true }]);
      setRoom(nr); setView('lobby');
    } catch (e) { alert(e.message); setView('menu'); } finally { setLoading(false); }
  };

  const joinRoom = async () => {
    setLoading(true); try {
      const { data: tr } = await supabase.from('rooms').select('*').eq('room_code', roomCodeInput.toUpperCase()).single();
      if (!tr) throw new Error("Code falsch"); await supabase.from('room_members').insert([{ room_id: tr.id, username: session.username }]);
      setRoom(tr); setView('lobby');
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const handleCapture = async (e) => {
    const file = e.target.files[0]; if (!file || !activeMission) return; if (!net) return alert("KI lädt..."); setLoading(true);
    const reader = new FileReader(); reader.onload = async (evt) => {
      const img = document.createElement('img'); img.src = evt.target.result;
      img.onload = async () => {
        try {
          const preds = await net.detect(img);
          const found = preds.find(p => activeMission.keywords.some(k => p.class.toLowerCase() === k.toLowerCase()) && p.score > 0.4);
          if (found) { setCompletedIds(p => [...p, activeMission.id]); setCurrentScore(s => s + activeMission.points); alert(`✅ ${activeMission.name} erkannt!`); }
          else { alert(`❌ Nicht erkannt. (KI: ${preds.map(p => p.class).join(', ') || 'nichts'})`); }
        } catch (err) { alert("Fehler"); } setLoading(false); setActiveMission(null);
      };
    }; reader.readAsDataURL(file);
  };

  const handleMapSearch = async (e) => { e.preventDefault(); if (!mapSearch) return; try { const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mapSearch)}`, { headers: { "User-Agent": "StreetKingApp/1.0" } }); const data = await res.json(); if (data.length > 0) { const c = data[0]; setMapCenter([parseFloat(c.lat), parseFloat(c.lon)]); const { data: s } = await supabase.from('city_leaderboard').select('*').ilike('city', c.display_name.split(',')[0]).order('score', { ascending: false }); setActiveCityRank({ name: c.display_name.split(',')[0], scores: s || [] }); } } catch (e) { } };


  // --- VIEWS ---

  if (!session) return (
    <div className="min-h-screen bg-[#05070a] text-white p-8 flex flex-col justify-center items-center font-sans">
      <h1 className="text-4xl font-black text-yellow-500 italic mb-10 tracking-tighter uppercase">Street King</h1>
      <div className="w-full max-w-sm bg-slate-900 p-8 rounded-[3rem] border border-white/5 shadow-2xl">
        <input type="text" placeholder="NAME" onChange={e => setAuthData({ ...authData, user: e.target.value })} className="w-full bg-slate-800 p-4 rounded-2xl mb-4 font-bold outline-none" />
        <input type="password" placeholder="PASSWORT" onChange={e => setAuthData({ ...authData, pass: e.target.value })} className="w-full bg-slate-800 p-4 rounded-2xl mb-6 font-bold outline-none" />
        <div className="flex gap-2">
          <button onClick={() => handleAuth('login')} className="flex-1 bg-yellow-500 text-black font-black py-4 rounded-2xl uppercase shadow-lg">Login</button>
          <button onClick={() => handleAuth('register')} className="flex-1 border border-yellow-500 text-yellow-500 font-black py-4 rounded-2xl uppercase">Reg.</button>
        </div>
      </div>
    </div>
  );

  if (view === 'menu') return (
    <div className="min-h-screen bg-[#05070a] text-white p-8 flex flex-col justify-center gap-4 relative font-sans">
      <button onClick={() => { localStorage.clear(); setSession(null); }} className="absolute top-8 right-8 text-red-500 font-bold text-[10px] uppercase flex items-center gap-1"><LogOut size={12} /> Logout</button>
      <div className="text-center mb-10"><h1 className="text-5xl font-black text-yellow-500 italic uppercase">STREET KING</h1>{modelLoading && <p className="text-xs text-yellow-500 animate-pulse mt-2">⚡ Lade KI...</p>}</div>
      <button onClick={() => setView('setup')} className="w-full bg-yellow-500 text-black font-black py-6 rounded-[2.5rem] text-2xl shadow-xl uppercase italic" disabled={modelLoading}>SQUAD HOSTEN</button>
      <div className="flex gap-4">
        <input type="text" placeholder="CODE" onChange={e => setRoomCodeInput(e.target.value)} className="flex-1 bg-slate-900 p-4 rounded-2xl border border-white/5 uppercase font-bold text-center outline-none" />
        <button onClick={joinRoom} className="bg-white/5 border border-white/10 px-6 rounded-2xl font-black italic uppercase" disabled={modelLoading}>JOIN</button>
      </div>
      <button onClick={() => { setView('map'); setMapCenter([51.513, 7.465]); }} className="flex items-center justify-center gap-2 text-yellow-500 font-bold text-xs uppercase tracking-widest mt-10 py-4 border-t border-white/5"><MapIcon size={16} /> Weltkarte</button>
    </div>
  );

  if (view === 'setup') return (
    <div className="min-h-screen bg-[#05070a] text-white p-8 font-sans">
      <div className="flex justify-between items-center mb-10 text-yellow-500"><h2 className="text-3xl font-black italic uppercase">Squad Setup</h2><button onClick={() => setView('menu')}><X size={28} /></button></div>
      <div className="space-y-8">
        <div className="relative">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Stadt suchen</p>
          <input type="text" placeholder="Name..." value={citySearch} onChange={e => setCitySearch(e.target.value)} className="w-full bg-slate-900 p-5 rounded-2xl border border-white/5 font-bold outline-none" />
          {cityResults.length > 0 && <div className="absolute top-full bg-slate-900 mt-2 rounded-2xl border border-white/10 z-50 max-h-60 overflow-y-auto shadow-2xl">{cityResults.map((r, i) => (<div key={i} onClick={() => { setSetupData({ ...setupData, city: r.display_name.split(',')[0] }); setCityResults([]); setCitySearch(r.display_name.split(',')[0]) }} className="p-4 hover:bg-yellow-500 hover:text-black font-bold border-b border-white/5 cursor-pointer uppercase text-xs">{r.display_name}</div>))}</div>}
        </div>
        <div><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Spieleranzahl</p><input type="number" value={setupData.players || ''} onChange={e => setSetupData({ ...setupData, players: parseInt(e.target.value) || '' })} className="w-full bg-slate-900 p-5 rounded-2xl border border-white/5 font-black text-4xl outline-none" /></div>
        <button onClick={createRoom} className="w-full bg-yellow-500 text-black font-black py-5 rounded-[2.5rem] text-2xl uppercase italic shadow-xl">RAUM ERÖFFNEN</button>
      </div>
    </div>
  );

  if (view === 'lobby') {
    if (!room) return <div className="h-screen w-screen bg-black flex items-center justify-center"><Loader2 className="animate-spin text-yellow-500" /></div>;
    return (
      <div className="min-h-screen bg-[#05070a] text-white p-8 flex flex-col font-sans">
        <div className="flex justify-between items-start mb-10"><div><h2 className="text-3xl font-black italic text-yellow-500 uppercase">{room.city}</h2><div className="mt-2 bg-slate-900 px-4 py-1 rounded-lg border border-white/5 text-[10px] font-bold inline-block uppercase">CODE: {room.room_code}</div></div>
          {room.host_name === session.username ? (
            <button onClick={handleCloseRoomComplete} className="bg-red-500 text-white p-4 rounded-2xl shadow-lg active:scale-90"><Trash2 size={24} /></button>
          ) : (
            <button onClick={handleCloseRoomComplete} className="bg-slate-800 text-slate-400 p-4 rounded-2xl border border-white/5"><LogOut size={24} /></button>
          )}
        </div>
        <div className="flex-1 space-y-4">
          <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest flex items-center gap-2 italic"><Users size={12} /> Squad ({members.length} / {room.target_players})</p>
          {members.map((m, i) => (<div key={i} className="flex justify-between items-center bg-white/5 p-5 rounded-3xl border border-white/5 shadow-sm"><span className="font-bold italic">{m.is_host ? "👑 " : ""}{m.username}</span></div>))}
        </div>
        {room.host_name === session.username ? (
          <button onClick={handleStartBattle} className="w-full bg-yellow-500 text-black font-black py-6 rounded-[2.5rem] text-2xl uppercase italic shadow-2xl mt-6 animate-pulse">BATTLE STARTEN</button>
        ) : (
          <div className="text-center p-6 border border-white/5 rounded-3xl animate-pulse italic text-[10px] font-bold uppercase tracking-widest text-yellow-500">Warten auf Host...</div>
        )}
      </div>
    );
  }

  if (view === 'scoreboard') return (
    <div className="min-h-screen bg-[#05070a] text-white p-8 flex flex-col font-sans relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-yellow-500/20 via-black to-black z-0 pointer-events-none"></div>
      <div className="relative z-10 text-center mb-8">
        <Trophy size={64} className="text-yellow-500 mx-auto mb-4 animate-bounce" />
        <h1 className="text-4xl font-black italic uppercase text-white tracking-tighter">Ergebnisse</h1>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2">{room.city} Squad</p>
      </div>
      <div className="flex-1 space-y-4 z-10 overflow-y-auto">
        {members.sort((a, b) => b.score - a.score).map((m, i) => (
          <div key={i} className={`flex justify-between items-center p-6 rounded-3xl border ${i === 0 ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-white/5 border-white/5 text-white'}`}>
            <div className="flex items-center gap-4"><span className="font-black text-xl italic">{i + 1}.</span><div className="flex flex-col"><span className="font-black text-lg uppercase italic flex items-center gap-2">{m.username}{i === 0 && <Crown size={16} />}</span>{m.is_finished ? <span className="text-[10px] font-bold uppercase opacity-60">Punkte: {m.score}</span> : <span className="text-[10px] font-bold uppercase opacity-60 animate-pulse">Spielt noch...</span>}</div></div>
            <span className="font-black text-2xl tabular-nums">{m.score}</span>
          </div>
        ))}
      </div>
      <button onClick={handleCloseRoomComplete} className="w-full bg-white/10 border border-white/20 text-white font-black py-6 rounded-[2.5rem] text-xl uppercase italic mt-6 active:scale-95 transition-all z-10">{room.host_name === session.username ? "Raum auflösen & Archivieren" : "Zurück zum Menü"}</button>
    </div>
  );

  if (view === 'game') {
    if (hasFinishedLocal) {
      return (
        <div className="min-h-screen bg-[#05070a] text-white flex flex-col items-center justify-center p-8 text-center font-sans">
          <Loader2 className="animate-spin text-yellow-500 mb-6" size={64} />
          <h2 className="text-3xl font-black italic uppercase mb-2">Warten auf Squad...</h2>
          <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Deine Punkte ({currentScore}) sind sicher.</p>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-[#05070a] text-white p-6 flex flex-col font-sans">
        <header className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black italic text-yellow-500 uppercase">{room.city}</h2>
          <div className="text-right leading-none"><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Punkte</p><p className="text-3xl font-black tabular-nums">{currentScore}</p></div>
        </header>
        <div className="space-y-4 flex-1 overflow-y-auto mb-4">
          {(room.active_missions || []).map((m) => {
            const isDone = completedIds.includes(m.id);
            return (
              <div key={m.id} className={`p-6 rounded-[2rem] border flex items-center justify-between transition-all ${isDone ? 'bg-green-500/10 border-green-500/30' : 'bg-slate-900 border-white/5 shadow-xl'}`}>
                <div className="flex items-center gap-4">
                  {isDone ? <CheckCircle2 className="text-green-500" size={28} /> : <Circle className="text-slate-800" size={28} />}
                  <div><p className={`font-black uppercase italic tracking-tight ${isDone ? 'text-green-500/50 line-through' : 'text-white'}`}>{m.name}</p><p className="text-yellow-500 font-bold text-[10px] tracking-widest">+{m.points} PKT</p></div>
                </div>
                {!isDone && <button onClick={() => { setActiveMission(m); document.getElementById('cam-input').click(); }} className="bg-yellow-500 text-black p-3 rounded-2xl active:scale-90 shadow-lg"><Camera size={20} /></button>}
              </div>
            );
          })}
        </div>
        <button onClick={handleFinishGame} className="w-full border-2 border-red-500/50 text-red-500 bg-red-500/10 font-black py-4 rounded-[2rem] text-lg uppercase italic mb-4 flex items-center justify-center gap-2 active:scale-95 transition-all"><Flag size={20} /> Abgeben & Beenden</button>
        <input type="file" accept="image/*" capture="environment" id="cam-input" className="hidden" onChange={handleCapture} />
        {loading && <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] backdrop-blur-sm"><div className="text-center"><Loader2 className="animate-spin text-yellow-500 mx-auto mb-4" size={48} /><p className="font-black italic uppercase tracking-widest">KI scannt...</p></div></div>}
      </div>
    );
  }

  if (view === 'map') return (
    <div className="h-screen w-screen bg-[#05070a] text-white flex flex-col relative overflow-hidden font-sans">
      <div className="absolute top-4 left-4 right-4 z-[1000] flex gap-2">
        <button onClick={() => setView('menu')} className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl"><ArrowLeft size={20} /></button>
        <form onSubmit={handleMapSearch} className="flex-1 flex gap-2 bg-slate-900/90 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-2xl">
          <input type="text" placeholder="Stadt weltweit suchen..." value={mapSearch} onChange={e => setMapSearch(e.target.value)} className="bg-transparent flex-1 px-3 font-bold outline-none text-sm placeholder:text-slate-600" />
          <button type="submit" className="p-2 bg-yellow-500 text-black rounded-xl"><Search size={18} /></button>
        </form>
      </div>
      <div className="flex-1 z-0"><MapContainer center={mapCenter} zoom={13} className="h-full w-full" zoomControl={false}><TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" /><MapController center={mapCenter} /><Marker position={mapCenter}><Popup>{activeCityRank.name}</Popup></Marker></MapContainer></div>
      <div className="bg-slate-900 max-h-[40vh] overflow-y-auto rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] z-[1000] p-8 border-t border-white/5 relative"><h3 className="font-black text-xs uppercase text-slate-500 tracking-widest mb-6 italic">Leaderboard <span className="text-yellow-500">{activeCityRank.name.toUpperCase()}</span></h3><div className="space-y-3">{activeCityRank.scores.map((s, i) => (<div key={i} className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5"><span className="font-bold text-slate-400">{i + 1}. {s.username}</span><span className="text-yellow-500 font-black">{s.score}</span></div>))}</div></div>
    </div>
  );

  return <div className="h-screen w-screen bg-black flex flex-col items-center justify-center italic font-black uppercase text-yellow-500 tracking-tighter"><Loader2 className="animate-spin mb-4" size={48} /> Lade Sektor...</div>;
}

export default App;