/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
// Switches to English audio and disables subtitles when dub is available.

function init() {
    $ui.register(function(ctx) {

        var switchLock    = false;
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

        // Switch audio to English and disable subtitles
        function activateEnglishDub(audioTrackId) {
            ctx.videoCore.setAudioTrack(audioTrackId);
            ctx.videoCore.setSubtitleTrack(-1);   // -1 = Off
            ctx.videoCore.showMessage("English dub — subtitles off", 3000);
        }

        // Response handler for sendGetAudioTrack()
        function handleAudioTrackResponse(event) {
            if (switchLock || !event) return;
            switchLock = true;

            var lang  = String(event.language || event.lang  || "");
            var label = String(event.label    || event.name  || "");
            var id    = typeof event.id    === "number" ? event.id    :
                        typeof event.index === "number" ? event.index : -1;

            if (isEnglish(lang, label)) {
                // Already on English — just kill subtitles
                ctx.videoCore.setSubtitleTrack(-1);
                ctx.videoCore.showMessage("English dub active — subtitles off", 2000);
                return;
            }

            // On JA or unknown — switch to the other track index
            var target = (id === 0) ? 1 : 0;
            activateEnglishDub(target);
        }

        // Listen on all plausible event names for sendGetAudioTrack() response
        ctx.videoCore.addEventListener("audio-track",         handleAudioTrackResponse);
        ctx.videoCore.addEventListener("audio-track-changed", handleAudioTrackResponse);
        ctx.videoCore.addEventListener("current-audio-track", handleAudioTrackResponse);
        ctx.videoCore.addEventListener("audiotrack",          handleAudioTrackResponse);

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

            // Ask the player what audio track is active — handled by listeners above
            ctx.videoCore.sendGetAudioTrack();

            // Blind fallback: if no response within ~1 s, try track 0
            var ticks = 0;
            ctx.setInterval(function() {
                ticks += 1;
                if (ticks !== 2 || fallbackFired) return;
                fallbackFired = true;
                if (!switchLock) {
                    switchLock = true;
                    activateEnglishDub(0);
                }
            }, 500);
        });
    });
}
