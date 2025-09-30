import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = process.env.PORT || 5174;
const MUSIC_DIR = process.env.MUSIC_DIR || "/music";

// Keep a simple in-memory index
let tracks = [];

function indexLibrary(baseDir) {
  tracks = [];
  function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (f.match(/\\.(mp3|flac|wav|aac|ogg)$/i)) {
        tracks.push({
          id: uuidv4(),
          name: f,
          path: fullPath,
          relPath: path.relative(baseDir, fullPath),
        });
      }
    }
  }
  walk(baseDir);
  console.log(`Indexed ${tracks.length} tracks`);
}
indexLibrary(MUSIC_DIR);

app.use(cors());

// API: get library
app.get("/api/library", (req, res) => {
  res.json(tracks);
});

// API: stream track
app.get("/api/stream/:id", (req, res) => {
  const track = tracks.find((t) => t.id === req.params.id);
  if (!track) return res.status(404).send("Not found");

  res.sendFile(track.path);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
