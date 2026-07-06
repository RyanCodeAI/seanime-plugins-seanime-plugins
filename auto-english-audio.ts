/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin (diagnostic build)
//
// Same core logic as before (always try track 0, count-based subtitle
// fallback), PLUS one new safe diagnostic: dumps the actual content of
// onlinestreamParams, a field we've confirmed exists but never inspected.
// It may directly contain provider-declared dub/sub info.

function init() {
    $ui.register(function(ctx) {

        var handled = false;

        function safeStr(o, n) {
            try {
                var s = JSON.stringify(o);
                if (!s) return "null";
                return s.length > n ? s.substring(0, n) + "..." : s;
            } catch(e) { return "err:" + e.message; }
        }

        function isEnglish(lang, label) {
            var l = (lang  || "").toLowerCase().trim();
            var b = (label || "").toLowerCase().trim();
            return l === "en" || l.indexOf("en-") === 0 || l === "eng" ||
                   b === "english" || b.indexOf("english") !== -1 ||
                   b === "dub" || b === "dubbed" || b.indexOf("dub") !== -1;
        }

        function disableSubtitlesRetried() {
            try { ctx.videoCore.setSubtitleTrack(-1); } catch(e) {}
            var ticks = 0;
            ctx.setInterval(function() {
                ticks++;
                if (ticks !== 2) return;
                try { ctx.videoCore.setSubtitleTrack(-1); } catch(e) {}
            }, 450);
        }

        function enableEnglishSubtitles() {
            try {
                var p = ctx.videoCore.getTextTracks();
                if (p && typeof p.then === "function") {
                    p.then(function(tracks) {
                        if (!tracks || tracks.length === 0) return;
                        var target = tracks[0];
                        for (var i = 0; i < tracks.length; i++) {
                            var lang  = String(tracks[i].language || tracks[i].lang  || "");
                            var label = String(tracks[i].label    || tracks[i].name  || "");
                            if (isEnglish(lang, label)) { target = tracks[i]; break; }
                        }
                        try { ctx.videoCore.setSubtitleTrack(target.index); } catch(e) {}
                    }).catch(function() {});
                }
            } catch(e) {}
        }

        function reset() { handled = false; }
        ctx.videoCore.addEventListener("video-loaded-metadata", reset);
        ctx.videoCore.addEventListener("video-loaded",          reset);

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (handled) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;
            handled = true;

            try { ctx.videoCore.setAudioTrack(0); } catch(e) {}

            var pi    = null;
            var count = 0;
            try {
                pi    = ctx.videoCore.getCurrentPlaybackInfo();
                var subs = (pi && pi.subtitleTracks) || [];
                count = Array.isArray(subs) ? subs.length : 0;
            } catch(e) {}

            // NEW: show exactly what's inside onlinestreamParams
            try {
                ctx.videoCore.showMessage(
                    "onlinestreamParams: " + safeStr(pi && pi.onlinestreamParams, 250), 8000
                );
            } catch(e) {}

            // Same interim behavior as before, using subtitle count
            if (count > 0 && count < 3) {
                disableSubtitlesRetried();
                ctx.videoCore.showMessage("English dub — subtitles off", 3000);
            } else {
                enableEnglishSubtitles();
                ctx.videoCore.showMessage("No dub — English subtitles on", 3000);
            }
        });
    });
}
