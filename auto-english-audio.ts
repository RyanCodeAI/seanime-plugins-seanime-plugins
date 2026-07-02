/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin

function init() {
    $ui.register(function(ctx) {

        var switchLock = false;
        var fallbackFired = false;

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

        // Called when sendGetAudioTrack() responds with the current track info
        function handleCurrentTrack(event) {
            if (switchLock || !event) return;
            switchLock = true; // claim the lock immediately

            var lang  = String(event.language || event.lang  || "");
            var label = String(event.label    || event.name  || "");
            var id    = typeof event.id    === "number" ? event.id    :
                        typeof event.index === "number" ? event.index : -1;

            if (isEnglish(lang, label)) {
                ctx.videoCore.showMessage("English audio is already active", 2000);
                return;
            }

            // Currently JA or unknown — switch to the other track index
            var target = (id === 0) ? 1 : 0;
            ctx.videoCore.setAudioTrack(target);
            ctx.videoCore.showMessage("Switched to English audio", 3000);
        }

        // Listen on all plausible event names for the sendGetAudioTrack() response
        ctx.videoCore.addEventListener("audio-track",         handleCurrentTrack);
        ctx.videoCore.addEventListener("audio-track-changed", handleCurrentTrack);
        ctx.videoCore.addEventListener("current-audio-track", handleCurrentTrack);
        ctx.videoCore.addEventListener("audiotrack",          handleCurrentTrack);

        // Reset flags on every new video
        ctx.videoCore.addEventListener("video-loaded-metadata", function() {
            switchLock    = false;
            fallbackFired = false;
        });
        ctx.videoCore.addEventListener("video-loaded", function() {
            switchLock    = false;
            fallbackFired = false;
        });

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (switchLock) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;

            // Ask the player what track is active — response handled above
            ctx.videoCore.sendGetAudioTrack();

            // Blind fallback: fire once after ~1 s if no response arrived
            var ticks = 0;
            ctx.setInterval(function() {
                ticks += 1;

                // Only act on the 2nd tick (~1 s) and only once
                if (ticks !== 2 || fallbackFired) return;
                fallbackFired = true;

                if (!switchLock) {
                    switchLock = true;
                    // From the audio picker screenshot EN is index 0 on most providers
                    ctx.videoCore.setAudioTrack(0);
                    ctx.videoCore.showMessage("Auto-selected English audio (track 0)", 3000);
                }
            }, 500);
        });
    });
}
