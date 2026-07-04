/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
// Uses sendGetAudioTrack() to detect the current track language,
// then switches to English if Japanese is playing.

function init() {
    $ui.register(function(ctx) {

        // Lock to prevent double-switching per episode
        var switchLock = false;

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

        // Called when we get a response from sendGetAudioTrack().
        // If the current track is JA, we switch to the other index.
        function handleCurrentTrack(event) {
            if (switchLock || !event) return;

            var lang  = String(event.language || event.lang  || "");
            var label = String(event.label    || event.name  || "");
            var id    = typeof event.id    === "number" ? event.id    :
                        typeof event.index === "number" ? event.index : -1;

            if (isEnglish(lang, label)) {
                // Already English — nothing to do
                switchLock = true;
                ctx.videoCore.showMessage("English audio is already active", 2000);
                return;
            }

            if (isJapanese(lang, label) || lang !== "") {
                // Currently Japanese (or another non-EN language).
                // Switch to the OTHER track index.
                switchLock = true;
                var target = (id === 0) ? 1 : 0;
                ctx.videoCore.setAudioTrack(target);
                ctx.videoCore.showMessage("Switched to English audio", 3000);
                return;
            }

            // Language info missing from the event — use blind fallback below
        }

        // sendGetAudioTrack() fires one of these event names with the current track
        ctx.videoCore.addEventListener("audio-track",         handleCurrentTrack);
        ctx.videoCore.addEventListener("audio-track-changed", handleCurrentTrack);
        ctx.videoCore.addEventListener("current-audio-track", handleCurrentTrack);
        ctx.videoCore.addEventListener("audiotrack",          handleCurrentTrack);

        // Reset on every new video load
        ctx.videoCore.addEventListener("video-loaded-metadata", function() {
            switchLock = false;
        });

        ctx.videoCore.addEventListener("video-loaded", function() {
            switchLock = false;
        });

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (switchLock) return;
            var type = ctx.videoCore.getCurrentPlaybackType();
            if (type !== "onlinestream") return;

            // Ask the player what audio track is currently active.
            // The response arrives via one of the listeners above.
            ctx.videoCore.sendGetAudioTrack();

            // Blind fallback: if no response arrives within 1 second,
            // try track 0 first (screenshot shows EN is track 0 on most providers).
            // If track 0 is actually JA (some providers swap the order),
            // the user will need to bump the number below to 1.
            var waited = 0;
            var fallbackId = ctx.setInterval(function() {
                waited += 1;
                if (switchLock || waited < 2) return;   // wait 2 ticks = ~1 s
                ctx.clearInterval(fallbackId);
                if (!switchLock) {
                    switchLock = true;
                    ctx.videoCore.setAudioTrack(0);
                    ctx.videoCore.showMessage("Auto-selected audio track 0 (fallback)", 3000);
                }
            }, 500);
        });
    });
}
