/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
//
// Logic:
//  1. On video-can-play (online streaming): ask for current audio track
//  2. If already EN  → disable subtitles, done
//  3. If JA          → try switching to the other track index
//  4. After 700 ms   → ask again to verify
//  5. If now EN      → disable subtitles  ✓ (dub available)
//  6. If still JA    → revert + enable English subtitles  ✓ (sub-only anime)

function init() {
    $ui.register(function(ctx) {

        // ── Phase state ────────────────────────────────────────────────────
        // 0 = idle
        // 1 = waiting for first sendGetAudioTrack() response
        // 2 = switched; waiting for audio-track-changed OR verify timer
        // 3 = waiting for second sendGetAudioTrack() response
        var phase     = 0;
        var jaTrackId = 0;   // the JA track we came from (so we can revert)

        // ── Helpers ────────────────────────────────────────────────────────
        function isEnglish(lang, label) {
            var l = (lang  || "").toLowerCase().trim();
            var b = (label || "").toLowerCase().trim();
            return l === "en" || l === "eng" || l.indexOf("en-") === 0 ||
                   b === "english" || b === "dub" || b === "dubbed" ||
                   b.indexOf("english") !== -1 || b.indexOf("dub") !== -1;
        }
        function isJapanese(lang, label) {
            var l = (lang  || "").toLowerCase().trim();
            var b = (label || "").toLowerCase().trim();
            return l === "ja" || l === "jpn" || l === "jp" ||
                   b === "japanese" || b === "sub" || b === "subtitled";
        }

        function applyDub() {
            ctx.videoCore.setSubtitleTrack(-1);
            ctx.videoCore.showMessage("English dub — subtitles off", 3000);
        }
        function applySub() {
            ctx.videoCore.setAudioTrack(jaTrackId);   // back to JA
            ctx.videoCore.setSubtitleTrack(0);        // first subtitle track (English)
            ctx.videoCore.showMessage("No dub — English subtitles on", 3000);
        }

        // ── Audio event handler ────────────────────────────────────────────
        // Handles responses from sendGetAudioTrack() AND spontaneous
        // audio-track-changed events that fire when setAudioTrack() is called.

        function onAudioEvent(event) {
            if (!event) return;

            var lang  = String(event.language || event.lang  || "");
            var label = String(event.label    || event.name  || "");
            var id    = typeof event.id    === "number" ? event.id    :
                        typeof event.index === "number" ? event.index : -1;

            // ── Phase 1: first response after video-can-play ──────────────
            if (phase === 1) {
                phase = 0;

                if (isEnglish(lang, label)) {
                    applyDub();
                    return;
                }

                // On JA — attempt switch to the other track
                jaTrackId = id >= 0 ? id : 1;
                var target = (jaTrackId === 0) ? 1 : 0;
                phase      = 2;
                phase2Tick = masterTick;   // start the verify countdown
                ctx.videoCore.setAudioTrack(target);

                // If audio-track-changed doesn't fire automatically,
                // the master interval will trigger phase-3 verification.
                return;
            }

            // ── Phase 2: spontaneous event after setAudioTrack() ──────────
            // Some players fire audio-track-changed immediately on switch.
            if (phase === 2) {
                phase = 0;
                if (isEnglish(lang, label)) {
                    applyDub();
                } else {
                    applySub(); // switch did nothing — no dub available
                }
                return;
            }

            // ── Phase 3: response to the verification sendGetAudioTrack() ─
            if (phase === 3) {
                phase = 0;
                if (isEnglish(lang, label)) {
                    applyDub();
                } else {
                    applySub();
                }
                return;
            }
        }

        // Listen on all plausible event names
        ctx.videoCore.addEventListener("audio-track",         onAudioEvent);
        ctx.videoCore.addEventListener("audio-track-changed", onAudioEvent);
        ctx.videoCore.addEventListener("current-audio-track", onAudioEvent);
        ctx.videoCore.addEventListener("audiotrack",          onAudioEvent);

        // ── Timers ─────────────────────────────────────────────────────────
        // A single master interval (every 350 ms) drives two timeouts:
        //   • phase-1 fallback  after ~1.05 s (3 ticks)
        //   • phase-2 verify    after ~0.70 s (2 ticks) from when switching started

        var masterTick    = 0;
        var phase1Tick    = -1;   // tick when phase-1 started
        var phase2Tick    = -1;   // tick when phase-2 started
        var fallbackDone  = false;

        ctx.setInterval(function() {
            masterTick++;

            // phase-1 fallback: if sendGetAudioTrack() never responded
            if (phase === 1 && phase1Tick >= 0 && masterTick - phase1Tick >= 3) {
                if (!fallbackDone) {
                    fallbackDone = true;
                    phase = 0;
                    // Safe default: try track 0 and enable subs
                    ctx.videoCore.setAudioTrack(0);
                    ctx.videoCore.setSubtitleTrack(0);
                    ctx.videoCore.showMessage("Auto track 0 + EN subtitles (fallback)", 3000);
                }
                return;
            }

            // phase-2 verify: if audio-track-changed never fired, ask manually
            if (phase === 2 && phase2Tick >= 0 && masterTick - phase2Tick >= 2) {
                phase = 3;
                ctx.videoCore.sendGetAudioTrack();
            }
        }, 350);

        // ── Video lifecycle ────────────────────────────────────────────────
        ctx.videoCore.addEventListener("video-loaded-metadata", function() {
            phase        = 0;
            fallbackDone = false;
            phase1Tick   = -1;
            phase2Tick   = -1;
        });
        ctx.videoCore.addEventListener("video-loaded", function() {
            phase        = 0;
            fallbackDone = false;
            phase1Tick   = -1;
            phase2Tick   = -1;
        });

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (phase !== 0) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;

            phase        = 1;
            phase1Tick   = masterTick;
            phase2Tick   = -1;
            fallbackDone = false;
            ctx.videoCore.sendGetAudioTrack();
        });

    });
}
