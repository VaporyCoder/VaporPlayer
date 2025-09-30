import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Shuffle,
  ListMusic,
  Upload,
  Music2,
  Trash2,
} from "lucide-react";
import jsmediatags from "jsmediatags";

// --- Utility helpers ---
const fmt = (t) => {
  if (!isFinite(t)) return "0:00";
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  const m = Math.floor((t / 60) % 60).toString();
  const h = Math.floor(t / 3600);
  return h > 0 ? `${h}:${m.padStart(2, "0")}:${s}` : `${m}:${s}`;
};

const readTags = (file) =>
  new Promise((resolve) => {
    try {
      jsmediatags.read(file, {
        onSuccess: ({ tags }) => {
          let pictureUrl: string | null = null;
          if (tags.picture && tags.picture.data && tags.picture.format) {
            const { data, format } = tags.picture;
            const byteArray = new Uint8Array(data);
            const blob = new Blob([byteArray], { type: format });
            pictureUrl = URL.createObjectURL(blob);
          }
          resolve({
            title: tags.title || file.name,
            artist: tags.artist || "Unknown Artist",
            album: tags.album || "",
            pictureUrl,
          });
        },
        onError: () => resolve({ title: file.name, artist: "", album: "", pictureUrl: null }),
      });
    } catch (e) {
      resolve({ title: file.name, artist: "", album: "", pictureUrl: null });
    }
  });

// --- Types ---
/** @typedef {{ id:string, src:string, name:string, size:number, type:string, meta?:{title?:string,artist?:string,album?:string,pictureUrl?:string} }} Track */

export default function MusicPlayerApp() {
  const [tracks, setTracks] = useState/** @type {React.UseState<Track[]>} */([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState/** @type {React.UseState<'off'|'one'|'all'>} */("off");
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef/** @type {React.MutableRefObject<HTMLAudioElement|null>} */(null);
  const inputRef = useRef/** @type {React.MutableRefObject<HTMLInputElement|null>} */(null);

  const current = tracks[index];

  // Build a randomized order on the fly when shuffle is enabled
  const nextIndex = () => {
    if (repeatMode === "one") return index;
    if (shuffle && tracks.length > 1) {
      let r;
      do {
        r = Math.floor(Math.random() * tracks.length);
      } while (r === index);
      return r;
    }
    if (index + 1 < tracks.length) return index + 1;
    return repeatMode === "all" ? 0 : index;
  };

  const prevIndex = () => {
    if (shuffle && tracks.length > 1) {
      let r;
      do {
        r = Math.floor(Math.random() * tracks.length);
      } while (r === index);
      return r;
    }
    return index > 0 ? index - 1 : (repeatMode === "all" ? tracks.length - 1 : 0);
  };

  // Audio element event wiring
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setProgress(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration || 0);
    const onEnd = () => {
      const next = nextIndex();
      if (next === index && repeatMode === "off") {
        setPlaying(false);
      } else {
        setIndex(next);
        setPlaying(true);
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnd);
    };
  }, [index, repeatMode, tracks.length]);

  // Autoplay when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (current) {
      if (playing) audio.play().catch(() => {});
      else audio.pause();
    }
  }, [current, playing]);

  // Media Session (system media keys)
  useEffect(() => {
    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession as any;
      const meta = current?.meta || {};
      ms.metadata = new window.MediaMetadata({
        title: meta.title || current?.name || "Untitled",
        artist: meta.artist || "",
        album: meta.album || "",
        artwork: meta.pictureUrl ? [{ src: meta.pictureUrl, sizes: "512x512", type: "image/png" }] : [],
      });
      ms.setActionHandler("play", () => setPlaying(true));
      ms.setActionHandler("pause", () => setPlaying(false));
      ms.setActionHandler("previoustrack", () => setIndex(prevIndex()));
      ms.setActionHandler("nexttrack", () => setIndex(nextIndex()));
      ms.setActionHandler("seekto", (d) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = Math.min(Math.max(0, d.seekTime || 0), duration || 0);
      });
    }
  }, [current, duration]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return; // don’t steal typing
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key.toLowerCase() === "n") setIndex(nextIndex());
      if (e.key.toLowerCase() === "p") setIndex(prevIndex());
      if (e.key === "ArrowRight") {
        const a = audioRef.current; if (a) a.currentTime = Math.min((a.currentTime || 0) + 5, duration);
      }
      if (e.key === "ArrowLeft") {
        const a = audioRef.current; if (a) a.currentTime = Math.max((a.currentTime || 0) - 5, 0);
      }
      if (e.key === "+") setVolume((v) => Math.min(1, v + 0.05));
      if (e.key === "-") setVolume((v) => Math.max(0, v - 0.05));
      if (e.key.toLowerCase() === "s") setShuffle((s) => !s);
      if (e.key.toLowerCase() === "r") setRepeatMode((m) => (m === "off" ? "one" : m === "one" ? "all" : "off"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duration, nextIndex]);

  // Add files (from input or drag-drop)
  const addFiles = async (files) => {
    const toAdd = [];
    for (const file of files) {
      if (!file.type.startsWith("audio")) continue;
      const src = URL.createObjectURL(file);
      const meta = await readTags(file);
      toAdd.push({
        id: crypto.randomUUID(),
        src,
        name: file.name,
        size: file.size,
        type: file.type,
        meta,
      });
    }
    if (toAdd.length) setTracks((prev) => [...prev, ...toAdd]);
  };

  const onDrop = async (e) => {
    e.preventDefault();
    await addFiles(e.dataTransfer.files);
  };

  const onPick = async (e) => {
    await addFiles(e.target.files);
    // reset input to allow re-adding same file
    e.target.value = "";
  };

  const removeTrack = (id) => {
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (idx === index) {
        // if removing current track, move sensibly
        const newIndex = Math.min(idx, next.length - 1);
        setIndex(Math.max(0, newIndex));
        setPlaying(false);
      } else if (idx < index) {
        setIndex(Math.max(0, index - 1));
      }
      return next;
    });
  };

  const clearAll = () => {
    setTracks([]);
    setIndex(0);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  };

  const setCurrentTime = (val) => {
    const audio = audioRef.current; if (!audio) return;
    audio.currentTime = val;
    setProgress(val);
  };

  // UI helpers
  const repeatLabel = repeatMode === "off" ? "Repeat Off" : repeatMode === "one" ? "Repeat One" : "Repeat All";

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-zinc-100">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 grid place-items-center rounded-2xl bg-zinc-800/70 shadow-md">
              <Music2 className="h-5 w-5" />
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Local Music Player</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 bg-zinc-800 hover:bg-zinc-700 transition shadow-sm"
              title="Add audio files"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Add Files</span>
              <input ref={inputRef} type="file" accept="audio/*" multiple onChange={onPick} className="hidden" />
            </button>
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 bg-zinc-900 hover:bg-zinc-800 transition border border-zinc-700/60"
              title="Clear playlist"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </header>

        {/* Drop zone */}
        <motion.div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-3xl border border-dashed border-zinc-700/60 bg-zinc-900/60 p-6 md:p-8"
        >
          <p className="text-sm text-zinc-300">
            Drag & drop audio files here, or use <span className="font-medium text-zinc-100">Add Files</span>.
            Files stay private in your browser.
          </p>
          {/* Playlist + Now Playing */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Now Playing card */}
            <div className="lg:col-span-1">
              <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-4 md:p-5 shadow-md">
                <div className="flex gap-4">
                  <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-zinc-800 grid place-items-center">
                    {current?.meta?.pictureUrl ? (
                      <img src={current.meta.pictureUrl} alt="Cover" className="h-full w-full object-cover" />
                    ) : (
                      <Music2 className="h-8 w-8 opacity-60" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{current?.meta?.title || current?.name || "No track selected"}</div>
                    <div className="truncate text-sm text-zinc-400">{current?.meta?.artist || (current ? "Unknown Artist" : "—")}</div>
                    <div className="mt-2 text-xs text-zinc-500 line-clamp-2">{current?.name}</div>
                  </div>
                </div>

                {/* Seekbar */}
                <div className="mt-4">
                  <input
                    type="range" min={0} max={Math.max(1, duration)} step={0.1}
                    value={seeking ? undefined : progress}
                    onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                    className="w-full accent-zinc-200"
                  />
                  <div className="mt-1 flex justify-between text-xs text-zinc-400">
                    <span>{fmt(progress)}</span>
                    <span>{fmt(duration)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setIndex(prevIndex())}
                    className="h-10 w-10 rounded-full grid place-items-center bg-zinc-800 hover:bg-zinc-700"
                    title="Previous"
                  >
                    <SkipBack className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    className="h-12 w-12 rounded-full grid place-items-center bg-zinc-100 text-zinc-900 hover:bg-white"
                    title={playing ? "Pause" : "Play"}
                  >
                    {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                  </button>
                  <button
                    onClick={() => setIndex(nextIndex())}
                    className="h-10 w-10 rounded-full grid place-items-center bg-zinc-800 hover:bg-zinc-700"
                    title="Next"
                  >
                    <SkipForward className="h-5 w-5" />
                  </button>

                  <div className="ml-auto flex items-center gap-3">
                    <button
                      onClick={() => setShuffle((s) => !s)}
                      className={`h-10 w-10 rounded-full grid place-items-center ${shuffle ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 hover:bg-zinc-700"}`}
                      title={shuffle ? "Shuffle On" : "Shuffle Off"}
                    >
                      <Shuffle className="h-5 w-5" />
                    </button>

                    <button
                      onClick={() => setRepeatMode((m) => (m === "off" ? "one" : m === "one" ? "all" : "off"))}
                      className={`h-10 w-10 rounded-full grid place-items-center ${repeatMode !== "off" ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 hover:bg-zinc-700"}`}
                      title={repeatLabel}
                    >
                      <Repeat className="h-5 w-5" />
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMuted((m) => !m)}
                        className="h-10 w-10 rounded-full grid place-items-center bg-zinc-800 hover:bg-zinc-700"
                        title={muted ? "Unmute" : "Mute"}
                      >
                        {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={muted ? 0 : volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-28 accent-zinc-200"
                        title={`Volume ${Math.round((muted ? 0 : volume) * 100)}%`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Playlist */}
            <div className="lg:col-span-2">
              <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-md overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <ListMusic className="h-4 w-4" />
                    <span className="text-sm font-medium">Playlist ({tracks.length})</span>
                  </div>
                  <span className="text-xs text-zinc-400 hidden sm:inline">Tip: Space to play/pause, N/P for next/prev, S shuffle, R repeat</span>
                </div>

                {tracks.length === 0 ? (
                  <div className="p-8 text-sm text-zinc-400">
                    Your queue is empty. Drop audio files here or click <span className="text-zinc-200">Add Files</span>.
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-800/70 max-h-[48vh] overflow-auto">
                    {tracks.map((t, i) => (
                      <li key={t.id} className={`group grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 ${i === index ? "bg-zinc-800/40" : "hover:bg-zinc-800/20"}`}>
                        <button
                          onClick={() => { setIndex(i); setPlaying(true); }}
                          className="h-12 w-12 shrink-0 rounded-xl bg-zinc-800 grid place-items-center overflow-hidden"
                          title="Play this track"
                        >
                          {t.meta?.pictureUrl ? (
                            <img src={t.meta.pictureUrl} alt="Cover" className="h-full w-full object-cover" />
                          ) : (
                            <Music2 className="h-5 w-5 opacity-60" />
                          )}
                        </button>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{t.meta?.title || t.name}</div>
                          <div className="truncate text-xs text-zinc-400">{t.meta?.artist || "Unknown Artist"}</div>
                        </div>
                        <div className="text-xs text-zinc-400 tabular-nums mr-4 hidden sm:block">{(t.size / (1024 * 1024)).toFixed(1)} MB</div>
                        <button
                          onClick={() => removeTrack(t.id)}
                          className="opacity-0 group-hover:opacity-100 transition text-zinc-400 hover:text-zinc-100"
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={current?.src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        autoPlay={playing}
        muted={muted}
      />
    </div>
  );
}
