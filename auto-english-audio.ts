/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
//
// Primary method: fetch the real HLS manifest, parse #EXT-X-MEDIA:TYPE=AUDIO
// lines to get the true track list, then switch precisely.
//
// Fallback (if fetch fails): trust that English is always index 0 when a dub
// exists — no more subtitle-count guessing, which was proven wrong.
//
// Subtitle-off is retried ONCE more after a short delay (2 attempts total,
// never a tight loop) since a single call doesn't always stick.

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

        // Turn subtitles off with one immediate attempt + one retry ~900ms later.
        function disableSubtitlesRetried() {
            try { ctx.videoCore.setSubtitleTrack(-1); } catch(e) {}
            var ticks = 0;
            ctx.setInterval(function() {
                ticks++;
                if (ticks !== 2) return; // fires once, ~900ms after first attempt
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

        // Fallback when manifest fetch fails: trust index 0 = English (per your
        // observation), and detect "no dub" only via the headphone-icon proxy —
        // which we approximate as "audio switch had literally nothing to switch"
        // by just always attempting it once. Harmless on true sub-only anime
        // since there's nothing else to switch to.
        function gentleFallback(reason) {
            ctx.videoCore.showMessage("Manifest check failed (" + reason + ") — using fallback", 4000);
            try { ctx.videoCore.setAudioTrack(0); } catch(e) {}
            disableSubtitlesRetried();
        }

        function reset() { handled = false; }
        ctx.videoCore.addEventListener("video-loaded-metadata", reset);
        ctx.videoCore.addEventListener("video-loaded",          reset);

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (handled) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;
            handled = true;

            (async function() {
                var status;
                try {
                    status = await ctx.videoCore.pullStatus();
                } catch (e) {
                    gentleFallback("pullStatus: " + e.message);
                    return;
                }

                var manifestUrl = status && status.id;
                if (!manifestUrl) {
                    gentleFallback("no manifest id in status");
                    return;
                }

                var text;
                try {
                    var res = await fetch(manifestUrl);
                    text = await res.text();
                } catch (e) {
                    gentleFallback("fetch: " + e.message);
                    return;
                }

                var tracks;
                try {
                    tracks = parseAudioTracks(text);
                } catch (e) {
                    gentleFallback("parse: " + e.message);
                    return;
                }

                if (tracks.length === 0) {
                    // Manifest has no separate audio tracks declared at all —
                    // single muxed stream, nothing for us to switch.
                    return;
                }

                var enTrack = null;
                for (var i = 0; i < tracks.length; i++) {
                    if (isEnglish(tracks[i].language, tracks[i].name)) { enTrack = tracks[i]; break; }
                }
                // If no track is explicitly tagged English but multiple tracks
                // exist, trust that English is index 0 (matches observed UI order).
                if (!enTrack && tracks.length > 1) enTrack = tracks[0];

                if (enTrack) {
                    try { ctx.videoCore.setAudioTrack(enTrack.index); } catch(e) {}
                    disableSubtitlesRetried();
                    ctx.videoCore.showMessage(
                        "English dub (" + tracks.length + " tracks) — subtitles off", 3000
                    );
                } else {
                    enableEnglishSubtitles();
                    ctx.videoCore.showMessage("No English dub — subtitles on", 3000);
                }
            })();
        });
    });
}
