/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
//
// Detection order:
//  1. Known-provider override — some providers (e.g. aq-anizone) embed every
//     audio language in one HLS stream regardless of what their own
//     "dubbed" flag says. For these, always treat as dub-available.
//  2. Otherwise, subtitle-track-count heuristic as a general fallback.
//
// Add more provider names to KNOWN_MULTI_AUDIO_PROVIDERS below if you hit
// the same issue elsewhere — just add the provider's name string.

function init() {
    $ui.register(function(ctx) {

        var KNOWN_MULTI_AUDIO_PROVIDERS = ["aq-anizone"];
        var handled = false;

        function isEnglish(lang, label) {
            var l = (lang  || "").toLowerCase().trim();
            var b = (label || "").toLowerCase().trim();
            return l === "en" || l.indexOf("en-") === 0 || l === "eng" ||
                   b === "english" || b.indexOf("english") !== -1 ||
                   b === "dub" || b === "dubbed" || b.indexOf("dub") !== -1;
        }

        function isKnownMultiAudioProvider(name) {
            if (!name) return false;
            var n = String(name).toLowerCase();
            for (var i = 0; i < KNOWN_MULTI_AUDIO_PROVIDERS.length; i++) {
                if (n === KNOWN_MULTI_AUDIO_PROVIDERS[i].toLowerCase()) return true;
            }
            return false;
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

            var ticks = 0;
            ctx.setInterval(function() {
                ticks++;
                if (ticks !== 2) return; // ~700ms delay before touching subtitles

                var pi       = null;
                var count    = 0;
                var provider = null;
                try {
                    pi       = ctx.videoCore.getCurrentPlaybackInfo();
                    var subs = (pi && pi.subtitleTracks) || [];
                    count    = Array.isArray(subs) ? subs.length : 0;
                    provider = pi && pi.onlinestreamParams && pi.onlinestreamParams.provider;
                } catch(e) {}

                if (isKnownMultiAudioProvider(provider)) {
                    disableSubtitlesRetried();
                    ctx.videoCore.showMessage("English dub (" + provider + ") — subtitles off", 3000);
                } else if (count > 0 && count < 3) {
                    disableSubtitlesRetried();
                    ctx.videoCore.showMessage("English dub — subtitles off", 3000);
                } else {
                    enableEnglishSubtitles();
                    ctx.videoCore.showMessage("No dub — English subtitles on", 3000);
                }
            }, 350);
        });
    });
}
