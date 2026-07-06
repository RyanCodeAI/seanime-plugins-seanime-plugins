/// <reference path="./plugin.d.ts" />

// DIAGNOSTIC — isolates ONE message: the raw content of onlinestreamParams.
// Shows for 20 seconds, nothing else fires. Same core behavior otherwise.

function init() {
    $ui.register(function(ctx) {

        var handled = false;

        function safeStr(o) {
            try {
                var s = JSON.stringify(o);
                return s ? s : "null";
            } catch(e) { return "ERROR: " + e.message; }
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

            // Give the player a moment to settle before touching subtitles —
            // may also help avoid the libass timing error you saw.
            var ticks = 0;
            ctx.setInterval(function() {
                ticks++;
                if (ticks !== 2) return; // fires once, ~700ms in

                var pi    = null;
                var count = 0;
                try {
                    pi    = ctx.videoCore.getCurrentPlaybackInfo();
                    var subs = (pi && pi.subtitleTracks) || [];
                    count = Array.isArray(subs) ? subs.length : 0;
                } catch(e) {}

                // THE ONE MESSAGE THAT MATTERS — isolated, 20 seconds on screen.
                // Please screenshot exactly this box.
                ctx.videoCore.showMessage(
                    "PARAMS: " + safeStr(pi && pi.onlinestreamParams),
                    20000
                );

                if (count > 0 && count < 3) {
                    disableSubtitlesRetried();
                } else {
                    enableEnglishSubtitles();
                }
            }, 350);
        });
    });
}
