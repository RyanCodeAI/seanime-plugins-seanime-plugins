/// <reference path="./plugin.d.ts" />

// ─────────────────────────────────────────────────────────────────────────────
// Auto English Audio — Seanime Plugin
//
// When an online-streaming episode starts, this plugin inspects the available
// HLS audio tracks and automatically selects an English one.
// If no English track exists it does nothing (Japanese stays active).
//
// How it works
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ 1. video-loaded-metadata  → HLS manifest parsed, audio tracks ready    │
// │    • Scan event payload for audio track list                           │
// │    • If an EN track is found → setAudioTrack(id) + OSD message         │
// │                                                                         │
// │ 2. video-can-play (fallback, ~500 ms later)                            │
// │    • Only runs if step 1 did NOT set a track                           │
// │    • Same scan on a fresh event payload                                │
// │                                                                         │
// │ 3. Tray icon (always visible)                                          │
// │    • Shows the last action taken so you know what happened             │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

// Language codes and label fragments that we treat as "English"
var EN_LANGS  = ["en", "eng", "en-us", "en-gb", "english"];
var EN_LABELS = ["english", "dub", "eng", "dubbed", "en"];

// ─── helpers ────────────────────────────────────────────────────────────────

/** Return true if a language code / label fragment looks like English. */
function isEnglish(lang: string, label: string): boolean {
    var l = lang.toLowerCase().trim();
    var b = label.toLowerCase().trim();

    for (var i = 0; i < EN_LANGS.length; i++) {
        if (l === EN_LANGS[i] || l.indexOf(EN_LANGS[i] + "-") === 0) return true;
    }
    for (var j = 0; j < EN_LABELS.length; j++) {
        if (b === EN_LABELS[j] || b.indexOf(EN_LABELS[j]) !== -1) return true;
    }
    return false;
}

/** Return true if a language code / label fragment looks like Japanese. */
function isJapanese(lang: string, label: string): boolean {
    var l = lang.toLowerCase().trim();
    var b = label.toLowerCase().trim();
    return l === "ja" || l === "jpn" || l === "jp" ||
           b === "japanese" || b === "sub" || b === "subtitled";
}

/**
 * Walk a raw track-list object (from various possible event shapes) and return
 * the first English track descriptor, or null if none found.
 *
 * Handles several possible shapes providers use:
 *   Array<{ id, language, label, lang, name }>
 *   AudioTrackList  (HTMLMediaElement.audioTracks — length + numeric indices)
 *   Record<number, { id, lang, label }>
 */
function findEnglishTrack(tracks: any): { id: number } | null {
    if (!tracks) return null;

    // Convert AudioTrackList / array-like objects into a plain array
    var arr: any[] = [];

    if (Array.isArray(tracks)) {
        arr = tracks;
    } else if (typeof tracks.length === "number") {
        // AudioTrackList style
        for (var i = 0; i < tracks.length; i++) {
            arr.push(tracks[i]);
        }
    } else {
        // keyed object  { "0": {...}, "1": {...} }
        var keys = Object.keys(tracks);
        for (var k = 0; k < keys.length; k++) {
            arr.push(tracks[keys[k]]);
        }
    }

    for (var t = 0; t < arr.length; t++) {
        var track = arr[t];
        if (!track) continue;

        var lang  = String(track.language || track.lang    || track.Language || "");
        var label = String(track.label    || track.Label   || track.name     || track.Name || "");

        if (isEnglish(lang, label)) {
            // Resolve the numeric ID — different providers / hls.js versions use different props
            var id = track.id !== undefined  ? Number(track.id)    :
                     track.index !== undefined ? Number(track.index) : t;
            return { id: id };
        }
    }
    return null;
}

/**
 * Pull the audio-track array out of whatever the VideoCore event payload looks
 * like.  Seanime serialises the event differently depending on player type, so
 * we probe several common shapes.
 */
function extractAudioTracks(event: any): any | null {
    if (!event) return null;

    var candidates = [
        event.audioTracks,
        event.AudioTracks,
        event.detail   && event.detail.audioTracks,
        event.data     && event.data.audioTracks,
        event.payload  && event.payload.audioTracks,
        event.tracks,
    ];

    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        // A valid track list has at least one entry
        if (c && (c.length > 0 || Object.keys(c).length > 0)) return c;
    }
    return null;
}

// ─── plugin entry ────────────────────────────────────────────────────────────

function init() {
    $ui.register(function (ctx) {

        // ── Tray icon ──────────────────────────────────────────────────────
        var tray = ctx.newTray({
            tooltipText: "Auto English Audio",
            iconUrl: "https://seanime.rahim.app/logo_2.png",
            withContent: false,
        });

        // Status state drives the tray badge / tooltip
        var status = ctx.state("Waiting for playback...");

        function setStatus(msg: string) {
            status.set(msg);
            tray.updateBadge({ text: msg.length > 0 ? "●" : "" });
        }

        // ── Per-episode state ──────────────────────────────────────────────
        // We use a simple flag so the can-play fallback knows whether the
        // metadata handler already did the job.
        var appliedThisEpisode = ctx.state(false);

        // ── Core logic ────────────────────────────────────────────────────

        /**
         * Try to find and select an English audio track from event data.
         * Returns true when a track was successfully targeted.
         */
        function tryApplyFromEvent(event: any): boolean {
            var rawTracks = extractAudioTracks(event);
            if (!rawTracks) return false;

            var enTrack = findEnglishTrack(rawTracks);
            if (!enTrack) {
                // Track list present but no English track — stay on default (JA)
                setStatus("No EN audio — playing JA");
                ctx.videoCore.showMessage("🎌 No English audio found — playing Japanese", 3000);
                appliedThisEpisode.set(true); // don't retry
                return false;
            }

            ctx.videoCore.setAudioTrack(enTrack.id);
            setStatus("EN audio selected (track " + enTrack.id + ")");
            ctx.videoCore.showMessage("🔊 Switched to English audio", 3000);
            appliedThisEpisode.set(true);
            return true;
        }

        // ── Event listeners ───────────────────────────────────────────────

        // PRIMARY: fires when HLS manifest + tracks are parsed
        ctx.videoCore.addEventListener("video-loaded-metadata", function (event) {
            // Reset for the new episode
            appliedThisEpisode.set(false);
            setStatus("Detecting audio tracks...");

            // Only act on online streaming
            var playbackType = ctx.videoCore.getCurrentPlaybackType();
            if (playbackType !== "onlinestream") {
                setStatus("Non-streaming — skipping");
                return;
            }

            tryApplyFromEvent(event);
        });

        // FALLBACK: fires ~500 ms after metadata; HLS may expose tracks here
        ctx.videoCore.addEventListener("video-can-play", function (event) {
            if (appliedThisEpisode.get()) return; // already handled above

            var playbackType = ctx.videoCore.getCurrentPlaybackType();
            if (playbackType !== "onlinestream") return;

            setStatus("Retrying track detection...");
            tryApplyFromEvent(event);
        });

        // CLEANUP: reset state when a new video starts loading
        ctx.videoCore.addEventListener("video-loaded", function (_event) {
            appliedThisEpisode.set(false);
            setStatus("Loading...");
        });

        setStatus("Ready");
    });
}
