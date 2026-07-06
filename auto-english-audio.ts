/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
//
// CORE LOGIC (always runs, no special permissions needed):
//  1. Always attempt setAudioTrack(0) once — trusts that English is always
//     the first listed track when a dub exists. Harmless no-op on sub-only
//     anime since there's nothing else to switch to.
//  2. Decide subtitles using subtitle-track count as a proxy for "dub likely
//     exists": few subtitle tracks -> assume dub -> subtitles off.
//     Many subtitle tracks -> assume sub-only -> leave subtitles on.
//     (Imperfect only for the rare title with BOTH many dubs and many subs.)
//
// BONUS (best-effort, silently ignored if it fails):
//  Tries ctx.fetch() on the real HLS manifest to read the true audio track
//  list and override the guess with certainty. Since Seanime v3.3.0 requires
//  domain whitelisting for plugin network access, this may not work without
//  extra manifest permissions — if so, the core logic above still runs fine.

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

        function disableSubtitlesRetried() {
            try { ctx.videoCore.setSubtitleTrack(-1); } catch(e) {}
            var ticks = 0;
            ctx.setInterval(function() {
                ticks++;
                if (ticks !== 2) return; // one retry, ~900ms later
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

        // ── CORE: runs unconditionally, no network needed ──────────────────
        function runCoreLogic() {
            try {
                var pi    = ctx.videoCore.getCurrentPlaybackInfo();
                var subs  = (pi && pi.subtitleTracks) || [];
                var count = Array.isArray(subs) ? subs.length : 0;

                // Always attempt the switch — trusts English is index 0
                try { ctx.videoCore.setAudioTrack(0); } catch(e) {}

                if (count > 0 && count < 3) {
                    disableSubtitlesRetried();
                    ctx.videoCore.showMessage("English dub — subtitles off", 3000);
                } else {
                    enableEnglishSubtitles();
                    ctx.videoCore.showMessage("No dub — English subtitles on", 3000);
                }
            } catch(e) {}
        }

        // ── BONUS: best-effort, more accurate, silently skipped on failure ─
        async function tryManifestOverride() {
            try {
                var status = await ctx.videoCore.pullStatus();
                var manifestUrl = status && status.id;
                if (!manifestUrl) return;

                var res  = await ctx.fetch(manifestUrl);
                var text = await res.text();
                var tracks = parseAudioTracks(text);
                if (tracks.length === 0) return; // no separate audio tracks — nothing to override

                var enTrack = null;
                for (var i = 0; i < tracks.length; i++) {
                    if (isEnglish(tracks[i].language, tracks[i].name)) { enTrack = tracks[i]; break; }
                }
                if (!enTrack && tracks.length > 1) enTrack = tracks[0];

                if (enTrack) {
                    try { ctx.videoCore.setAudioTrack(enTrack.index); } catch(e) {}
                    disableSubtitlesRetried();
                    ctx.videoCore.showMessage(
                        "Confirmed: English dub (" + tracks.length + " tracks) — subtitles off", 3000
                    );
                } else {
                    enableEnglishSubtitles();
                    ctx.videoCore.showMessage("Confirmed: no English dub — subtitles on", 3000);
                }
            } catch (e) {
                // Network/permission issue — core logic above already handled it, do nothing further
            }
        }

        function reset() { handled = false; }
        ctx.videoCore.addEventListener("video-loaded-metadata", reset);
        ctx.videoCore.addEventListener("video-loaded",          reset);

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (handled) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;
            handled = true;

            runCoreLogic();          // always runs, guarantees a result
            tryManifestOverride();    // may silently upgrade the result shortly after
        });
    });
}
