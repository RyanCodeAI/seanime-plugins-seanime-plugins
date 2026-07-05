/// <reference path="./plugin.d.ts" />

// DIAGNOSTIC ONLY — does not switch audio or subtitles.
// Purely inspects getPlaybackState() and pullStatus() to find real audio track data.

function init() {
    $ui.register(function(ctx) {

        function safeKeys(o) { try { return Object.keys(o || {}).join(","); } catch(e) { return "err:" + e.message; } }
        function safeStr(o, n) {
            try {
                var s = JSON.stringify(o);
                if (!s) return "null";
                return s.length > n ? s.substring(0, n) + "..." : s;
            } catch(e) { return "err:" + e.message; }
        }

        var done = false;
        ctx.videoCore.addEventListener("video-loaded-metadata", function() { done = false; });
        ctx.videoCore.addEventListener("video-loaded",          function() { done = false; });

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (done) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;
            done = true;

            // 1. Top-level getPlaybackState() keys — BEFORE requesting anything
            try {
                var s1 = ctx.videoCore.getPlaybackState();
                ctx.videoCore.showMessage("STATE keys: " + safeKeys(s1), 8000);
                if (s1 && s1.audioTrack) {
                    ctx.videoCore.showMessage("STATE.audioTrack: " + safeStr(s1.audioTrack, 200), 8000);
                }
            } catch(e) {
                ctx.videoCore.showMessage("getPlaybackState err: " + e.message, 4000);
            }

            // 2. pullStatus() — forces a fresh read directly from the player
            try {
                var p = ctx.videoCore.pullStatus();
                if (p && typeof p.then === "function") {
                    p.then(function(status) {
                        ctx.videoCore.showMessage("pullStatus keys: " + safeKeys(status), 8000);
                        ctx.videoCore.showMessage("pullStatus dump: " + safeStr(status, 300), 9000);
                    }).catch(function(e) {
                        ctx.videoCore.showMessage("pullStatus rejected: " + e, 4000);
                    });
                } else {
                    ctx.videoCore.showMessage("pullStatus dump: " + safeStr(p, 300), 9000);
                }
            } catch(e) {
                ctx.videoCore.showMessage("pullStatus err: " + e.message, 4000);
            }

            // 3. Request an audio track refresh, then re-check state shortly after
            try { ctx.videoCore.sendGetAudioTrack(); } catch(e) {}

            var ticks = 0;
            ctx.setInterval(function() {
                ticks++;
                if (ticks !== 2) return; // fire once, ~700ms later
                try {
                    var s2 = ctx.videoCore.getPlaybackState();
                    ctx.videoCore.showMessage("STATE keys AFTER request: " + safeKeys(s2), 8000);
                    if (s2 && s2.audioTrack) {
                        ctx.videoCore.showMessage("STATE.audioTrack AFTER: " + safeStr(s2.audioTrack, 200), 8000);
                    }
                } catch(e) {
                    ctx.videoCore.showMessage("getPlaybackState err2: " + e.message, 4000);
                }
            }, 350);
        });
    });
}
