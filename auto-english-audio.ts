/// <reference path="./plugin.d.ts" />

// Auto English Audio — DIAGNOSTIC VERSION
// Shows debug OSD messages to reveal what data the player exposes.
// This helps identify the correct API for dub detection.

function init() {
    $ui.register(function(ctx) {

        var isOnlineStream = false;
        var audioDetermined = false;

        function truncate(s, n) {
            var str = String(s || "");
            return str.length > n ? str.substring(0, n) + "..." : str;
        }

        function safeKeys(obj) {
            try { return Object.keys(obj || {}).join(","); } catch(e) { return "err"; }
        }

        function isEnglish(lang, label) {
            var l = (lang  || "").toLowerCase().trim();
            var b = (label || "").toLowerCase().trim();
            return l === "en" || l === "eng" || l.indexOf("en-") === 0 ||
                   b === "english" || b === "dub" || b === "dubbed" ||
                   b.indexOf("english") !== -1 || b.indexOf("dub") !== -1;
        }

        // ── Catch every possible audio event and show what it contains ─────
        var audioEventNames = [
            "audio-track","audio-track-changed","audio-track-switched",
            "audio-track-loaded","audio-tracks-updated","audio-tracks",
            "current-audio-track","audiotrack","hlsAudioTrackSwitched",
            "hlsAudioTracksUpdated","hls-audio-tracks-updated"
        ];

        for (var ai = 0; ai < audioEventNames.length; ai++) {
            (function(evtName) {
                ctx.videoCore.addEventListener(evtName, function(event) {
                    if (!isOnlineStream) return;
                    var info = evtName + ": " + truncate(JSON.stringify(event), 120);
                    ctx.videoCore.showMessage(info, 6000);
                });
            })(audioEventNames[ai]);
        }

        // ── On video-can-play: inspect sync state methods ──────────────────
        ctx.videoCore.addEventListener("video-can-play", function() {
            isOnlineStream = ctx.videoCore.getCurrentPlaybackType() === "onlinestream";
            if (!isOnlineStream) return;

            audioDetermined = false;

            // 1. Switch to track 0 (EN if dub exists)
            ctx.videoCore.setAudioTrack(0);

            // 2. Show what getTextTracks() returns
            try {
                var tt = ctx.videoCore.getTextTracks();
                ctx.videoCore.showMessage(
                    "textTracks(" + tt.length + "): " + truncate(JSON.stringify(tt[0]), 80),
                    5000
                );
            } catch(e) {
                ctx.videoCore.showMessage("getTextTracks err: " + e.message, 3000);
            }

            // 3. After 800ms: inspect getPlaybackState and getCurrentPlaybackInfo
            var ticks = 0;
            ctx.setInterval(function() {
                ticks++;
                if (ticks !== 2) return; // fire once at ~800ms

                // getPlaybackState
                try {
                    var s = ctx.videoCore.getPlaybackState();
                    ctx.videoCore.showMessage(
                        "playbackState keys: " + safeKeys(s) +
                        " | playbackInfo keys: " + safeKeys(s && s.playbackInfo),
                        6000
                    );
                } catch(e) {
                    ctx.videoCore.showMessage("getPlaybackState err: " + e.message, 3000);
                }

                // getCurrentPlaybackInfo
                try {
                    var pi = ctx.videoCore.getCurrentPlaybackInfo();
                    ctx.videoCore.showMessage(
                        "playbackInfo keys: " + safeKeys(pi), 6000
                    );
                } catch(e) {
                    ctx.videoCore.showMessage("getCurrentPlaybackInfo err: " + e.message, 3000);
                }
            }, 400);
        });

        ctx.videoCore.addEventListener("video-loaded-metadata", function() {
            isOnlineStream = false;
            audioDetermined = false;
        });
    });
}
