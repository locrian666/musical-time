import dgram from "dgram";
import { WebSocketServer } from "ws";

const PORT = 8080;
const OSC_HOST = "127.0.0.1";
const OSC_PORT = 8000;
const CROSSFADE_SECONDS = 2;

const oscClient = dgram.createSocket("udp4");

const SECTION_ORDER = [
  "introduction",
  "baroque",
  "classical",
  "romantic",
  "modern-electronic",
  "contemporary-ai",
];

const SECTION_DURATION = {
  introduction: 128,
  baroque: 120,
  classical: 218,
  romantic: 258,
  "modern-electronic": 330,
  "contemporary-ai": 130,
};

/** Track names in yanshi.rp, in mixer order (REAPER track 1–6). */
const TRACKS_BY_SECTION = {
  introduction: ["Intro"],
  baroque: ["Baroque"],
  classical: ["Classic"],
  romantic: ["Romantic"],
  "modern-electronic": ["Electric"],
  "contemporary-ai": ["AI"],
};

const TRACK_INDEX_BY_SECTION = {
  introduction: 1,
  baroque: 2,
  classical: 3,
  romantic: 4,
  "modern-electronic": 5,
  "contemporary-ai": 6,
};

const TRACK_COUNT = 6;

const server = new WebSocketServer({ port: PORT });

/** @typedef {{ section: string, position: number, duration: number, tracks: string[], progressTimer: ReturnType<typeof setInterval>, finishTimer: ReturnType<typeof setTimeout>, overlapTimer: ReturnType<typeof setTimeout> | null }} PlaybackLayer */

/** @type {PlaybackLayer | null} */
let primary = null;
/** @type {PlaybackLayer | null} */
let fading = null;

/** @type {Record<string, { position: number, duration: number }>} */
const savedProgress = {};

/** @type {{ section: string, position: number, duration: number, tracks: string[] } | null} */
let parked = null;

function parkSection(section, position, duration, tracks) {
  parked = {
    section,
    position,
    duration,
    tracks: tracks ?? TRACKS_BY_SECTION[section] ?? [],
  };
}

console.log(`Mock bridge running at ws://127.0.0.1:${PORT}`);
console.log("REAPER project yanshi.rp · tracks 1–6: Intro, Baroque, Classic, Romantic, Electric, AI");
console.log("OSC: solo/mute the matching track, then /play. Enable default REAPER OSC on UDP 8000.");

function oscString(value) {
  const withNul = Buffer.from(`${value}\0`, "ascii");
  const pad = (4 - (withNul.length % 4)) % 4;
  return pad ? Buffer.concat([withNul, Buffer.alloc(pad)]) : withNul;
}

function encodeOsc(address, ...args) {
  let typeTag = ",";
  const payloads = [];
  for (const arg of args) {
    if (typeof arg === "number") {
      typeTag += "f";
      const buf = Buffer.alloc(4);
      buf.writeFloatBE(arg);
      payloads.push(buf);
    } else if (typeof arg === "string") {
      typeTag += "s";
      payloads.push(oscString(arg));
    }
  }
  return Buffer.concat([oscString(address), oscString(typeTag), ...payloads]);
}

function formatTimecode(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function sendOsc(address, ...args) {
  const packet = encodeOsc(address, ...args);
  oscClient.send(packet, OSC_PORT, OSC_HOST, (error) => {
    if (error) {
      console.error("OSC send failed:", error.message);
    }
  });
  const quiet =
    address.startsWith("/track/") &&
    (address.includes("/solo") || address.includes("/mute"));
  if (quiet) return;
  const suffix = args.length ? ` ${args.join(" ")}` : "";
  console.log(`BRIDGE → REAPER: ${address}${suffix}`);
}

function isolateAudibleTracks(sections) {
  const audible = new Set();
  for (const section of sections) {
    const index = TRACK_INDEX_BY_SECTION[section];
    if (index) audible.add(index);
  }

  for (let n = 1; n <= TRACK_COUNT; n += 1) {
    const on = audible.has(n);
    sendOsc(`/track/${n}/solo`, on ? 1 : 0);
    sendOsc(`/track/${n}/mute`, on ? 0 : 1);
  }

  if (audible.size === 1) {
    const only = [...audible][0];
    sendOsc(`/track/${only}/solo/exclusive`, 1);
    sendOsc(`/track/${only}/mute`, 0);
  }

  const names = sections
    .map((section) => TRACKS_BY_SECTION[section]?.[0] ?? section)
    .join(" + ");
  console.log(`BRIDGE → REAPER: isolate ${names || "(none)"}`);
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sectionDuration(section) {
  return SECTION_DURATION[section] ?? 120;
}

function nextSection(section) {
  const index = SECTION_ORDER.indexOf(section);
  if (index < 0 || index >= SECTION_ORDER.length - 1) {
    return null;
  }
  return SECTION_ORDER[index + 1];
}

function saveSectionProgress(section, position) {
  if (!section) return;
  const duration = savedProgress[section]?.duration ?? sectionDuration(section);
  savedProgress[section] = {
    position: Math.min(position, duration),
    duration,
  };
  return savedProgress[section];
}

function clearLayerTimers(layer) {
  if (!layer) return;
  clearInterval(layer.progressTimer);
  clearTimeout(layer.finishTimer);
  if (layer.overlapTimer) {
    clearTimeout(layer.overlapTimer);
    layer.overlapTimer = null;
  }
}

function stopLayer(socket, layer, savePosition = true) {
  if (!layer) return;
  clearLayerTimers(layer);
  if (savePosition) {
    const saved = saveSectionProgress(layer.section, layer.position);
    console.log(`Saved timecode ${layer.section}: ${formatTimecode(saved.position)}`);
    send(socket, {
      type: "SECTION_PROGRESS",
      section: layer.section,
      position: saved.position,
      duration: saved.duration,
    });
  }
}

function stopAllPlayback(socket, savePosition = true) {
  if (fading) {
    stopLayer(socket, fading, savePosition);
    fading = null;
  }
  if (primary) {
    stopLayer(socket, primary, savePosition);
    primary = null;
  }
  sendOsc("/pause");
}

function finishLayer(socket, layer) {
  clearLayerTimers(layer);
  const saved = saveSectionProgress(layer.section, layer.duration);

  send(socket, {
    type: "SECTION_PROGRESS",
    section: layer.section,
    position: saved.position,
    duration: saved.duration,
  });

  send(socket, {
    type: "SECTION_FINISHED",
    section: layer.section,
  });

  if (fading === layer) {
    fading = null;
    return;
  }

  if (primary === layer) {
    primary = null;
    send(socket, {
      type: "PLAYBACK_STATUS",
      section: layer.section,
      state: "stopped",
      position: layer.duration,
      duration: layer.duration,
      tracks: layer.tracks,
    });
    if (!fading) {
      sendOsc("/pause");
    }
  }
}

function beginCrossfade(socket, fromSection) {
  if (!primary || primary.section !== fromSection || fading) {
    return;
  }

  const toSection = nextSection(fromSection);
  if (!toSection) {
    return;
  }

  fading = primary;
  if (fading.overlapTimer) {
    clearTimeout(fading.overlapTimer);
    fading.overlapTimer = null;
  }

  console.log(
    `Crossfade ${fromSection} → ${toSection} (${CROSSFADE_SECONDS}s overlap)`,
  );
  send(socket, {
    type: "SECTION_CROSSFADE",
    fromSection,
    toSection,
    overlapSeconds: CROSSFADE_SECONDS,
  });

  primary = startLayer(socket, toSection, 0, TRACKS_BY_SECTION[toSection], [
    fromSection,
    toSection,
  ]);
}

function armLayerTimers(socket, layer) {
  clearLayerTimers(layer);
  const { section, duration, tracks } = layer;

  layer.progressTimer = setInterval(() => {
    if (primary !== layer && fading !== layer) {
      return;
    }
    layer.position += 1;
    saveSectionProgress(section, layer.position);

    if (primary === layer) {
      send(socket, {
        type: "PLAYBACK_STATUS",
        section,
        state: "playing",
        position: layer.position,
        duration,
        tracks,
      });
    } else {
      send(socket, {
        type: "SECTION_PROGRESS",
        section,
        position: layer.position,
        duration,
      });
    }
  }, 1000);

  const remaining = duration - layer.position;
  layer.finishTimer = setTimeout(() => {
    finishLayer(socket, layer);
  }, Math.max(0, remaining) * 1000);

  const upcoming = nextSection(section);
  if (upcoming && remaining > 0) {
    const overlapDelay = Math.max(0, remaining - CROSSFADE_SECONDS);
    layer.overlapTimer = setTimeout(() => {
      beginCrossfade(socket, section);
    }, overlapDelay * 1000);
  }
}

function startLayer(socket, section, startPosition = 0, tracks, audibleSections) {
  const duration = sectionDuration(section);
  const position = Math.max(0, Math.min(startPosition, duration));
  const trackList = tracks ?? TRACKS_BY_SECTION[section] ?? [];
  const audible = audibleSections ?? [section];

  isolateAudibleTracks(audible);
  sendOsc("/time", position);
  setTimeout(() => sendOsc("/play"), 60);
  parked = null;

  send(socket, {
    type: "PLAYBACK_STATUS",
    section,
    state: "playing",
    position,
    duration,
    tracks: trackList,
  });

  /** @type {PlaybackLayer} */
  const layer = {
    section,
    position,
    duration,
    tracks: trackList,
    progressTimer: /** @type {ReturnType<typeof setInterval>} */ (null),
    finishTimer: /** @type {ReturnType<typeof setTimeout>} */ (null),
    overlapTimer: null,
  };

  armLayerTimers(socket, layer);
  return layer;
}

function startPlayback(socket, section, startPosition = 0, tracks) {
  stopAllPlayback(socket, true);
  primary = startLayer(socket, section, startPosition, tracks);
}

function seekSection(socket, section, rawPosition) {
  if (!section) return;
  const duration = savedProgress[section]?.duration ?? sectionDuration(section);
  const position = Math.max(0, Math.min(Number(rawPosition) || 0, duration));
  saveSectionProgress(section, position);
  sendOsc("/time", position);

  if (primary?.section === section) {
    primary.position = position;
    armLayerTimers(socket, primary);
    send(socket, {
      type: "PLAYBACK_STATUS",
      section,
      state: "playing",
      position,
      duration: primary.duration,
      tracks: primary.tracks,
    });
    return;
  }

  send(socket, {
    type: "SECTION_PROGRESS",
    section,
    position,
    duration,
  });

  if (!primary) {
    send(socket, {
      type: "PLAYBACK_STATUS",
      section,
      state: "stopped",
      position,
      duration,
      tracks: TRACKS_BY_SECTION[section] ?? [],
    });
  }
}

function sendAllProgress(socket) {
  send(socket, {
    type: "ALL_PROGRESS",
    progress: { ...savedProgress },
  });
}

function sendStopped(socket) {
  send(socket, {
    type: "PLAYBACK_STATUS",
    section: null,
    state: "stopped",
    position: 0,
    duration: 0,
  });
}

server.on("connection", (socket) => {
  console.log("Frontend connected");

  send(socket, {
    type: "CONNECTION_STATUS",
    connected: true,
  });
  sendAllProgress(socket);

  socket.on("message", (rawData) => {
    try {
      const command = JSON.parse(rawData.toString());

      console.log("Received:", command);

      if (command.type === "PLAY_SECTION") {
        const section = command.section;
        const saved = savedProgress[section]?.position ?? 0;
        const start =
          typeof command.position === "number" ? command.position : saved;
        startPlayback(socket, section, start, command.tracks);
      }

      if (command.type === "PAUSE_SECTION") {
        const section = command.section;
        stopAllPlayback(socket, true);
        const saved = section
          ? savedProgress[section] ?? {
              position: 0,
              duration: sectionDuration(section),
            }
          : { position: 0, duration: 0 };
        send(socket, {
          type: "PLAYBACK_STATUS",
          section: section ?? null,
          state: "stopped",
          position: saved.position,
          duration: saved.duration,
          tracks: section ? TRACKS_BY_SECTION[section] ?? [] : [],
        });
        if (section) {
          parkSection(section, saved.position, saved.duration);
          send(socket, {
            type: "SECTION_PROGRESS",
            section,
            position: saved.position,
            duration: saved.duration,
          });
        }
      }

      if (command.type === "SWITCH_SECTION") {
        const toSection = command.toSection ?? null;
        const autoPlay = command.autoPlay === true;

        stopAllPlayback(socket, true);

        const start =
          typeof command.position === "number"
            ? command.position
            : (toSection ? savedProgress[toSection]?.position ?? 0 : 0);

        if (toSection && autoPlay) {
          startPlayback(socket, toSection, start, command.tracks);
        } else if (toSection) {
          const duration = sectionDuration(toSection);
          saveSectionProgress(toSection, start);
          isolateAudibleTracks([toSection]);
          sendOsc("/time", start);
          sendOsc("/pause");
          parkSection(
            toSection,
            start,
            duration,
            command.tracks ?? TRACKS_BY_SECTION[toSection],
          );
          send(socket, {
            type: "PLAYBACK_STATUS",
            section: toSection,
            state: "stopped",
            position: start,
            duration,
            tracks: command.tracks ?? TRACKS_BY_SECTION[toSection] ?? [],
          });
          sendAllProgress(socket);
        } else {
          sendStopped(socket);
        }
      }

      if (command.type === "SEEK_SECTION") {
        seekSection(socket, command.section, command.position);
      }

      if (command.type === "STOP") {
        stopAllPlayback(socket, true);
        sendStopped(socket);
      }

      if (command.type === "GET_STATUS") {
        const layer = primary ?? fading;
        if (layer) {
          send(socket, {
            type: "PLAYBACK_STATUS",
            section: layer.section,
            state: "playing",
            position: layer.position,
            duration: layer.duration,
            tracks: layer.tracks,
          });
        } else if (parked) {
          send(socket, {
            type: "PLAYBACK_STATUS",
            section: parked.section,
            state: "stopped",
            position: parked.position,
            duration: parked.duration,
            tracks: parked.tracks,
          });
        } else {
          sendStopped(socket);
        }
      }

      if (command.type === "GET_ALL_PROGRESS") {
        sendAllProgress(socket);
      }
    } catch (error) {
      send(socket, {
        type: "ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unknown bridge error",
      });
    }
  });

  socket.on("close", () => {
    console.log("Frontend disconnected");
    stopAllPlayback(socket, true);
  });
});
