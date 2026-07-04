/// <reference path="./plugin.d.ts" />

// Auto English Audio — DIAGNOSTIC v2
// Inspects subtitleTracks and onlinestreamParams from getCurrentPlaybackInfo()

function init() {
    $ui.register(function(ctx) {

        function truncate(s, n) {
            var str = String(s || "");
            return str.length > n ? str.substring(0, n) + "..." : str;
        }

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;

            ctx.videoCore.setAudioTrack(0);

            var ticks = 0;
            ctx.setInterval(function() {
                ticks++;
                if (ticks !== 2) return;

                try {
                    var pi = ctx.videoCore.getCurrentPlaybackInfo();

                    // Show subtitleTracks
                    var st = pi && pi.subtitleTracks;
                    ctx.videoCore.showMessage(
                        "subtitleTracks: " + truncate(JSON.stringify(st), 150),
                        8000
                    );

                    // Show onlinestreamParams
                    var op = pi && pi.onlinestreamParams;
                    ctx.videoCore.showMessage(
                        "onlinestreamParams: " + truncate(JSON.stringify(op), 150),
                        8000
                    );

                    // Show selectedVideoSource
                    var vs = pi && pi.selectedVideoSource;
                    ctx.videoCore.showMessage(
                        "selectedVideoSource: " + truncate(JSON.stringify(vs), 150),
                        8000
                    );

                } catch(e) {
                    ctx.videoCore.showMessage("Error: " + e.message, 4000);
                }
            }, 400);
        });
    });
}
