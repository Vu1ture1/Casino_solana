// src/audioContext.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

const AudioContext = createContext(null);

export function useAudio() {
  return useContext(AudioContext);
}


export function AudioProvider({ children }) {
  const audioRef = useRef(null);
  const trackIdxRef = useRef(0);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  const tracks = [
    "/audio/tsoi_dodep.mp3",
    "/audio/Queen.mp3",
    "/audio/Tsoi_2.mp3" 
  ];

  useEffect(() => {
    const el = document.getElementById("bg-audio");
    if (!el) {
      console.warn("Audio element #bg-audio not found");
      return;
    }
    audioRef.current = el;

    const savedIdx = Number(localStorage.getItem("audio_trackIndex") || 0);
    const savedMuted = localStorage.getItem("audio_muted") === "true";
    const savedTime = Number(localStorage.getItem("audio_currentTime") || 0);
    const savedPlaying = localStorage.getItem("audio_playing") === "true";

    const idx = Math.min(Math.max(savedIdx, 0), tracks.length - 1);
    trackIdxRef.current = idx;
    setTrackIndex(idx);
    setMuted(savedMuted);

    el.src = tracks[idx];
    el.currentTime = savedTime || 0;
    el.muted = savedMuted;
    el.load();


    const onEnded = async () => {
      const next = (trackIdxRef.current + 1) % tracks.length;
      trackIdxRef.current = next;
      setTrackIndex(next);
      localStorage.setItem("audio_trackIndex", String(next));
      el.src = tracks[next];
      el.load();
      try {
        await el.play();
        setPlaying(true);
        localStorage.setItem("audio_playing", "true");
      } catch (_) {
        setPlaying(false);
        localStorage.setItem("audio_playing", "false");
      }
    };
    el.addEventListener("ended", onEnded);

    (async () => {
      if (savedPlaying) {
        try {
          await el.play();
          setPlaying(true);
        } catch (_) {
          setPlaying(false);
        }
      }
    })();

    const saveInterval = setInterval(() => {
      try {
        localStorage.setItem("audio_currentTime", String(el.currentTime || 0));
      } catch {}
    }, 2000);
    const onBeforeUnload = () => {
      try {
        localStorage.setItem("audio_currentTime", String(el.currentTime || 0));
        localStorage.setItem("audio_trackIndex", String(trackIdxRef.current));
        localStorage.setItem("audio_muted", String(el.muted));
        localStorage.setItem("audio_playing", String(!el.paused));
      } catch {}
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      clearInterval(saveInterval);
      el.removeEventListener("ended", onEnded);
      window.removeEventListener("beforeunload", onBeforeUnload);
      try {
        localStorage.setItem("audio_currentTime", String(el.currentTime || 0));
        localStorage.setItem("audio_trackIndex", String(trackIdxRef.current));
        localStorage.setItem("audio_muted", String(el.muted));
        localStorage.setItem("audio_playing", String(!el.paused));
      } catch {}
    };
  }, []);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      try {
        await el.play();
        setPlaying(true);
        localStorage.setItem("audio_playing", "true");
      } catch (e) {
        console.warn("play() rejected:", e);
        setPlaying(false);
      }
    } else {
      el.pause();
      setPlaying(false);
      localStorage.setItem("audio_playing", "false");
    }
  };

  const toggleMute = () => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    localStorage.setItem("audio_muted", String(el.muted));
  };

  const nextTrack = async () => {
    const el = audioRef.current;
    if (!el) return;
    const next = (trackIdxRef.current + 1) % tracks.length;
    trackIdxRef.current = next;
    setTrackIndex(next);
    el.src = tracks[next];
    el.load();
    try { await el.play(); setPlaying(true); localStorage.setItem("audio_playing", "true"); } catch { setPlaying(false); }
    localStorage.setItem("audio_trackIndex", String(next));
  };

  const prevTrack = async () => {
    const el = audioRef.current;
    if (!el) return;
    const prev = (trackIdxRef.current - 1 + tracks.length) % tracks.length;
    trackIdxRef.current = prev;
    setTrackIndex(prev);
    el.src = tracks[prev];
    el.load();
    try { await el.play(); setPlaying(true); localStorage.setItem("audio_playing", "true"); } catch { setPlaying(false); }
    localStorage.setItem("audio_trackIndex", String(prev));
  };

  const value = {
    playing,
    muted,
    trackIndex,
    tracks,
    togglePlay,
    toggleMute,
    nextTrack,
    prevTrack,
    audioRef,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}
