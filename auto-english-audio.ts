/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
//
// IMPORTANT: every videoCore call below fires AT MOST ONCE per episode.
// Earlier versions retried setSubtitleTrack() in a tight loop, which caused
// HLS "keyLoadError" crashes on encrypted/multi-dub streams by yanking the
// track mid key-load. This version never repeats a call.

function init() {
    $ui.register(function(ctx) {

        var handled = false;

        function safe(fn) {
            try { fn(); } catch (e) { /* swallow — never let one failed call break playback */ }
        }

        function reset() { handled = false; }
        ctx.videoCore.addEventListener("video-loaded-metadata", reset);
        ctx.videoCore.addEventListener("video-loaded",          reset);

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (handled) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;
            handled = true;

            // ── Step 1 (immediate): best-effort dub detection via subtitle count ──
            // This heuristic is imperfect (breaks on titles with many parallel
            // dubs AND many subtitle languages) but is the best signal available
            // without an official "list audio tracks" API.
            var likelyHasDub = true; // default assumption
            safe(function() {
                var pi = ctx.videoCore.getCurrentPlaybackInfo();
                var subs = (pi && pi.subtitleTracks) || [];
                var count = Array.isArray(subs) ? subs.length : 0;
                likelyHasDub = count > 0 && count < 3;
            });

            // ── Step 2 (~500ms later): ONE audio switch attempt ──────────────
            var ticks = 0;
            ctx.setInterval(function() {
                ticks++;

                if (ticks === 1) {
                    if (likelyHasDub) {
                        safe(function() { ctx.videoCore.setAudioTrack(0); });
                    }
                    return;
                }

                // ── Step 3 (~1s later): ONE subtitle action, then stop forever ──
                if (ticks === 2) {
                    if (likelyHasDub) {
                        safe(function() { ctx.videoCore.setSubtitleTrack(-1); });
                        ctx.videoCore.showMessage("English dub — subtitles off", 3000);
                    } else {
                        // Sub-only: get the real track list (properly awaited this time)
                        safe(function() {
                            var maybePromise = ctx.videoCore.getTextTracks();
                            if (maybePromise && typeof maybePromise.then === "function") {
                                maybePromise.then(function(tracks) {
                                    if (tracks && tracks.length > 0) {
                                        safe(function() { ctx.videoCore.setSubtitleTrack(tracks[0].index); });
                                    }
                                }).catch(function() {});
                            }
                        });
                        ctx.videoCore.showMessage("No dub — English subtitles on", 3000);
                    }

                    // ── Step 4: one safety-net resume in case a switch stalled it ──
                    safe(function() { ctx.videoCore.resume(); });
                }
            }, 500);
        });
    });
}
