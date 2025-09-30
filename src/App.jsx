import { Buffer } from "buffer";
window.Buffer = Buffer;
import React, { useEffect, useRef, useState } from "react";
import ColorThief from "colorthief";
import { motion, AnimatePresence } from "framer-motion";
import { parseBlob } from "music-metadata-browser";
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

// --- Utility helpers ---
const fmt = (t) => {
  if (!isFinite(t)) return "0:00";
  const s = Math.floor(t % 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((t / 60) % 60).toString();
  const h = Math.floor(t / 3600);
  return h > 0 ? `${h}:${m.padStart(2, "0")}:${s}` : `${m}:${s}`;
};

const readTags = (file) =>
  new Promise((resolve) => {
    try {
      window.jsmediatags.read(file, {
        onSuccess: ({ tags }) => {
          let pictureUrl = null;
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
        onError: () =>
          resolve({
            title: file.name,
            artist: "",
            album: "",
            pictureUrl: null,
          }),
      });
    } catch (e) {
      resolve({ title: file.name, artist: "", album: "", pictureUrl: null });
    }
  });

export default function MusicPlayerApp() {
  const [tracks, setTracks] = useState([]);
  const [library, setLibrary] = useState({});
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off");
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bgColor, setBgColor] = useState("#0a0f29");

  useEffect(() => {
  fetch("/api/library")
    .then((res) => res.json())
    .then(setTracks)
    .catch((err) => console.error("Library fetch failed", err));
}, []);

  const audioRef = useRef(null);
  const inputRef = useRef(null);

  const current = tracks[index];

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
    return index > 0 ? index - 1 : repeatMode === "all" ? tracks.length - 1 : 0;
  };

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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (current) {
      if (playing) audio.play().catch(() => {});
      else audio.pause();
    }
  }, [current, playing]);

  useEffect(() => {
    if (current?.meta?.pictureUrl) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = current.meta.pictureUrl;

      img.onload = () => {
        const colorThief = new ColorThief();
        try {
          const [r, g, b] = colorThief.getColor(img);
          setBgColor(`rgb(${r}, ${g}, ${b})`);
        } catch (e) {
          console.warn("Color extraction failed", e);
        }
      };
    }
  }, [current]);

  const addFiles = async (files) => {
    const toAdd = [];
    const newLib = {};

    for (const file of files) {
      if (!file.type.startsWith("audio")) continue;

      const src = URL.createObjectURL(file);
      const meta = await readTags(file);

      let quality = "";
      try {
        const metadata = await parseBlob(file);
        const format = metadata.format;
        const ext = file.name.split(".").pop().toLowerCase();

        if (ext === "flac") quality = "FLAC";
        else if (ext === "wav") quality = "WAV";
        else if (ext === "mp3") quality = "MP3";
        else if (ext === "aac") quality = "AAC";

        const bits = format.bitsPerSample || 16;
        const sr = format.sampleRate || 44100;
        const srLabel = sr >= 1000 ? `${Math.round(sr / 1000)}kHz` : `${sr}Hz`;

        if (bits >= 24 || sr > 48000) {
          quality = `Hi-Res • ${bits}/${srLabel}`;
        } else {
          quality = `${quality} • ${bits}/${srLabel}`;
        }
      } catch (err) {
        console.warn("Metadata parse failed:", err);
      }
      if (!quality) {
        quality = "Unknown";
      }

      const track = {
        id: crypto.randomUUID(),
        src,
        name: file.name,
        size: file.size,
        type: file.type,
        meta,
        quality,
      };
      toAdd.push(track);

      if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split("/");
        const artist = parts[1] || "Unknown Artist";
        const album = parts[2] || "Unknown Album";

        if (!newLib[artist]) newLib[artist] = {};
        if (!newLib[artist][album]) newLib[artist][album] = [];
        newLib[artist][album].push(track);
      }
    }

    if (toAdd.length) {
      setTracks((prev) => [...prev, ...toAdd]);

      setLibrary((prev) => {
        const merged = { ...prev };
        Object.keys(newLib).forEach((artist) => {
          if (!merged[artist]) merged[artist] = {};
          Object.keys(newLib[artist]).forEach((album) => {
            if (!merged[artist][album]) merged[artist][album] = [];
            merged[artist][album] = [
              ...merged[artist][album],
              ...newLib[artist][album],
            ];
          });
        });
        return merged;
      });
    }
  };

  const onDrop = async (e) => {
    e.preventDefault();
    await addFiles(e.dataTransfer.files);
  };

  const onPick = async (e) => {
    await addFiles(e.target.files);
    e.target.value = "";
  };

  const removeTrack = (id) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const clearAll = () => {
    setTracks([]);
    setLibrary({});
    setIndex(0);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  };

  const setCurrentTime = (val) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = val;
    setProgress(val);
  };

  const repeatLabel =
    repeatMode === "off"
      ? "Repeat Off"
      : repeatMode === "one"
      ? "Repeat One"
      : "Repeat All";

  return (
    <div
      className="app-container"
      style={{
        background: `radial-gradient(circle at top left, ${bgColor}, #0b0b15 70%)`,
      }}
    >
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">
          <Music2 className="h-6 w-6" /> VaporPlayer
        </h1>
        <div className="header-actions">
          <button onClick={() => inputRef.current?.click()} className="btn">
            <Upload className="h-4 w-4" /> Add Folder
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            multiple
            webkitdirectory="true"
            directory=""
            onChange={onPick}
            className="hidden"
          />
          <button onClick={clearAll} className="btn-secondary">
            <Trash2 className="h-4 w-4" /> Clear
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div
        className="app-main"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {/* Library Sidebar */}
        <div className="library">
          <div className="playlist-header">
            <ListMusic className="h-4 w-4" />
            <span>Library</span>
          </div>
          {Object.keys(library).length === 0 ? (
            <p className="playlist-empty">No library loaded yet.</p>
          ) : (
            <ul>
              {Object.keys(library).map((artist) => (
                <li key={artist}>
                  <div className="library-artist">{artist}</div>
                  <ul>
                    {Object.keys(library[artist]).map((album) => (
                      <li key={album}>
                        <div className="library-album">{album}</div>
                        <ul>
                          {library[artist][album].map((track) => (
                            <li
                              key={track.id}
                              className="library-track"
                              onClick={() => {
                                const i = tracks.findIndex(
                                  (t) => t.id === track.id
                                );
                                if (i >= 0) {
                                  setIndex(i);
                                  setPlaying(true);
                                }
                              }}
                            >
                              {track.meta?.title || track.name}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Playlist */}
        <div className="playlist">
          <div className="playlist-header">
            <ListMusic className="h-4 w-4" />
            <span>Playlist ({tracks.length})</span>
          </div>
          {tracks.length === 0 ? (
            <p className="playlist-empty">
              Drop audio files here or use Add Folder.
            </p>
          ) : (
            <ul>
              {tracks.map((t, i) => (
                <li
                  key={t.id}
                  className={`playlist-item ${i === index ? "active" : ""}`}
                  onClick={() => {
                    setIndex(i);
                    setPlaying(true);
                  }}
                >
                  <div className="playlist-thumb">
                    {t.meta?.pictureUrl ? (
                      <img src={t.meta.pictureUrl} alt="cover" />
                    ) : (
                      <Music2 className="h-5 w-5 opacity-60" />
                    )}
                  </div>
                  <div className="playlist-info">
                    <div className="playlist-title">
                      {t.meta?.title || t.name}
                    </div>
                    <div className="playlist-artist">
                      {t.meta?.artist || "Unknown Artist"}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTrack(t.id);
                    }}
                    className="btn-icon"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Now Playing */}
        <div className="now-playing">
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={current.id}
                className="now-playing-inner"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
              >
                <motion.div
                  key={current?.id}
                  className="now-playing-cover"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                >
                  {current?.meta?.pictureUrl ? (
                    <img src={current.meta.pictureUrl} alt="cover" />
                  ) : (
                    <Music2 className="h-10 w-10 opacity-60" />
                  )}
                </motion.div>
                <motion.div
                  key={current?.id + "-info"}
                  className="now-playing-info"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className="now-playing-title">
                    {current?.meta?.title || current?.name}
                  </div>
                  <div className="now-playing-artist">
                    {current?.meta?.artist || "Unknown Artist"}
                  </div>
                  {current?.meta?.album && (
                    <div className="now-playing-album">
                      {current.meta.album}
                    </div>
                  )}
                  {current?.quality && (
                    <span
                      className={`quality-badge ${
                        current.quality.toLowerCase().includes("hi-res")
                          ? "hires"
                          : ""
                      }`}
                    >
                      {current.quality}
                    </span>
                  )}
                </motion.div>

                {/* Seekbar */}
                <div className="seekbar">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, duration)}
                    step={0.1}
                    value={progress}
                    onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                    style={{ "--progress": `${(progress / duration) * 100}%` }}
                  />
                  <div className="seekbar-times">
                    <span>{fmt(progress)}</span>
                    <span>{fmt(duration)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="controls">
                  <button
                    onClick={() => setShuffle((s) => !s)}
                    title="Shuffle"
                    className="btn-icon"
                  >
                    <Shuffle className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setIndex(prevIndex())}
                    className="control-btn"
                  >
                    <SkipBack className="h-5 w-5" />
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    animate={{ scale: playing ? 1.1 : 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    onClick={() => setPlaying((p) => !p)}
                    className="control-btn primary"
                  >
                    {playing ? (
                      <Pause className="h-6 w-6" />
                    ) : (
                      <Play className="h-6 w-6" />
                    )}
                  </motion.button>
                  <button
                    onClick={() => setIndex(nextIndex())}
                    className="control-btn"
                  >
                    <SkipForward className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() =>
                      setRepeatMode((m) =>
                        m === "off" ? "one" : m === "one" ? "all" : "off"
                      )
                    }
                    className="btn-icon"
                    title={repeatLabel}
                  >
                    <Repeat className="h-5 w-5" />
                  </button>
                </div>

                {/* Volume */}
                <div className="volume">
                  <button
                    onClick={() => setMuted((m) => !m)}
                    className="btn-icon"
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="volume-slider"
                    style={{ "--vol": `${(muted ? 0 : volume) * 100}%` }}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                className="now-playing-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                No track selected
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <audio
  ref={audioRef}
  src={tracks[index] ? `http://localhost:5174/api/stream/${tracks[index].id}` : ""}
  controls
/>
    </div>
  );
}
