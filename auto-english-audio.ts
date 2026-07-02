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

        // Switch to English audio AND disable subtitles
        function activateEnglishDub(audioTrackId) {
            ctx.videoCore.setAudioTrack(audioTrackId);
            ctx.videoCore.setTextTrack(-1);  // -1 = subtitles off
            ctx.videoCore.showMessage("English dub — subtitles off", 3000);
        }

        // Called when sendGetAudioTrack() responds with the current track info
        function handleCurrentTrack(event) {
            if (switchLock || !event) return;
            switchLock = true;

            var lang  = String(event.language || event.lang  || "");
            var label = String(event.label    || event.name  || "");
            var id    = typeof event.id    === "number" ? event.id    :
                        typeof event.index === "number" ? event.index : -1;

            if (isEnglish(lang, label)) {
                // Already on English dub — just make sure subs are off
                ctx.videoCore.setTextTrack(-1);
                ctx.videoCore.showMessage("English dub active — subtitles off", 2000);
                return;
            }

            // Currently on JA or unknown — switch to the other track
            var target = (id === 0) ? 1 : 0;
            activateEnglishDub(target);
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
                if (ticks !== 2 || fallbackFired) return;
                fallbackFired = true;

                if (!switchLock) {
                    switchLock = true;
                    activateEnglishDub(0); // EN is track 0 on most providers
                }
            }, 500);
        });
    });
}
