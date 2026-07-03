/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
//
// On every online-streaming episode:
//   • If English dub exists  → switch audio to EN, turn subtitles OFF
//   • If only JA audio exists → keep JA audio, turn English subtitles ON

function init() {
    $ui.register(function(ctx) {

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

        // Find the index of the English subtitle track using getTextTracks()
        function getEnglishSubIndex() {
            try {
                var tracks = ctx.videoCore.getTextTracks();
                if (!tracks || tracks.length === 0) return 0;
                for (var i = 0; i < tracks.length; i++) {
                    var t     = tracks[i];
                    var lang  = String(t.language || t.lang || "");
                    var label = String(t.label    || t.name || "");
                    if (isEnglish(lang, label)) {
                        return typeof t.index === "number" ? t.index : i;
                    }
                }
                // No explicit English found — return first track index
                var first = tracks[0];
                return typeof first.index === "number" ? first.index : 0;
            } catch(e) {
                return 0;
            }
        }

        function enableEnglishSubs() {
            var idx = getEnglishSubIndex();
            ctx.videoCore.setSubtitleTrack(idx);
        }

        // ── Phase state ────────────────────────────────────────────────────
        // 0 = idle
        // 1 = sent first sendGetAudioTrack(), waiting for event response
        // 2 = just called setAudioTrack(); waiting for change event OR timer
        // 3 = sent second sendGetAudioTrack() to verify; waiting for event
        var phase     = 0;
        var jaTrackId = 0;

        function applyDub() {
            phase = 0;
            ctx.videoCore.setSubtitleTrack(-1);
            ctx.videoCore.showMessage("English dub — subtitles off", 3000);
        }
        function applySub(revertAudio) {
            phase = 0;
            if (revertAudio) ctx.videoCore.setAudioTrack(jaTrackId);
            enableEnglishSubs();
            ctx.videoCore.showMessage("No dub — English subtitles on", 3000);
        }

        // ── Audio event handler ────────────────────────────────────────────
        function onAudioEvent(event) {
            if (!event) return;
            var lang  = String(event.language || event.lang  || "");
            var label = String(event.label    || event.name  || "");
            var id    = typeof event.id    === "number" ? event.id    :
                        typeof event.index === "number" ? event.index : -1;

            if (phase === 1) {
                // First check: what track are we currently on?
                if (isEnglish(lang, label)) { applyDub(); return; }
                // On JA — try switching to the other track
                jaTrackId  = id >= 0 ? id : 1;
                var target = (jaTrackId === 0) ? 1 : 0;
                phase      = 2;
                phase2Tick = masterTick;
                ctx.videoCore.setAudioTrack(target);
                return;
            }

            if (phase === 2) {
                // Spontaneous audio-track-changed event right after setAudioTrack()
                if (isEnglish(lang, label)) { applyDub(); return; }
                applySub(true);
                return;
            }

            if (phase === 3) {
                // Verification response
                if (isEnglish(lang, label)) { applyDub(); return; }
                applySub(true);
                return;
            }
        }

        ctx.videoCore.addEventListener("audio-track",         onAudioEvent);
        ctx.videoCore.addEventListener("audio-track-changed", onAudioEvent);
        ctx.videoCore.addEventListener("current-audio-track", onAudioEvent);
        ctx.videoCore.addEventListener("audiotrack",          onAudioEvent);

        // ── Master timer ───────────────────────────────────────────────────
        // One interval drives all timeouts so we never need clearInterval.
        var masterTick  = 0;
        var phase1Tick  = -1;
        var phase2Tick  = -1;
        var fallbackDone = false;

        ctx.setInterval(function() {
            masterTick++;

            // Phase-1 timeout (1.5 s): sendGetAudioTrack() never responded
            // → Safe fallback: keep audio as-is, enable English subs
            if (phase === 1 && phase1Tick >= 0 &&
                masterTick - phase1Tick >= 3 && !fallbackDone) {
                fallbackDone = true;
                phase = 0;
                // Wait one more tick so HLS subtitle tracks are fully loaded
                var subPending = true;
                ctx.setInterval(function() {
                    if (!subPending) return;
                    subPending = false;
                    enableEnglishSubs();
                    ctx.videoCore.showMessage("No dub detected — English subtitles on", 3000);
                }, 600);
                return;
            }

            // Phase-2 timeout (0.7 s): audio-track-changed never fired
            // → Request current track manually to verify the switch
            if (phase === 2 && phase2Tick >= 0 &&
                masterTick - phase2Tick >= 2) {
                phase = 3;
                ctx.videoCore.sendGetAudioTrack();
            }
        }, 500);

        // ── Video lifecycle ────────────────────────────────────────────────
        function resetState() {
            phase        = 0;
            fallbackDone = false;
            phase1Tick   = -1;
            phase2Tick   = -1;
        }
        ctx.videoCore.addEventListener("video-loaded-metadata", resetState);
        ctx.videoCore.addEventListener("video-loaded",          resetState);

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (phase !== 0) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;
            phase      = 1;
            phase1Tick = masterTick;
            ctx.videoCore.sendGetAudioTrack();
        });
    });
}
