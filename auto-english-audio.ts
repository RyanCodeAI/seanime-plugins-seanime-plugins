/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
//
// Detection: getCurrentPlaybackInfo().subtitleTracks.length
//   < 3 tracks → dub stream  → switch to EN audio, keep disabling subs for 3s
//   ≥ 3 tracks → sub stream  → do nothing (Seanime already picked EN subs on JA audio)
//
// The subtitle disable is retried every 400ms for ~3s because Seanime can
// re-apply its default subtitle selection after video-can-play fires.

function init() {
    $ui.register(function(ctx) {

        var isDub          = false;
        var episodeActive  = false;
        var subKillTicks   = 0;
        var MSG_SHOWN      = false;

        // ── Master interval: keeps killing subs for dub anime ──────────────
        ctx.setInterval(function() {
            if (!isDub || !episodeActive) return;
            subKillTicks++;
            ctx.videoCore.setSubtitleTrack(-1);

            if (subKillTicks === 1 && !MSG_SHOWN) {
                MSG_SHOWN = true;
                ctx.videoCore.showMessage("English dub — subtitles off", 3000);
            }

            // Stop after ~3 s (8 ticks × 400 ms)
            if (subKillTicks >= 8) {
                isDub = false; // stop the loop
            }
        }, 400);

        // ── Reset on every new episode ─────────────────────────────────────
        function reset() {
            isDub         = false;
            episodeActive = false;
            subKillTicks  = 0;
            MSG_SHOWN     = false;
        }
        ctx.videoCore.addEventListener("video-loaded-metadata", reset);
        ctx.videoCore.addEventListener("video-loaded",          reset);

        // ── Main logic on video-can-play ───────────────────────────────────
        ctx.videoCore.addEventListener("video-can-play", function() {
            if (episodeActive) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;
            episodeActive = true;

            try {
                var pi        = ctx.videoCore.getCurrentPlaybackInfo();
                var subTracks = (pi && pi.subtitleTracks) || [];
                var count     = Array.isArray(subTracks) ? subTracks.length : 0;

                if (count < 3) {
                    // Dub stream: switch to track 0 (EN) and start killing subs
                    isDub        = true;
                    subKillTicks = 0;
                    ctx.videoCore.setAudioTrack(0);
                    ctx.videoCore.setSubtitleTrack(-1); // first immediate attempt
                } else {
                    // Sub stream: Seanime already shows EN subs on JA audio — do nothing
                    ctx.videoCore.showMessage("Sub stream — EN subtitles active", 2000);
                }
            } catch(e) {
                // Detection failed — fallback: switch audio only
                ctx.videoCore.setAudioTrack(0);
                ctx.videoCore.showMessage("Audio → EN track (detection failed)", 2000);
            }
        });
    });
}
