/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
//
// Detection strategy using getCurrentPlaybackInfo():
//  • subtitleTracks.length < 3  → dub stream  → set track 0 (EN) + disable subs
//  • subtitleTracks.length >= 3 → sub stream  → do nothing (Seanime already picked EN subs)
//
// Fallback if subtitleTracks unavailable: try onlinestreamParams for dubbed flag

function init() {
    $ui.register(function(ctx) {

        var done = false;

        function isEnglish(lang, label) {
            var l = (lang  || "").toLowerCase().trim();
            var b = (label || "").toLowerCase().trim();
            return l === "en" || l === "eng" || l.indexOf("en-") === 0 ||
                   b === "english" || b === "dub" || b === "dubbed" ||
                   b.indexOf("english") !== -1 || b.indexOf("dub") !== -1;
        }

        function reset() { done = false; }
        ctx.videoCore.addEventListener("video-loaded-metadata", reset);
        ctx.videoCore.addEventListener("video-loaded",          reset);

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (done) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;
            done = true;

            try {
                var pi = ctx.videoCore.getCurrentPlaybackInfo();

                // ── Try onlinestreamParams for explicit dub flag ───────────
                var op = pi && pi.onlinestreamParams;
                if (op) {
                    var dubByParam =
                        op.dubbed === true ||
                        op.isDub  === true ||
                        String(op.audioLanguage || "").toLowerCase().indexOf("en") === 0 ||
                        String(op.language      || "").toLowerCase().indexOf("en") === 0 ||
                        String(op.audio         || "").toLowerCase() === "dub" ||
                        String(op.audio         || "").toLowerCase() === "dubbed";

                    var subByParam =
                        op.dubbed === false ||
                        op.isDub  === false ||
                        String(op.audioLanguage || "").toLowerCase().indexOf("ja") === 0 ||
                        String(op.language      || "").toLowerCase().indexOf("ja") === 0 ||
                        String(op.audio         || "").toLowerCase() === "sub";

                    if (dubByParam && !subByParam) {
                        ctx.videoCore.setAudioTrack(0);
                        ctx.videoCore.setSubtitleTrack(-1);
                        ctx.videoCore.showMessage("English dub — subtitles off", 3000);
                        return;
                    }
                    if (subByParam && !dubByParam) {
                        // Sub stream — Seanime default is already EN subs on JA audio
                        ctx.videoCore.showMessage("Sub stream — EN subtitles active", 2000);
                        return;
                    }
                }

                // ── Fallback: use subtitle track count as heuristic ────────
                // Dub streams typically have 0–2 subtitle options
                // Sub streams typically have 3+ subtitle language options
                var subTracks  = (pi && pi.subtitleTracks) || [];
                var trackCount = Array.isArray(subTracks) ? subTracks.length : 0;

                if (trackCount === 0 || trackCount < 3) {
                    // Likely dub
                    ctx.videoCore.setAudioTrack(0);
                    ctx.videoCore.setSubtitleTrack(-1);
                    ctx.videoCore.showMessage(
                        "English dub (" + trackCount + " sub tracks) — subtitles off", 3000
                    );
                } else {
                    // Likely sub — Seanime already selected EN subs, do nothing
                    ctx.videoCore.showMessage(
                        "Sub stream (" + trackCount + " sub tracks) — EN subs active", 2000
                    );
                }

            } catch(e) {
                // Last resort: just switch audio
                ctx.videoCore.setAudioTrack(0);
                ctx.videoCore.showMessage("Audio → track 0 (detection failed)", 2000);
            }
        });
    });
}
