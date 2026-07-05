/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
//
// Real detection method (no more guessing):
//  1. pullStatus() → gives us the actual HLS master.m3u8 URL being played
//  2. fetch() that manifest directly, parse #EXT-X-MEDIA:TYPE=AUDIO lines
//  3. This gives the TRUE audio track list with real language codes, in the
//     exact order hls.js indexes them — so setAudioTrack(index) is no longer
//     a blind guess.
//  4. English track found  → switch to it, disable subtitles
//  5. No English track     → leave JA audio, enable English subtitles instead
//  6. If the fetch/parse fails for any reason → falls back to a single gentle
//     heuristic attempt (never repeated, never able to crash playback)

function init() {
    $ui.register(function(ctx) {

        var handled = false;

        function isEnglish(lang, label) {
            var l = (lang  || "").toLowerCase().trim();
            var b = (label || "").toLowerCase().trim();
            return l === "en" || l.indexOf("en-") === 0 || l === "eng" ||
                   b === "english" || b.indexOf("english") !== -1 ||
                   b === "dub" || b === "dubbed" || b.indexOf("dub") !== -1;
        }

        // Parse #EXT-X-MEDIA:TYPE=AUDIO lines from a raw m3u8 manifest.
        // Track order in the manifest = hls.js's internal audioTrack index order.
        function parseAudioTracks(manifestText) {
            var tracks = [];
            var lines = manifestText.split("\n");
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (line.indexOf("#EXT-X-MEDIA:") === 0 && line.indexOf("TYPE=AUDIO") !== -1) {
                    var nameMatch = line.match(/NAME="([^"]*)"/);
                    var langMatch = line.match(/LANGUAGE="([^"]*)"/);
                    tracks.push({
                        index: tracks.length,
                        name: nameMatch ? nameMatch[1] : "",
                        language: langMatch ? langMatch[1] : ""
                    });
                }
            }
            return tracks;
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

        // Last-resort fallback if the manifest fetch/parse fails outright.
        // Fires ONCE, never repeats, cannot cause the key-load crash from before.
        function gentleFallback() {
            try {
                var pi    = ctx.videoCore.getCurrentPlaybackInfo();
                var subs  = (pi && pi.subtitleTracks) || [];
                var count = Array.isArray(subs) ? subs.length : 0;
                if (count > 0 && count < 3) {
                    ctx.videoCore.setAudioTrack(0);
                    ctx.videoCore.setSubtitleTrack(-1);
                    ctx.videoCore.showMessage("Auto audio track 0 (fallback)", 3000);
                } else {
                    enableEnglishSubtitles();
                    ctx.videoCore.showMessage("Subtitles on (fallback)", 3000);
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

            (async function() {
                try {
                    var status = await ctx.videoCore.pullStatus();
                    var manifestUrl = status && status.id;
                    if (!manifestUrl) { gentleFallback(); return; }

                    var res  = await fetch(manifestUrl);
                    var text = await res.text();
                    var tracks = parseAudioTracks(text);

                    if (tracks.length === 0) {
                        // No multi-audio info in manifest at all — nothing to switch
                        return;
                    }

                    var enTrack = null;
                    for (var i = 0; i < tracks.length; i++) {
                        if (isEnglish(tracks[i].language, tracks[i].name)) { enTrack = tracks[i]; break; }
                    }

                    if (enTrack) {
                        ctx.videoCore.setAudioTrack(enTrack.index);
                        ctx.videoCore.setSubtitleTrack(-1);
                        ctx.videoCore.showMessage(
                            "English dub found (" + tracks.length + " tracks) — subtitles off", 3000
                        );
                    } else {
                        enableEnglishSubtitles();
                        ctx.videoCore.showMessage(
                            "No English dub (" + tracks.length + " tracks) — subtitles on", 3000
                        );
                    }
                } catch (e) {
                    gentleFallback();
                }
            })();
        });
    });
}
